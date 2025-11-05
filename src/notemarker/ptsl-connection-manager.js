const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const EventEmitter = require('events');
const log = require('electron-log');
const path = require('path');
const PTSLMessageBuilder = require('./ptsl-message-builder.js');
const { PTSLErrorHandler, PTSL_ERROR_TYPES } = require('./ptsl-error-handler.js');
// Import generated protobuf definitions for creating message instances
const ptslProto = require('./ptsl-proto.js');

// Connection States
const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    REGISTERING: 'registering',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
};

// Additional connection-specific error types (extending the imported ones)
const CONNECTION_ERROR_TYPES = {
    PRO_TOOLS_NOT_RUNNING: 'PRO_TOOLS_NOT_RUNNING',
    PTSL_DISABLED: 'PTSL_DISABLED',
    VERSION_MISMATCH: 'VERSION_MISMATCH',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    REGISTRATION_FAILED: 'REGISTRATION_FAILED',
    HEARTBEAT_FAILED: 'HEARTBEAT_FAILED'
};

/**
 * PTSL Connection Manager
 * Handles gRPC connection lifecycle with streams, heartbeats, and reconnection
 */
class PTSLConnectionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.host = options.host || 'localhost';
        this.port = options.port || 31416;
        this.companyName = options.companyName || 'alternatone';
        this.applicationName = options.applicationName || 'notemarker';
        
        // Connection state
        this.state = CONNECTION_STATE.DISCONNECTED;
        this.sessionId = null;
        this.grpcClient = null;
        this.channel = null;
        
        // Reconnection settings
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        this.baseReconnectDelay = 1000; // 1 second
        this.maxReconnectDelay = 30000;  // 30 seconds
        this.reconnectTimer = null;
        
        // Heartbeat settings
        this.heartbeatInterval = 30000; // 30 seconds
        this.heartbeatTimer = null;
        this.heartbeatFailures = 0;
        this.maxHeartbeatFailures = 3;
        
        // Message builder and error handler (proto will be set after loadGrpcService)
        this.messageBuilder = new PTSLMessageBuilder();
        this.errorHandler = new PTSLErrorHandler();
        
        // Connection monitoring
        this.connectionStartTime = null;
        this.lastHeartbeat = null;
        this.isShuttingDown = false;
        this.isManualDisconnect = false;
        
        // Statistics
        this.stats = {
            connectionAttempts: 0,
            successfulConnections: 0,
            heartbeatsSent: 0,
            heartbeatFailures: 0,
            totalReconnections: 0
        };
        
        this.setupEventHandlers();
        this.setupShutdownHandlers();
        
        log.info('PTSLConnectionManager initialized', {
            host: this.host,
            port: this.port,
            heartbeatInterval: this.heartbeatInterval
        });
    }
    
    /**
     * Setup event handlers for connection monitoring
     */
    setupEventHandlers() {
        this.on('state-changed', (newState, oldState) => {
            log.info(`Connection state changed: ${oldState} → ${newState}`);
        });
        
        this.on('connected', () => {
            this.stats.successfulConnections++;
            this.reconnectAttempts = 0;
            this.heartbeatFailures = 0;
            this.startHeartbeat();
        });
        
        this.on('disconnected', () => {
            this.stopHeartbeat();
            // Only auto-reconnect if not manually disconnected, not shutting down, and haven't exceeded max attempts
            if (!this.isShuttingDown && !this.isManualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        });
        
        this.on('registration-failed', () => {
            this.setState(CONNECTION_STATE.FAILED);
        });
    }
    
    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        const cleanup = async () => {
            if (!this.isShuttingDown) {
                this.isShuttingDown = true;
                log.info('Graceful shutdown initiated');
                await this.disconnect();
            }
        };
        
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('beforeExit', cleanup);
        
        // Electron-specific shutdown
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.addEventListener('beforeunload', cleanup);
        }
    }
    
    /**
     * Create gRPC channel with proper keepalive settings
     */
    createGrpcChannel() {
        try {
            log.debug('Creating gRPC channel with keepalive settings');
            
            const channelOptions = {
                // Keepalive settings
                'grpc.keepalive_time_ms': 30000,           // Send keepalive every 30s
                'grpc.keepalive_timeout_ms': 5000,         // Wait 5s for keepalive response
                'grpc.keepalive_permit_without_calls': true, // Allow keepalive without active calls
                'grpc.http2.max_pings_without_data': 0,    // No limit on pings without data
                'grpc.http2.min_time_between_pings_ms': 10000, // Min 10s between pings
                'grpc.http2.min_ping_interval_without_data_ms': 300000, // 5 min without data
                
                // Connection settings
                'grpc.max_connection_idle_ms': 60000,      // Close idle connections after 1 min
                'grpc.max_connection_age_ms': 300000,      // Max connection age 5 min
                'grpc.max_connection_age_grace_ms': 10000, // Grace period for closing
                'grpc.http2.max_frame_size': 4194304,      // 4MB max frame size
                
                // Retry settings
                'grpc.initial_reconnect_backoff_ms': 1000, // Initial backoff 1s
                'grpc.max_reconnect_backoff_ms': 30000,    // Max backoff 30s
                'grpc.enable_retries': 1                   // Enable retries
            };
            
            this.channel = new grpc.Channel(
                `${this.host}:${this.port}`,
                grpc.credentials.createInsecure(),
                channelOptions
            );
            
            log.debug('gRPC channel created successfully');
            return true;
            
        } catch (error) {
            log.error('Failed to create gRPC channel:', error);
            throw error;
        }
    }
    
    /**
     * Load gRPC service definition
     */
    async loadGrpcService() {
        try {
            const protoPath = path.join(__dirname, '..', 'proto', 'PTSL.proto');
            
            const packageDefinition = protoLoader.loadSync(protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
            
            const proto = grpc.loadPackageDefinition(packageDefinition);
            
            // Store proto definitions for creating message instances
            this.proto = proto;
            this.ptslProto = ptslProto.ptsl;
            
            // Update message builder with proto definitions for creating instances
            this.messageBuilder.setProtoDefinitions(this.ptslProto);
            
            // Create gRPC client with target string
            this.grpcClient = new proto.ptsl.PTSL(
                `${this.host}:${this.port}`,
                grpc.credentials.createInsecure()
            );
            
            log.debug('gRPC service loaded successfully');
            return true;
            
        } catch (error) {
            log.error('Failed to load gRPC service:', error);
            throw error;
        }
    }
    
    /**
     * Set connection state and emit events
     */
    setState(newState) {
        const oldState = this.state;
        if (oldState !== newState) {
            this.state = newState;
            this.emit('state-changed', newState, oldState);
        }
    }
    
    /**
     * Connect to Pro Tools with full connection lifecycle
     */
    async connect() {
        if (this.state === CONNECTION_STATE.CONNECTED) {
            log.debug('Already connected to Pro Tools');
            return true;
        }
        
        if (this.state === CONNECTION_STATE.CONNECTING || this.state === CONNECTION_STATE.REGISTERING) {
            log.debug('Connection already in progress');
            return new Promise((resolve, reject) => {
                this.once('connected', () => resolve(true));
                this.once('connection-failed', reject);
            });
        }
        
        this.connectionStartTime = Date.now();
        this.stats.connectionAttempts++;
        
        try {
            this.setState(CONNECTION_STATE.CONNECTING);
            
            // Reset manual disconnect flag when connecting
            this.isManualDisconnect = false;
            
            log.info('Initiating connection to Pro Tools PTSL', {
                host: this.host,
                port: this.port,
                attempt: this.reconnectAttempts + 1
            });
            
            // Create gRPC channel and client
            this.createGrpcChannel();
            await this.loadGrpcService();
            
            // Wait for channel to be ready
            await this.waitForChannelReady();
            
            // Register with Pro Tools
            this.setState(CONNECTION_STATE.REGISTERING);
            await this.registerConnection();
            
            // Verify connection with initial heartbeat
            await this.performHeartbeat();
            
            this.setState(CONNECTION_STATE.CONNECTED);
            this.emit('connected');
            
            log.info('Successfully connected to Pro Tools', {
                sessionId: this.sessionId,
                connectionTime: Date.now() - this.connectionStartTime
            });
            
            return true;
            
        } catch (error) {
            this.setState(CONNECTION_STATE.FAILED);
            
            // Log the raw error details before processing
            log.error('Raw connection error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack,
                name: error.name
            });
            
            // Use comprehensive error handler
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'connect',
                retryFunction: () => this.connect()
            });
            
            log.error('Connection failed:', handledError);
            
            this.emit('connection-failed', handledError);
            
            // Handle specific error types
            await this.handleConnectionError(handledError);
            
            throw handledError;
        }
    }
    
    /**
     * Wait for gRPC channel to be ready
     */
    async waitForChannelReady(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            
            const checkReady = () => {
                const state = this.channel.getConnectivityState(true);
                
                if (state === grpc.connectivityState.READY) {
                    resolve();
                } else if (Date.now() > deadline) {
                    reject(new Error(`Channel not ready within ${timeout}ms, state: ${state}`));
                } else {
                    // Wait for state change
                    this.channel.watchConnectivityState(state, deadline, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            setTimeout(checkReady, 100);
                        }
                    });
                }
            };
            
            checkReady();
        });
    }
    
    /**
     * Register connection with Pro Tools
     */
    async registerConnection() {
        try {
            log.debug('Registering connection with Pro Tools');
            
            const request = this.messageBuilder.buildRegisterConnectionRequest();
            this.messageBuilder.validateMessage(request);
            
            const response = await this.sendGrpcRequest(request);
            
            // Check for errors in the response first (errors are in JSON body, not header)
            // Note: We'll parse JSON first and check for errors there
            
            // Parse JSON response body for RegisterConnection (using snake_case field name due to keepCase: true)
            let responseBody = {};
            if (response.response_body_json) {
                try {
                    responseBody = JSON.parse(response.response_body_json);
                } catch (parseError) {
                    log.error('Failed to parse response JSON:', parseError);
                    throw new Error('Invalid response JSON from server');
                }
            }
            
            // Check for errors in the response body
            if (responseBody.error_type) {
                throw new Error(`Registration failed: ${responseBody.error_message || 'Unknown error'}`);
            }
            
            if (responseBody.session_id) {
                this.sessionId = responseBody.session_id;
                log.info('Registration successful', { sessionId: this.sessionId });
            } else {
                throw new Error('No session ID received from registration');
            }
            
        } catch (error) {
            log.error('Registration failed:', error);
            
            // Use error handler for registration failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'register',
                retryFunction: () => this.registerConnection()
            });
            
            this.emit('registration-failed', handledError);
            throw handledError;
        }
    }
    
    /**
     * Send gRPC request with proper error handling
     */
    async sendGrpcRequest(request, timeout = 10000) {
        if (!this.grpcClient) {
            throw new Error('gRPC client not available');
        }
        
        // TRACE POINT 2: Inside sendGrpcRequest - log what's being passed to the grpc call
        log.debug('🔍 TRACE[2] Inside sendGrpcRequest - received request:', {
            commandId: request.header?.command || 'unknown',
            taskId: request.header?.task_id || 'unknown',
            hasHeader: !!request.header,
            headerSessionId: request.header?.session_id,
            requestKeys: Object.keys(request),
            fullRequest: request,
            connectionManagerSessionId: this.sessionId
        });
        
        return new Promise((resolve, reject) => {
            try {
                // Step 1: Validate request object structure
                if (!request || typeof request !== 'object') {
                    const error = new Error('Invalid request object');
                    log.error('❌ CRITICAL: Invalid request object', { request });
                    reject(error);
                    return;
                }
                
                // Step 2: Store original header info for emergency reconstruction
                let originalCommandId = request.header?.command;
                let originalTaskId = request.header?.task_id;
                
                // Emergency header reconstruction if header is missing or corrupted
                if (!request.header) {
                    log.error('🚨 EMERGENCY: Request missing header - attempting reconstruction!', {
                        requestKeys: Object.keys(request),
                        hasOriginalCommand: !!originalCommandId
                    });
                    
                    // Try to infer command from request body type
                    if (!originalCommandId) {
                        if (request.getTrackListRequestBody) originalCommandId = 3; // GetTrackList
                        else if (request.createMemoryLocationRequestBody) originalCommandId = 56; // CreateMemoryLocation
                        else if (request.request_body_json) {
                            try {
                                const bodyJson = JSON.parse(request.request_body_json);
                                if (bodyJson.company_name) originalCommandId = 70; // RegisterConnection
                            } catch (e) {}
                        }
                    }
                    
                    if (originalCommandId) {
                        request.header = this.messageBuilder.createEmergencyHeader(
                            originalCommandId,
                            this.sessionId,
                            originalTaskId
                        );
                        log.warn('🔧 Emergency header reconstruction successful');
                    } else {
                        const error = new Error('Cannot reconstruct header - unknown command type');
                        log.error('💥 FATAL: Unable to determine command type for header reconstruction', {
                            requestKeys: Object.keys(request)
                        });
                        reject(error);
                        return;
                    }
                }
                
                // Step 3: Validate header structure
                const header = request.header;
                if (!header.task_id || !header.command) {
                    const error = new Error(`Request header invalid for commandId ${header.command || 'unknown'}`);
                    log.error('❌ CRITICAL: Request header missing required fields!', {
                        commandId: header.command || 'unknown',
                        headerKeys: Object.keys(header),
                        header: header,
                        hasTaskId: !!header.task_id,
                        hasCommand: !!header.command
                    });
                    reject(error);
                    return;
                }
                
                // Step 4: Add session ID if available and not already set (async safety with double-check)
                const needsSessionId = this.sessionId && (!header.session_id || header.session_id === '');
                if (needsSessionId) {
                    // Double-check request still has header after async operations
                    if (!request.header) {
                        const error = new Error(`Request header became null during async processing for commandId ${header.command}`);
                        log.error('❌ CRITICAL: Request header became null during processing!', { commandId: header.command });
                        reject(error);
                        return;
                    }
                    
                    this.messageBuilder.setSessionId(request, this.sessionId);
                    log.debug('🔍 TRACE[2a] Session ID added to request:', {
                        commandId: header.command,
                        beforeSessionId: header.session_id,
                        afterSessionId: this.sessionId,
                        headerAfterSessionId: request.header?.session_id
                    });
                }
                
                // Step 5: Final header validation before gRPC call
                if (!request.header || !request.header.task_id || !request.header.command) {
                    const error = new Error(`Final header validation failed for commandId ${header.command}`);
                    log.error('❌ CRITICAL: Final header validation failed!', {
                        commandId: header.command,
                        hasHeader: !!request.header,
                        hasTaskId: !!request.header?.task_id,
                        hasCommand: !!request.header?.command,
                        finalHeader: request.header
                    });
                    reject(error);
                    return;
                }
                
                // Step 6: Double-check header still exists (async safety)
                if (!request.header) {
                    const error = new Error(`Header became null during async processing for commandId ${header.command}`);
                    log.error('💥 FATAL: Header became null after initial reconstruction!', { 
                        commandId: header.command,
                        sessionId: this.sessionId
                    });
                    reject(error);
                    return;
                }
                
                // Step 7: Session ID assertion - ensure authentication is present
                if (this.sessionId && request.header.session_id !== this.sessionId) {
                    log.error('🚨 ASSERTION FAILED: Header session_id mismatch!', {
                        expectedSessionId: this.sessionId,
                        actualSessionId: request.header.session_id,
                        commandId: request.header.command,
                        taskId: request.header.task_id
                    });
                    
                    // Force correct session ID
                    request.header.session_id = this.sessionId;
                    
                    log.warn('🔧 Session ID corrected in header', {
                        commandId: request.header.command,
                        correctedSessionId: this.sessionId
                    });
                }
                
                // Step 8: Final assertion - no null headers allowed
                if (!request.header || !request.header.task_id || !request.header.command) {
                    const error = new Error(`ASSERTION FAILED: Request still missing header after all repairs for commandId ${request.header?.command || 'unknown'}`);
                    log.error('💥 FATAL: Unable to repair header - blocking request!', {
                        commandId: request.header?.command || 'unknown',
                        finalHeader: request.header,
                        sessionId: this.sessionId
                    });
                    reject(error);
                    return;
                }
                
                const deadline = Date.now() + timeout;
                
                // TRACE POINT 3: Right before the grpc service call - log the actual message being sent
                log.debug('🔍 TRACE[3] Right before grpc call - final request with validated header:', {
                    commandId: request.header.command,
                    taskId: request.header.task_id,
                    deadline: deadline,
                    headerValid: true,
                    headerTaskId: request.header.task_id,
                    headerCommand: request.header.command,
                    headerSessionId: request.header.session_id,
                    sessionIdMatches: request.header.session_id === this.sessionId,
                    hasRequestBody: !!(request.getTrackListRequestBody || request.createMemoryLocationRequestBody || request.request_body_json),
                    isProtobufInstance: request.isProtobufInstance || false,
                    defensiveProgrammingPassed: true
                });
            
                this.grpcClient.sendGrpcRequest(
                    request,
                    { deadline },
                    async (error, response) => {
                        if (error) {
                            log.debug('🔍 TRACE[4] gRPC call returned error:', {
                                commandId: request.header.command,
                                error: error.message,
                                errorCode: error.code
                            });
                            // Use error handler for gRPC request errors
                            try {
                                const handledError = await this.errorHandler.handleError(error, {
                                    operation: 'grpc_request',
                                    requestId: request.header.task_id,
                                    commandId: request.header.command
                                });
                                reject(handledError);
                            } catch (handlerError) {
                                reject(error); // Fallback to original error
                            }
                        } else {
                            log.debug('🔍 TRACE[4] gRPC call returned success:', {
                                commandId: request.header.command,
                                hasResponse: !!response
                            });
                            resolve(response);
                        }
                    }
                );
            } catch (error) {
                log.error('❌ CRITICAL: sendGrpcRequest failed during processing:', {
                    error: error.message,
                    stack: error.stack,
                    commandId: request.header?.command || 'unknown'
                });
                reject(error);
            }
        });
    }
    
    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Ensure no duplicate timers
        
        log.debug('Starting heartbeat monitoring', {
            interval: this.heartbeatInterval
        });
        
        this.heartbeatTimer = setInterval(async () => {
            try {
                await this.performHeartbeat();
            } catch (error) {
                log.warn('Heartbeat failed:', error);
                this.handleHeartbeatFailure(error);
            }
        }, this.heartbeatInterval);
    }
    
    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            log.debug('Heartbeat monitoring stopped');
        }
    }
    
    /**
     * Perform heartbeat check using HostReadyCheck
     */
    async performHeartbeat() {
        try {
            const request = this.messageBuilder.buildHostReadyCheckRequest();
            const response = await this.sendGrpcRequest(request, 5000);
            
            this.lastHeartbeat = Date.now();
            this.heartbeatFailures = 0;
            this.stats.heartbeatsSent++;
            
            log.debug('Heartbeat successful', {
                requestId: request.requestId,
                timestamp: this.lastHeartbeat
            });
            
            this.emit('heartbeat', { success: true, timestamp: this.lastHeartbeat });
            
        } catch (error) {
            this.heartbeatFailures++;
            this.stats.heartbeatFailures++;
            
            // Use error handler for heartbeat failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'heartbeat',
                retryFunction: () => this.performHeartbeat()
            });
            
            log.warn('Heartbeat failed', {
                failures: this.heartbeatFailures,
                maxFailures: this.maxHeartbeatFailures,
                error: handledError.userMessage
            });
            
            this.emit('heartbeat', { 
                success: false, 
                error: handledError, 
                failures: this.heartbeatFailures 
            });
            
            throw handledError;
        }
    }
    
    /**
     * Handle heartbeat failure
     */
    handleHeartbeatFailure(error) {
        if (this.heartbeatFailures >= this.maxHeartbeatFailures) {
            log.error(`Heartbeat failed ${this.heartbeatFailures} times, disconnecting`);
            this.emit('heartbeat-failed', error);
            this.disconnect();
        }
    }
    
    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.isShuttingDown || this.reconnectAttempts >= this.maxReconnectAttempts) {
            log.info('Not scheduling reconnect', {
                shuttingDown: this.isShuttingDown,
                attempts: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts
            });
            return;
        }
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        this.stats.totalReconnections++;
        
        // Exponential backoff with jitter
        const backoffMs = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );
        const jitterMs = Math.random() * 1000; // Add up to 1s jitter
        const delayMs = backoffMs + jitterMs;
        
        log.info(`Scheduling reconnection attempt ${this.reconnectAttempts}`, {
            delayMs: Math.round(delayMs),
            maxAttempts: this.maxReconnectAttempts
        });
        
        this.setState(CONNECTION_STATE.RECONNECTING);
        
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                log.error('Reconnection attempt failed:', error);
            }
        }, delayMs);
    }
    
    /**
     * Classify connection errors for graceful handling
     */
    classifyConnectionError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code;
        
        if (errorCode === grpc.status.UNAVAILABLE || errorMessage.includes('econnrefused')) {
            if (errorMessage.includes('ptsl') || errorMessage.includes('31416')) {
                return this.createError(CONNECTION_ERROR_TYPES.PTSL_DISABLED, error);
            } else {
                return this.createError(CONNECTION_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING, error);
            }
        } else if (errorCode === grpc.status.UNIMPLEMENTED || errorMessage.includes('version')) {
            return this.createError(CONNECTION_ERROR_TYPES.VERSION_MISMATCH, error);
        } else if (errorMessage.includes('registration')) {
            return this.createError(CONNECTION_ERROR_TYPES.REGISTRATION_FAILED, error);
        } else {
            return this.createError(CONNECTION_ERROR_TYPES.CONNECTION_FAILED, error);
        }
    }
    
    /**
     * Handle specific connection error types
     * Maps PTSL error types to connection-specific events for UI compatibility
     */
    async handleConnectionError(error) {
        // Map PTSL_ERROR_TYPES to legacy CONNECTION_ERROR_TYPES for backward compatibility
        let eventType = null;
        let eventMessage = error.userMessage || error.message;
        
        switch (error.type) {
            // Connection-related errors
            case PTSL_ERROR_TYPES.CONNECTION_REFUSED:
            case PTSL_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING:
                eventType = 'pro-tools-not-running';
                log.warn('Pro Tools is not running - will retry when available');
                break;
                
            case PTSL_ERROR_TYPES.PTSL_NOT_ENABLED:
                eventType = 'ptsl-disabled';
                log.warn('PTSL is disabled in Pro Tools preferences');
                break;
                
            case PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH:
            case PTSL_ERROR_TYPES.PTSL_VERSION_INCOMPATIBLE:
                eventType = 'version-mismatch';
                log.error('PTSL version mismatch - may need SDK update');
                break;
                
            case PTSL_ERROR_TYPES.REGISTRATION_FAILED:
                eventType = 'registration-failed';
                log.error('Failed to register with Pro Tools');
                break;
                
            case PTSL_ERROR_TYPES.CONNECTION_TIMEOUT:
                eventType = 'connection-timeout';
                log.warn('Connection to Pro Tools timed out');
                break;
                
            case PTSL_ERROR_TYPES.CONNECTION_LOST:
                eventType = 'connection-lost';
                log.warn('Connection to Pro Tools was lost');
                break;
                
            // Session-related errors
            case PTSL_ERROR_TYPES.SESSION_NOT_OPEN:
                eventType = 'session-not-open';
                log.warn('No Pro Tools session is currently open');
                break;
                
            case PTSL_ERROR_TYPES.SESSION_LOCKED:
                eventType = 'session-locked';
                log.warn('Pro Tools session is locked');
                break;
                
            case PTSL_ERROR_TYPES.SESSION_BUSY:
                eventType = 'session-busy';
                log.warn('Pro Tools is busy with another operation');
                break;
                
            // Authentication and permissions
            case PTSL_ERROR_TYPES.INSUFFICIENT_PRIVILEGES:
                eventType = 'insufficient-privileges';
                log.error('Insufficient privileges to perform operation');
                break;
                
            // Legacy connection error types for backward compatibility
            case CONNECTION_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING:
                eventType = 'pro-tools-not-running';
                log.warn('Pro Tools is not running - will retry when available');
                break;
                
            case CONNECTION_ERROR_TYPES.PTSL_DISABLED:
                eventType = 'ptsl-disabled';
                log.warn('PTSL is disabled in Pro Tools preferences');
                break;
                
            case CONNECTION_ERROR_TYPES.VERSION_MISMATCH:
                eventType = 'version-mismatch';
                log.error('PTSL version mismatch - may need SDK update');
                break;
                
            case CONNECTION_ERROR_TYPES.REGISTRATION_FAILED:
                eventType = 'registration-failed';
                log.error('Failed to register with Pro Tools');
                break;
                
            default:
                eventType = 'connection-error';
                log.error('Unhandled connection error:', {
                    type: error.type,
                    message: error.message,
                    category: error.category,
                    severity: error.severity
                });
        }
        
        // Emit the mapped event with enriched error information
        if (eventType) {
            const enrichedError = {
                ...error,
                eventType,
                timestamp: new Date().toISOString(),
                connectionAttempt: this.stats.connectionAttempts,
                reconnectAttempts: this.reconnectAttempts
            };
            
            this.emit(eventType, enrichedError);
            log.debug(`Emitted event: ${eventType}`, {
                errorType: error.type,
                severity: error.severity,
                recoverable: error.recoverable,
                actionSuggestions: error.actionSuggestions?.length || 0
            });
        }
    }
    
    /**
     * Classify connection error for gRPC compatibility
     * This method provides direct access to error classification used by tests
     */
    classifyConnectionError(error) {
        return this.errorHandler.classifyError(error, {
            operation: 'connection',
            connectionAttempt: this.stats.connectionAttempts,
            reconnectAttempts: this.reconnectAttempts
        });
    }
    
    /**
     * Disconnect from Pro Tools
     */
    async disconnect() {
        log.info('Disconnecting from Pro Tools');
        
        // Mark as manual disconnect to prevent auto-reconnection
        this.isManualDisconnect = true;
        
        this.stopHeartbeat();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.sessionId = null;
        this.lastHeartbeat = null;
        
        if (this.grpcClient) {
            try {
                this.grpcClient.close();
            } catch (error) {
                log.warn('Error closing gRPC client:', error);
            }
            this.grpcClient = null;
        }
        
        if (this.channel) {
            try {
                this.channel.close();
            } catch (error) {
                log.warn('Error closing gRPC channel:', error);
            }
            this.channel = null;
        }
        
        this.setState(CONNECTION_STATE.DISCONNECTED);
        this.emit('disconnected');
        
        log.info('Disconnected from Pro Tools');
    }
    
    /**
     * Create standardized error object
     */
    createError(type, originalError) {
        const errorMessages = {
            [CONNECTION_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING]: 'Pro Tools is not running',
            [CONNECTION_ERROR_TYPES.PTSL_DISABLED]: 'PTSL is not enabled in Pro Tools preferences',
            [CONNECTION_ERROR_TYPES.VERSION_MISMATCH]: 'PTSL version mismatch',
            [CONNECTION_ERROR_TYPES.CONNECTION_FAILED]: 'Failed to connect to Pro Tools',
            [CONNECTION_ERROR_TYPES.REGISTRATION_FAILED]: 'Failed to register with Pro Tools',
            [CONNECTION_ERROR_TYPES.HEARTBEAT_FAILED]: 'Heartbeat monitoring failed'
        };
        
        const error = new Error(errorMessages[type] || 'Unknown PTSL error');
        error.type = type;
        error.originalError = originalError;
        error.timestamp = new Date().toISOString();
        
        return error;
    }
    
    /**
     * Get connection status and statistics
     */
    getStatus() {
        return {
            state: this.state,
            isConnected: this.state === CONNECTION_STATE.CONNECTED,
            sessionId: this.sessionId,
            lastHeartbeat: this.lastHeartbeat,
            heartbeatFailures: this.heartbeatFailures,
            reconnectAttempts: this.reconnectAttempts,
            stats: { ...this.stats },
            uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
        };
    }
    
    /**
     * Get current session info
     */
    async getSessionInfo() {
        if (this.state !== CONNECTION_STATE.CONNECTED) {
            throw new Error('Not connected to Pro Tools');
        }
        
        try {
            // Use message builder for session info requests
            const sessionNameRequest = this.messageBuilder.buildGetSessionNameRequest();
            const sampleRateRequest = this.messageBuilder.buildGetSessionSampleRateRequest();
            const timecodeRateRequest = this.messageBuilder.buildGetSessionTimeCodeRateRequest();
            
            // TRACE POINT 1: Before calling sendGrpcRequest - log the full request object (WORKING COMMAND)
            log.debug('🔍 TRACE[1] Before calling sendGrpcRequest for GetSessionName (WORKING):', {
                commandId: sessionNameRequest.commandId,
                taskId: sessionNameRequest.taskId,
                sessionId: sessionNameRequest.sessionId,
                fullRequestObject: sessionNameRequest,
                isProtobufInstance: sessionNameRequest.isProtobufInstance || false
            });
            
            const [nameResponse, rateResponse, timecodeResponse] = await Promise.all([
                this.sendGrpcRequest(sessionNameRequest),
                this.sendGrpcRequest(sampleRateRequest),
                this.sendGrpcRequest(timecodeRateRequest)
            ]);
            
            // Parse JSON responses (same pattern as GetTrackList)
            let nameResponseBody = {};
            let rateResponseBody = {};
            let timecodeResponseBody = {};
            
            if (nameResponse.response_body_json) {
                try {
                    nameResponseBody = JSON.parse(nameResponse.response_body_json);
                } catch (e) { log.warn('Failed to parse session name response:', e); }
            }
            
            if (rateResponse.response_body_json) {
                try {
                    rateResponseBody = JSON.parse(rateResponse.response_body_json);
                } catch (e) { log.warn('Failed to parse sample rate response:', e); }
            }
            
            if (timecodeResponse.response_body_json) {
                try {
                    timecodeResponseBody = JSON.parse(timecodeResponse.response_body_json);
                    log.debug('Raw timecode response body:', timecodeResponseBody);
                } catch (e) { log.warn('Failed to parse timecode rate response:', e); }
            }
            
            log.debug('Raw timecode response:', { 
                response_body_json: timecodeResponse.response_body_json,
                parsedBody: timecodeResponseBody,
                fallbackBody: timecodeResponse.getSessionTimeCodeRateResponseBody
            });
            
            const ptslTimecodeFormat = timecodeResponseBody.current_setting || timecodeResponseBody.timecode_rate || timecodeResponse.getSessionTimeCodeRateResponseBody?.timeCodeRate || 'Fps25';
            const numericFrameRate = this._convertPTSLTimecodeToFrameRate(ptslTimecodeFormat);
            
            return {
                name: nameResponseBody.session_name || nameResponse.getSessionNameResponseBody?.sessionName || 'Unknown Session',
                sampleRate: rateResponseBody.sample_rate || rateResponse.getSessionSampleRateResponseBody?.sampleRate || 'SR_48000',
                timecodeFormat: ptslTimecodeFormat,
                frameRate: numericFrameRate,
                sessionId: this.sessionId,
                isConnected: true
            };
            
        } catch (error) {
            log.error('Failed to get session info:', error);
            
            // Use error handler for session info failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'get_session_info',
                retryFunction: () => this.getSessionInfo()
            });
            
            throw handledError;
        }
    }
    
    /**
     * Get track list from Pro Tools session - REBUILT FROM getSessionInfo pattern
     */
    async getTrackList() {
        if (this.state !== CONNECTION_STATE.CONNECTED) {
            throw new Error('Not connected to Pro Tools');
        }
        
        try {
            // Use message builder for track list request (exact same pattern as session info)
            const trackListRequest = this.messageBuilder.buildGetTrackListRequest();
            
            // TRACE POINT 1: Before calling sendGrpcRequest - log the full request object (WORKING PATTERN)
            log.debug('🔍 TRACE[1] Before calling sendGrpcRequest for GetTrackList (WORKING):', {
                commandId: trackListRequest.commandId,
                taskId: trackListRequest.taskId,
                sessionId: trackListRequest.sessionId,
                fullRequestObject: trackListRequest,
                isProtobufInstance: trackListRequest.isProtobufInstance || false
            });
            
            const trackListResponse = await this.sendGrpcRequest(trackListRequest);
            
            // DEBUG: Log the exact response structure
            log.debug('🔍 GetTrackList Response Structure Debug:', {
                hasResponse: !!trackListResponse,
                responseKeys: trackListResponse ? Object.keys(trackListResponse) : [],
                hasResponseBody: !!trackListResponse.getTrackListResponseBody,
                responseBodyKeys: trackListResponse.getTrackListResponseBody ? Object.keys(trackListResponse.getTrackListResponseBody) : [],
                fullResponseBody: trackListResponse.getTrackListResponseBody,
                rawResponse: trackListResponse
            });
            
            // Parse the JSON response body (same pattern as other commands)
            let responseBody = {};
            if (trackListResponse.response_body_json) {
                try {
                    responseBody = JSON.parse(trackListResponse.response_body_json);
                } catch (parseError) {
                    log.warn('Failed to parse GetTrackList response body JSON:', parseError);
                }
            }
            
            return {
                tracks: responseBody.tracks || [],
                totalCount: responseBody.total_count || responseBody.tracks?.length || 0,
                sessionId: this.sessionId,
                isConnected: true
            };
            
        } catch (error) {
            log.error('Failed to get track list:', error);
            
            // Use error handler for track list failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'get_track_list',
                retryFunction: () => this.getTrackList()
            });
            
            throw handledError;
        }
    }
    
    /**
     * Create memory location
     */
    async createMemoryLocation(name, timecode, comments = '', options = {}) {
        if (this.state !== CONNECTION_STATE.CONNECTED) {
            throw new Error('Not connected to Pro Tools');
        }
        
        // Initialize retry tracking and smart numbering
        const maxRetries = options.maxRetries || 3;
        let lastError = null;
        
        // Smart numbering strategy
        let currentNumber = null;
        if (options.number !== undefined) {
            // Explicit number provided
            currentNumber = options.number;
        } else if (options.useSmartNumbering) {
            // Get existing memory locations to find safe starting number
            try {
                const existingLocations = await this.getMemoryLocations();
                if (existingLocations.length > 0) {
                    // Find highest existing number and start from there + 1
                    const maxNumber = Math.max(...existingLocations
                        .map(loc => loc.number || 0)
                        .filter(num => typeof num === 'number' && num > 0));
                    currentNumber = maxNumber > 0 ? maxNumber + 1 : 1; // Start from 1 if no valid numbers found
                    log.debug('Using smart numbering starting from existing markers', {
                        existingCount: existingLocations.length,
                        maxExistingNumber: maxNumber,
                        startingNumber: currentNumber
                    });
                } else {
                    currentNumber = null; // Let Pro Tools auto-assign numbers when no markers found
                    log.debug('No existing markers detected, using automatic numbering');
                }
            } catch (error) {
                log.warn('Failed to get existing memory locations for smart numbering, using automatic assignment', {
                    error: error.message
                });
                currentNumber = null; // Fallback to automatic numbering
            }
        }
        // If currentNumber is still null, Pro Tools will auto-assign
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Use current number for this attempt (or let Pro Tools auto-assign if null)
                const attemptOptions = { ...options };
                if (currentNumber !== null) {
                    attemptOptions.number = currentNumber;
                }
                
                log.debug('Creating memory location attempt', {
                    name,
                    attempt: attempt + 1,
                    maxRetries: maxRetries + 1,
                    number: currentNumber,
                    timecode
                });
                
                return await this._attemptCreateMemoryLocation(name, timecode, comments, attemptOptions);
                
            } catch (error) {
                lastError = error;
                
                // Parse error to determine retry strategy
                const errorMessage = error.message.toLowerCase();
                
                if (errorMessage.includes('memory location number') && errorMessage.includes('already used')) {
                    // Number conflict - try next number
                    if (currentNumber !== null) {
                        currentNumber++;
                        log.warn('Memory location number conflict, retrying with next number', {
                            name,
                            attempt: attempt + 1,
                            previousNumber: currentNumber - 1,
                            nextNumber: currentNumber,
                            error: error.message
                        });
                        continue; // Try again with new number
                    } else {
                        // If we weren't using explicit numbers, this shouldn't happen
                        log.error('Unexpected number conflict without explicit numbering', {
                            name,
                            error: error.message
                        });
                        break; // Don't retry this type of error
                    }
                } else if (errorMessage.includes('timecode') || errorMessage.includes('time')) {
                    // Timecode conflict - could implement offset logic here
                    log.warn('Timecode conflict detected', {
                        name,
                        timecode,
                        attempt: attempt + 1,
                        error: error.message
                    });
                    // For now, don't retry timecode errors (could add offset logic later)
                    break;
                } else if (errorMessage.includes('session locked') || errorMessage.includes('read only')) {
                    // Session state errors - don't retry
                    log.error('Session state prevents marker creation', {
                        name,
                        error: error.message
                    });
                    break;
                } else {
                    // Other errors - retry with exponential backoff
                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
                        log.warn('Retrying memory location creation after error', {
                            name,
                            attempt: attempt + 1,
                            delay,
                            error: error.message
                        });
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
            }
        }
        
        // All retries failed
        throw new Error(`Failed to create memory location after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Single attempt to create memory location (extracted for retry logic)
     * @private
     */
    async _attemptCreateMemoryLocation(name, timecode, comments = '', options = {}) {
        try {
            const request = this.messageBuilder.buildCreateMemoryLocationRequest(name, timecode, comments, options);
            this.messageBuilder.validateMessage(request);
            
            const response = await this.sendGrpcRequest(request);
            
            // Enhanced error checking - check multiple possible error indicators
            if (response.responseError && response.responseError.errorType !== 0) {
                throw new Error(`Create memory location failed: ${response.responseError.errorMessage || 'Unknown PTSL error'}`);
            }
            
            // Check for Pro Tools JSON error format (response_error_json)
            // Only treat as error if it's not a warning
            if (response.response_error_json && response.response_error_json.trim()) {
                log.info('🔍 STEP 1: Found response_error_json, attempting to parse...');
                let errorData;
                try {
                    errorData = JSON.parse(response.response_error_json);
                    log.info('🔍 STEP 2: JSON parsing succeeded, errorData:', errorData);
                } catch (jsonParseError) {
                    // Only catch actual JSON parsing errors
                    log.warn('🔍 STEP 2: JSON parsing failed', { 
                        error: jsonParseError.message, 
                        rawJson: response.response_error_json 
                    });
                    
                    // Try to determine if this looks like an error vs warning
                    // If the JSON contains 'is_warning":true', don't throw
                    if (response.response_error_json.includes('"is_warning":true')) {
                        log.info('🔍 STEP 3: Response appears to contain warnings only (based on text analysis) - not throwing');
                        return; // Exit this error check section
                    } else {
                        // If we can't parse it and it doesn't look like warnings, treat as error
                        log.error('🔍 STEP 3: Throwing for unparseable non-warning JSON');
                        throw new Error(`Pro Tools returned error data: ${response.response_error_json}`);
                    }
                }
                
                log.info('🔍 STEP 3: Checking if errorData has errors array...');
                // JSON parsing succeeded, now check for actual errors vs warnings
                if (errorData.errors && errorData.errors.length > 0) {
                    // Debug: log all errors and their warning status
                    log.info('🔍 PTSL Error Analysis - Raw errors:', errorData.errors.map(err => ({
                        message: err.command_error_message,
                        type: err.command_error_type,
                        is_warning: err.is_warning,
                        is_warning_type: typeof err.is_warning
                    })));
                    
                    // Check if these are actual errors or just warnings
                    const actualErrors = errorData.errors.filter(error => !error.is_warning);
                    const warnings = errorData.errors.filter(error => error.is_warning);
                    
                    log.info('🔍 PTSL Error Analysis - Filtered results:', {
                        totalErrors: errorData.errors.length,
                        actualErrorCount: actualErrors.length,
                        warningCount: warnings.length,
                        actualErrors: actualErrors.map(e => e.command_error_message),
                        warnings: warnings.map(w => w.command_error_message)
                    });
                    
                    if (actualErrors.length > 0) {
                        const firstError = actualErrors[0];
                        log.info('🔍 PTSL Error Analysis - Throwing for actual error:', firstError);
                        throw new Error(`Pro Tools error: ${firstError.command_error_message} (${firstError.command_error_type})`);
                    } else {
                        // Only warnings - log them but don't throw
                        log.info('✅ Pro Tools warnings (non-blocking):', warnings.map(w => w.command_error_message));
                    }
                }
            }
            
            // Check if response indicates failure through other means
            if (response.error || (response.status && response.status !== 0)) {
                const errorMsg = response.error?.message || response.error || `PTSL command failed with status: ${response.status}`;
                throw new Error(`Memory location creation failed: ${errorMsg}`);
            }
            
            // Check actual Pro Tools response status
            const isStatusCompleted = response.header?.status === 'Completed';
            
            // Parse any error details and distinguish warnings from actual errors
            let errorDetails = null;
            let actualErrorCount = 0;
            let warningCount = 0;
            const hasErrorJson = response.response_error_json && response.response_error_json.trim();
            
            if (hasErrorJson) {
                try {
                    const errorData = JSON.parse(response.response_error_json);
                    errorDetails = errorData.errors || [];
                    
                    // Count actual errors vs warnings
                    actualErrorCount = errorDetails.filter(error => !error.is_warning).length;
                    warningCount = errorDetails.filter(error => error.is_warning).length;
                    
                    if (warningCount > 0) {
                        log.info(`Pro Tools returned ${warningCount} warning(s) (non-blocking):`, 
                            errorDetails.filter(error => error.is_warning).map(w => w.command_error_message));
                    }
                } catch (parseError) {
                    log.warn('Failed to parse response error JSON', { 
                        error: parseError.message, 
                        rawJson: response.response_error_json 
                    });
                    // If we can't parse it, assume it's an error
                    actualErrorCount = 1;
                    errorDetails = [{ command_error_message: 'Unknown error format' }];
                }
            }
            
            // Only consider successful if status is 'Completed' AND no actual errors exist (warnings are OK)
            const isActuallySuccessful = isStatusCompleted && actualErrorCount === 0;
            
            if (isActuallySuccessful) {
                log.info('✅ Memory location created successfully', {
                    name,
                    timecode,
                    status: response.header?.status,
                    comments: comments.length > 50 ? comments.substring(0, 50) + '...' : comments
                });
                
                return {
                    success: true,
                    name,
                    timecode,
                    comments,
                    ptslResponse: response.createMemoryLocationResponseBody
                };
            } else {
                // Handle failure case
                const statusReason = !isStatusCompleted ? `Status: ${response.header?.status || 'Unknown'}` : '';
                const actualErrors = errorDetails?.filter(error => !error.is_warning) || [];
                const errorReason = actualErrorCount > 0 ? 
                    `Errors: ${actualErrors.map(e => e.command_error_message).join(', ')}` : '';
                const failureReason = [statusReason, errorReason].filter(r => r).join(' | ');
                
                log.error('❌ Memory location creation failed', {
                    name,
                    timecode,
                    status: response.header?.status,
                    reason: failureReason,
                    actualErrorCount,
                    warningCount
                });
                
                // This should have been caught by earlier error checking, but handle it here too
                throw new Error(`Memory location creation failed: ${failureReason}`);
            }
            
        } catch (error) {
            log.error('Failed to create memory location:', error);
            
            // Use error handler for memory location creation failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'create_memory_location',
                markerName: name,
                markerTimecode: timecode,
                retryFunction: () => this.createMemoryLocation(name, timecode, comments, options)
            });
            
            throw handledError;
        }
    }
    
    /**
     * Get memory locations from Pro Tools
     * @param {Object} [options] - Optional filtering parameters
     * @returns {Promise<Object>} Memory locations response
     */
    async getMemoryLocations(options = {}) {
        if (this.state !== CONNECTION_STATE.CONNECTED) {
            throw new Error('Not connected to Pro Tools');
        }
        
        try {
            log.debug('Getting memory locations from Pro Tools', { options });
            
            const request = this.messageBuilder.buildGetMemoryLocationsRequest(options);
            this.messageBuilder.validateMessage(request);
            
            const response = await this.sendGrpcRequest(request);
            
            if (response.responseError && response.responseError.errorType !== 0) {
                throw new Error(`Get memory locations failed: ${response.responseError.errorMessage}`);
            }
            
            // Extract memory locations from response
            const memoryLocations = response.getMemoryLocationsResponseBody?.memoryLocations || [];
            const stats = response.getMemoryLocationsResponseBody?.stats || {};
            
            log.debug('Memory locations retrieved successfully', {
                count: memoryLocations.length,
                stats: stats
            });
            
            return {
                memoryLocations,
                stats,
                response
            };
            
        } catch (error) {
            log.error('Failed to get memory locations:', error);
            
            // Use error handler for memory location retrieval failures
            const handledError = await this.errorHandler.handleError(error, {
                operation: 'get_memory_locations',
                options,
                retryFunction: () => this.getMemoryLocations(options)
            });
            
            throw handledError;
        }
    }
    
    /**
     * Convert PTSL timecode format string to numeric frame rate
     * @private
     * @param {string} ptslFormat - PTSL timecode format (e.g., "Fps25", "Fps2997", etc.)
     * @returns {number} - Numeric frame rate (e.g., 25, 29.97, 23.976)
     */
    _convertPTSLTimecodeToFrameRate(ptslFormat) {
        // Handle numeric values directly (e.g., 23.976, 24, 25, 29.97, 30)
        if (typeof ptslFormat === 'number') {
            return ptslFormat;
        }
        
        // Handle both old format (Fps23976) and new PTSL format (STCR_Fps23976)
        const cleanFormat = ptslFormat?.replace('STCR_', '') || '';
        
        const formatMap = {
            'Fps23976': 23.976,
            'Fps24': 24,
            'Fps25': 25,
            'Fps2997': 29.97,
            'Fps2997Drop': 29.97,
            'Fps30': 30,
            'Fps30Drop': 30,
            'Fps47952': 47.952,
            'Fps48': 48,
            'Fps50': 50,
            'Fps5994': 59.94,
            'Fps5994Drop': 59.94,
            'Fps60': 60,
            'Fps60Drop': 60,
            'Fps100': 100,
            'Fps11988': 119.88,
            'Fps11988Drop': 119.88,
            'Fps120': 120,
            'Fps120Drop': 120
        };
        
        const frameRate = formatMap[cleanFormat];
        if (frameRate) {
            log.debug('Converted PTSL timecode format to frame rate', {
                ptslFormat,
                cleanFormat,
                frameRate
            });
            return frameRate;
        } else {
            log.warn('Unknown PTSL timecode format, defaulting to 25fps', {
                ptslFormat,
                cleanFormat,
                knownFormats: Object.keys(formatMap)
            });
            return 25; // Default fallback
        }
    }
    
    /**
     * Cleanup resources
     */
    async destroy() {
        this.isShuttingDown = true;
        await this.disconnect();
        this.removeAllListeners();
        log.info('PTSLConnectionManager destroyed');
    }
}

module.exports = {
    PTSLConnectionManager,
    CONNECTION_STATE,
    PTSL_ERROR_TYPES: CONNECTION_ERROR_TYPES
};