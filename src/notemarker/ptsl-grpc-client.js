const grpc = require('@grpc/grpc-js');
const log = require('electron-log');
const EventEmitter = require('events');

// Import the generated protobuf definitions
const ptslProto = require('./ptsl-proto.js');

// PTSL Error Classification based on official SDK CommandErrorType
const PTSL_ERROR_TYPES = {
    // Connection Errors
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT', 
    CHANNEL_FAILURE: 'CHANNEL_FAILURE',
    
    // PTSL Registration Errors  
    SDK_VERSION_MISMATCH: 'SDK_VERSION_MISMATCH',
    PTSL_HOST_NOT_READY: 'PTSL_HOST_NOT_READY',
    PTSL_NOT_AVAILABLE: 'PTSL_NOT_AVAILABLE',
    SESSION_ID_PARSE_ERROR: 'SESSION_ID_PARSE_ERROR',
    
    // Pro Tools State Errors
    PRO_TOOLS_NOT_RUNNING: 'PRO_TOOLS_NOT_RUNNING',
    PTSL_DISABLED: 'PTSL_DISABLED',
    UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
    
    // General Errors
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    GRPC_ERROR: 'GRPC_ERROR',
    PARSING_ERROR: 'PARSING_ERROR'
};

// Create gRPC service definition based on official PTSL SDK service:
// service PTSL {
//     rpc SendGrpcRequest (Request) returns (Response);
//     rpc SendGrpcStreamingRequest (Request) returns (stream Response);
// }
const ptslService = {
    SendGrpcRequest: {
        path: '/ptsl.PTSL/SendGrpcRequest',
        requestStream: false,
        responseStream: false,
        requestType: ptslProto.ptsl.Request,
        responseType: ptslProto.ptsl.Response,
        requestSerialize: (request) => ptslProto.ptsl.Request.encode(request).finish(),
        requestDeserialize: (buffer) => ptslProto.ptsl.Request.decode(buffer),
        responseSerialize: (response) => ptslProto.ptsl.Response.encode(response).finish(),
        responseDeserialize: (buffer) => ptslProto.ptsl.Response.decode(buffer)
    },
    SendGrpcStreamingRequest: {
        path: '/ptsl.PTSL/SendGrpcStreamingRequest',
        requestStream: false,
        responseStream: true,
        requestType: ptslProto.ptsl.Request,
        responseType: ptslProto.ptsl.Response,
        requestSerialize: (request) => ptslProto.ptsl.Request.encode(request).finish(),
        requestDeserialize: (buffer) => ptslProto.ptsl.Request.decode(buffer),
        responseSerialize: (response) => ptslProto.ptsl.Response.encode(response).finish(),
        responseDeserialize: (buffer) => ptslProto.ptsl.Response.decode(buffer)
    }
};

/**
 * Create a classified PTSL error with proper typing and context
 */
function createPTSLError(type, message, originalError = null, context = {}) {
    const error = new Error(message);
    error.type = type;
    error.originalError = originalError;
    error.context = context;
    error.timestamp = new Date().toISOString();
    
    // Add specific error properties based on type
    switch (type) {
        case PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH:
            error.retryable = false;
            error.userAction = 'Update Pro Tools or NoteMarker to compatible versions';
            break;
        case PTSL_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING:
            error.retryable = true;
            error.userAction = 'Start Pro Tools and try again';
            break;
        case PTSL_ERROR_TYPES.PTSL_DISABLED:
            error.retryable = true;
            error.userAction = 'Enable PTSL in Pro Tools Preferences > MIDI > PTSL';
            break;
        case PTSL_ERROR_TYPES.PTSL_HOST_NOT_READY:
            error.retryable = true;
            error.userAction = 'Wait for Pro Tools to fully load, then try again';
            break;
        default:
            error.retryable = false;
            error.userAction = 'Check Pro Tools and PTSL configuration';
    }
    
    return error;
}

/**
 * Classify gRPC connection errors
 */
function classifyConnectionError(error) {
    if (!error) {
        return createPTSLError(PTSL_ERROR_TYPES.UNKNOWN_ERROR, 'Unknown connection error');
    }
    
    const errorCode = error.code;
    const errorMessage = (error.message || '').toLowerCase();
    
    // gRPC status codes
    if (errorCode === grpc.status.UNAVAILABLE || errorCode === 14) {
        return createPTSLError(
            PTSL_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING,
            'Pro Tools PTSL service is not available - ensure Pro Tools is running with PTSL enabled',
            error,
            { grpcCode: errorCode }
        );
    }
    
    if (errorCode === grpc.status.DEADLINE_EXCEEDED || errorCode === 4) {
        return createPTSLError(
            PTSL_ERROR_TYPES.CONNECTION_TIMEOUT,
            'Connection to Pro Tools PTSL service timed out',
            error,
            { grpcCode: errorCode }
        );
    }
    
    if (errorCode === grpc.status.PERMISSION_DENIED || errorCode === 7) {
        return createPTSLError(
            PTSL_ERROR_TYPES.PTSL_DISABLED,
            'PTSL access denied - ensure PTSL is enabled in Pro Tools preferences',
            error,
            { grpcCode: errorCode }
        );
    }
    
    // System-level errors
    if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
        return createPTSLError(
            PTSL_ERROR_TYPES.CONNECTION_REFUSED,
            'Connection refused - Pro Tools is not running or PTSL is disabled',
            error
        );
    }
    
    if (errorMessage.includes('transient_failure') || errorMessage.includes('channel failed')) {
        return createPTSLError(
            PTSL_ERROR_TYPES.CHANNEL_FAILURE,
            'gRPC channel failed - Pro Tools PTSL service is not responding',
            error
        );
    }
    
    // Generic gRPC error
    return createPTSLError(
        PTSL_ERROR_TYPES.GRPC_ERROR,
        `gRPC connection error: ${error.message}`,
        error,
        { grpcCode: errorCode }
    );
}

/**
 * Classify PTSL command errors based on official SDK CommandErrorType
 */
function classifyPTSLCommandError(responseErrors) {
    if (!responseErrors || !Array.isArray(responseErrors) || responseErrors.length === 0) {
        return createPTSLError(PTSL_ERROR_TYPES.UNKNOWN_ERROR, 'Unknown PTSL command error');
    }
    
    // Check the first error (most relevant)
    const firstError = responseErrors[0];
    const errorType = firstError.command_error_type;
    const errorMessage = firstError.command_error_message || 'Unknown error';
    
    // Map PTSL CommandErrorType to our error types
    switch (errorType) {
        case ptslProto.ptsl.CommandErrorType.CEType_SDK_VersionMismatch:
        case ptslProto.ptsl.CommandErrorType.SDK_VersionMismatch: // deprecated but still supported
            return createPTSLError(
                PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH,
                `PTSL version mismatch: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
            
        case ptslProto.ptsl.CommandErrorType.CEType_PT_HostNotReady:
        case ptslProto.ptsl.CommandErrorType.PT_HostNotReady: // deprecated but still supported
            return createPTSLError(
                PTSL_ERROR_TYPES.PTSL_HOST_NOT_READY,
                `Pro Tools not ready: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
            
        case ptslProto.ptsl.CommandErrorType.CEType_OS_ProToolsIsNotAvailable:
        case ptslProto.ptsl.CommandErrorType.OS_ProToolsIsNotAvailable: // deprecated but still supported
            return createPTSLError(
                PTSL_ERROR_TYPES.PTSL_NOT_AVAILABLE,
                `Pro Tools not available: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
            
        case ptslProto.ptsl.CommandErrorType.CEType_SDK_SessionIdParseError:
        case ptslProto.ptsl.CommandErrorType.SDK_SessionIdParseError: // deprecated but still supported
            return createPTSLError(
                PTSL_ERROR_TYPES.SESSION_ID_PARSE_ERROR,
                `Session ID parse error: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
            
        case ptslProto.ptsl.CommandErrorType.CEType_PT_UnsupportedCommand:
        case ptslProto.ptsl.CommandErrorType.PT_UnsupportedCommand: // deprecated but still supported
            return createPTSLError(
                PTSL_ERROR_TYPES.UNSUPPORTED_COMMAND,
                `Unsupported command: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
            
        default:
            return createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `PTSL command error: ${errorMessage}`,
                null,
                { commandErrorType: errorType, ptslErrors: responseErrors }
            );
    }
}

/**
 * PTSL gRPC Client
 * Establishes proper gRPC connection to Pro Tools PTSL service
 * Based on official PTSL SDK 2025.06.0 specifications
 */
class PTSLGrpcClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Connection configuration
        this.host = options.host || 'localhost';
        this.port = options.port || 31416;
        this.serverAddress = `${this.host}:${this.port}`;
        
        // Client state
        this.client = null;
        this.isConnected = false;
        this.sessionId = null;
        
        // gRPC channel options for PTSL connection
        this.channelOptions = {
            // Connection settings
            'grpc.keepalive_time_ms': 30000,           // Send keepalive every 30s
            'grpc.keepalive_timeout_ms': 5000,         // Wait 5s for keepalive response
            'grpc.keepalive_permit_without_calls': true, // Allow keepalive without active calls
            'grpc.http2.max_pings_without_data': 0,    // No limit on pings without data
            'grpc.http2.min_time_between_pings_ms': 10000, // Min 10s between pings
            
            // Connection timeouts
            'grpc.max_connection_idle_ms': 300000,     // Close idle connections after 5 min
            'grpc.max_connection_age_ms': 600000,      // Max connection age 10 min
            'grpc.max_connection_age_grace_ms': 30000, // Grace period for closing
            
            // Message size limits
            'grpc.max_send_message_length': 4 * 1024 * 1024,    // 4MB send limit
            'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB receive limit
            
            // Retry settings
            'grpc.initial_reconnect_backoff_ms': 1000, // Initial backoff 1s
            'grpc.max_reconnect_backoff_ms': 30000,    // Max backoff 30s
            'grpc.enable_retries': 1                   // Enable retries
        };
        
        log.info('PTSLGrpcClient initialized', {
            serverAddress: this.serverAddress,
            channelOptions: Object.keys(this.channelOptions).length
        });
    }
    
    /**
     * Establish gRPC connection to PTSL server
     * Creates the gRPC client and verifies connectivity
     */
    async connect() {
        try {
            log.info('Establishing gRPC connection to PTSL server', {
                serverAddress: this.serverAddress
            });
            
            // Create gRPC credentials (insecure for localhost)
            const credentials = grpc.credentials.createInsecure();
            
            // Create the gRPC client using the service definition
            this.client = new grpc.Client(
                this.serverAddress,
                credentials,
                this.channelOptions
            );
            
            // Create a client stub for the PTSL service
            this.ptslStub = grpc.makeGenericClientConstructor(ptslService, 'PTSLService');
            this.ptslClient = new this.ptslStub(
                this.serverAddress,
                credentials,
                this.channelOptions
            );
            
            // Wait for the gRPC channel to be ready
            await this.waitForChannelReady();
            
            this.isConnected = true;
            
            log.info('✅ gRPC connection established successfully', {
                serverAddress: this.serverAddress,
                channelState: this.getChannelState()
            });
            
            this.emit('connected');
            return true;
            
        } catch (error) {
            this.isConnected = false;
            
            // Classify the connection error
            const classifiedError = classifyConnectionError(error);
            
            log.error('❌ Failed to establish gRPC connection', {
                errorType: classifiedError.type,
                message: classifiedError.message,
                retryable: classifiedError.retryable,
                userAction: classifiedError.userAction,
                originalError: error.message,
                serverAddress: this.serverAddress
            });
            
            this.emit('connection-failed', classifiedError);
            throw classifiedError;
        }
    }
    
    /**
     * Wait for the gRPC channel to reach READY state
     * @param {number} timeout - Timeout in milliseconds (default: 10s)
     */
    async waitForChannelReady(timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.client) {
                return reject(new Error('gRPC client not created'));
            }
            
            const deadline = Date.now() + timeout;
            
            // Get the gRPC channel from the PTSL client
            const channel = this.ptslClient.getChannel();
            
            const checkState = () => {
                const state = channel.getConnectivityState(true); // true = try to connect
                
                log.debug('gRPC channel state check', {
                    state: this.getChannelStateName(state),
                    stateCode: state,
                    timeRemaining: deadline - Date.now()
                });
                
                if (state === grpc.connectivityState.READY) {
                    log.info('gRPC channel is READY');
                    return resolve();
                }
                
                if (state === grpc.connectivityState.TRANSIENT_FAILURE || 
                    state === grpc.connectivityState.SHUTDOWN) {
                    return reject(new Error(`Channel failed with state: ${this.getChannelStateName(state)}`));
                }
                
                if (Date.now() >= deadline) {
                    return reject(new Error('Connection timeout waiting for channel to be ready'));
                }
                
                // Wait for state change and check again
                channel.watchConnectivityState(state, deadline, (error) => {
                    if (error) {
                        return reject(error);
                    }
                    setImmediate(checkState);
                });
            };
            
            checkState();
        });
    }
    
    /**
     * Get current gRPC channel connectivity state
     */
    getChannelState() {
        if (!this.ptslClient) return 'NO_CLIENT';
        
        const channel = this.ptslClient.getChannel();
        const state = channel.getConnectivityState(false);
        return this.getChannelStateName(state);
    }
    
    /**
     * Convert gRPC connectivity state code to readable name
     */
    getChannelStateName(state) {
        const states = {
            [grpc.connectivityState.IDLE]: 'IDLE',
            [grpc.connectivityState.CONNECTING]: 'CONNECTING', 
            [grpc.connectivityState.READY]: 'READY',
            [grpc.connectivityState.TRANSIENT_FAILURE]: 'TRANSIENT_FAILURE',
            [grpc.connectivityState.SHUTDOWN]: 'SHUTDOWN'
        };
        return states[state] || `UNKNOWN(${state})`;
    }
    
    /**
     * Send a gRPC request to PTSL server
     * This is the base method for all PTSL commands
     * @param {Object} request - The protobuf request message
     * @param {Object} options - Request options (timeout, etc.)
     */
    async sendRequest(request, options = {}) {
        if (!this.isConnected || !this.ptslClient) {
            throw new Error('Not connected to PTSL server');
        }
        
        const timeout = options.timeout || 30000; // 30s default timeout
        
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            
            log.debug('Sending gRPC request to PTSL', {
                commandId: request.header?.command,
                hasSessionId: !!request.header?.session_id,
                taskId: request.header?.task_id,
                timeout
            });
            
            this.ptslClient.SendGrpcRequest(request, { deadline }, (error, response) => {
                if (error) {
                    log.error('gRPC request failed', {
                        error: error.message,
                        code: error.code,
                        details: error.details,
                        commandId: request.header?.command,
                        taskId: request.header?.task_id
                    });
                    return reject(error);
                }
                
                log.debug('gRPC request completed', {
                    commandId: request.header?.command,
                    taskId: request.header?.task_id,
                    status: response.header?.status,
                    hasError: !!response.response_error_json
                });
                
                resolve(response);
            });
        });
    }
    
    /**
     * Register connection with PTSL server
     * This must be called first before any other PTSL commands
     * Based on official PTSL SDK RegisterConnection command
     * 
     * @param {string} companyName - Company name (default: 'alternatone')
     * @param {string} applicationName - Application name (default: 'notemarker')
     * @returns {Promise<string>} - Session ID for subsequent requests
     */
    async registerConnection(companyName = 'alternatone', applicationName = 'notemarker') {
        try {
            log.info('Registering connection with PTSL server', {
                companyName,
                applicationName,
                serverAddress: this.serverAddress
            });
            
            // Create RegisterConnectionRequestBody according to PTSL SDK
            const requestBody = {
                company_name: companyName,
                application_name: applicationName
            };
            
            // Serialize request body to JSON
            const requestBodyJson = JSON.stringify(requestBody);
            
            // Generate unique task ID
            const taskId = `notemarker_register_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create Request message according to PTSL SDK specification
            const request = ptslProto.ptsl.Request.create({
                header: {
                    task_id: taskId,
                    command: ptslProto.ptsl.CommandId.RegisterConnection, // CommandId = 70
                    version: 2025,        // PTSL Client API version (year)
                    session_id: '',       // Empty for RegisterConnection
                    version_minor: 6,     // PTSL API minor version (month)
                    version_revision: 0   // PTSL API revision version
                },
                request_body_json: requestBodyJson
            });
            
            // Send the registration request
            const response = await this.sendRequest(request, { timeout: 15000 });
            
            // Check if the command completed successfully
            if (response.header.status !== ptslProto.ptsl.TaskStatus.TStatus_Completed) {
                let classifiedError;
                
                if (response.response_error_json) {
                    try {
                        const errorResponse = JSON.parse(response.response_error_json);
                        if (errorResponse.errors && Array.isArray(errorResponse.errors)) {
                            classifiedError = classifyPTSLCommandError(errorResponse.errors);
                        } else {
                            classifiedError = createPTSLError(
                                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                                `RegisterConnection failed: ${errorResponse.errorMessage || 'Unknown error'}`
                            );
                        }
                    } catch (parseError) {
                        classifiedError = createPTSLError(
                            PTSL_ERROR_TYPES.PARSING_ERROR,
                            `Failed to parse PTSL error response: ${response.response_error_json}`
                        );
                    }
                } else {
                    // No error details, classify based on status
                    const statusName = Object.keys(ptslProto.ptsl.TaskStatus).find(
                        key => ptslProto.ptsl.TaskStatus[key] === response.header.status
                    ) || `Unknown(${response.header.status})`;
                    
                    classifiedError = createPTSLError(
                        PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                        `RegisterConnection failed with status: ${statusName}`
                    );
                }
                
                throw classifiedError;
            }
            
            // Parse the response body to get session_id
            if (!response.response_body_json) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.PARSING_ERROR,
                    'RegisterConnection response missing response_body_json field'
                );
            }
            
            let responseBody;
            try {
                responseBody = JSON.parse(response.response_body_json);
            } catch (parseError) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.PARSING_ERROR,
                    `Failed to parse RegisterConnection response body: ${response.response_body_json}`,
                    parseError
                );
            }
            
            if (!responseBody.session_id) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.SESSION_ID_PARSE_ERROR,
                    'RegisterConnection response missing session_id field',
                    null,
                    { responseBody }
                );
            }
            
            // Store the session ID for subsequent requests
            this.sessionId = responseBody.session_id;
            
            log.info('✅ Successfully registered with PTSL server', {
                sessionId: this.sessionId,
                companyName,
                applicationName,
                taskId
            });
            
            this.emit('registered', {
                sessionId: this.sessionId,
                companyName,
                applicationName
            });
            
            return this.sessionId;
            
        } catch (error) {
            // If the error is already classified, use it; otherwise classify it
            const classifiedError = error.type ? error : classifyConnectionError(error);
            
            log.error('❌ Failed to register with PTSL server', {
                errorType: classifiedError.type,
                message: classifiedError.message,
                retryable: classifiedError.retryable,
                userAction: classifiedError.userAction,
                companyName,
                applicationName,
                serverAddress: this.serverAddress,
                context: classifiedError.context
            });
            
            this.emit('registration-failed', classifiedError);
            throw classifiedError;
        }
    }
    
    /**
     * Connect and register with PTSL server in one operation
     * This is the main method to establish a full PTSL connection
     * 
     * @param {string} companyName - Company name (default: 'alternatone')
     * @param {string} applicationName - Application name (default: 'notemarker')
     * @returns {Promise<string>} - Session ID
     */
    async connectAndRegister(companyName = 'alternatone', applicationName = 'notemarker') {
        try {
            // First establish the gRPC connection
            await this.connect();
            
            // Then register with PTSL to get session ID
            const sessionId = await this.registerConnection(companyName, applicationName);
            
            log.info('✅ Full PTSL connection established', {
                sessionId,
                serverAddress: this.serverAddress,
                isReady: this.isReady()
            });
            
            return sessionId;
            
        } catch (error) {
            // Clean up on failure
            await this.disconnect();
            throw error;
        }
    }
    
    /**
     * Send a PTSL command with proper session ID and error handling
     * This is a helper method for all PTSL commands that require session ID
     * 
     * @param {string} commandId - PTSL command ID 
     * @param {Object} requestBody - Request body data (will be JSON serialized)
     * @param {Object} options - Request options
     * @returns {Promise<Object>} - Parsed response body
     */
    async sendPTSLCommand(commandId, requestBody = {}, options = {}) {
        if (!this.isRegistered()) {
            throw createPTSLError(
                PTSL_ERROR_TYPES.SESSION_ID_PARSE_ERROR,
                'Cannot send PTSL command: not registered with PTSL server. Call registerConnection() first.'
            );
        }
        
        // Generate unique task ID
        const taskId = `notemarker_${commandId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Serialize request body to JSON
        const requestBodyJson = JSON.stringify(requestBody);
        
        // Create Request message according to PTSL SDK specification
        const request = ptslProto.ptsl.Request.create({
            header: {
                task_id: taskId,
                command: commandId,
                version: 2025,
                session_id: this.sessionId,
                version_minor: 6,
                version_revision: 0
            },
            request_body_json: requestBodyJson
        });
        
        log.debug('Sending PTSL command', {
            commandId,
            taskId,
            sessionId: this.sessionId.substring(0, 8) + '...',
            requestBodyLength: requestBodyJson.length
        });
        
        // Send the request
        const response = await this.sendRequest(request, options);
        
        // Check if the command completed successfully
        if (response.header.status !== ptslProto.ptsl.TaskStatus.TStatus_Completed) {
            let classifiedError;
            
            if (response.response_error_json) {
                try {
                    const errorResponse = JSON.parse(response.response_error_json);
                    if (errorResponse.errors && Array.isArray(errorResponse.errors)) {
                        classifiedError = classifyPTSLCommandError(errorResponse.errors);
                    } else {
                        classifiedError = createPTSLError(
                            PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                            `PTSL command failed: ${errorResponse.errorMessage || 'Unknown error'}`
                        );
                    }
                } catch (parseError) {
                    classifiedError = createPTSLError(
                        PTSL_ERROR_TYPES.PARSING_ERROR,
                        `Failed to parse PTSL error response: ${response.response_error_json}`
                    );
                }
            } else {
                const statusName = Object.keys(ptslProto.ptsl.TaskStatus).find(
                    key => ptslProto.ptsl.TaskStatus[key] === response.header.status
                ) || `Unknown(${response.header.status})`;
                
                classifiedError = createPTSLError(
                    PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                    `PTSL command failed with status: ${statusName}`
                );
            }
            
            throw classifiedError;
        }
        
        // Parse and return response body
        if (!response.response_body_json) {
            throw createPTSLError(
                PTSL_ERROR_TYPES.PARSING_ERROR,
                `PTSL command response missing response_body_json field`
            );
        }
        
        try {
            const responseBody = JSON.parse(response.response_body_json);
            
            log.debug('PTSL command completed successfully', {
                commandId,
                taskId,
                responseKeys: Object.keys(responseBody)
            });
            
            return responseBody;
            
        } catch (parseError) {
            throw createPTSLError(
                PTSL_ERROR_TYPES.PARSING_ERROR,
                `Failed to parse PTSL command response body: ${response.response_body_json}`,
                parseError
            );
        }
    }
    
    /**
     * Get current Pro Tools session name
     * Command ID: GetSessionName (42)
     * 
     * @returns {Promise<string>} - Session name
     */
    async getSessionName() {
        try {
            log.info('Getting Pro Tools session name');
            
            const responseBody = await this.sendPTSLCommand(
                ptslProto.ptsl.CommandId.GetSessionName,
                {}, // No request body needed
                { timeout: 10000 }
            );
            
            if (!responseBody.session_name) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.PARSING_ERROR,
                    'GetSessionName response missing session_name field',
                    null,
                    { responseBody }
                );
            }
            
            log.info('✅ Successfully retrieved session name', {
                sessionName: responseBody.session_name
            });
            
            return responseBody.session_name;
            
        } catch (error) {
            const classifiedError = error.type ? error : createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `Failed to get session name: ${error.message}`,
                error
            );
            
            log.error('❌ Failed to get session name', {
                errorType: classifiedError.type,
                message: classifiedError.message
            });
            
            throw classifiedError;
        }
    }
    
    /**
     * Get current Pro Tools session sample rate
     * Command ID: GetSessionSampleRate (35)
     * 
     * @returns {Promise<string>} - Sample rate (e.g., "SR_48000", "SR_44100")
     */
    async getSessionSampleRate() {
        try {
            log.info('Getting Pro Tools session sample rate');
            
            const responseBody = await this.sendPTSLCommand(
                ptslProto.ptsl.CommandId.GetSessionSampleRate,
                {},
                { timeout: 10000 }
            );
            
            if (!responseBody.sample_rate) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.PARSING_ERROR,
                    'GetSessionSampleRate response missing sample_rate field',
                    null,
                    { responseBody }
                );
            }
            
            log.info('✅ Successfully retrieved session sample rate', {
                sampleRate: responseBody.sample_rate
            });
            
            return responseBody.sample_rate;
            
        } catch (error) {
            const classifiedError = error.type ? error : createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `Failed to get session sample rate: ${error.message}`,
                error
            );
            
            log.error('❌ Failed to get session sample rate', {
                errorType: classifiedError.type,
                message: classifiedError.message
            });
            
            throw classifiedError;
        }
    }
    
    /**
     * Get current Pro Tools session timecode rate
     * Command ID: GetSessionTimeCodeRate (38)
     * 
     * @returns {Promise<Object>} - Timecode rate info with current_setting and possible_settings
     */
    async getSessionTimeCodeRate() {
        try {
            log.info('Getting Pro Tools session timecode rate');
            
            const responseBody = await this.sendPTSLCommand(
                ptslProto.ptsl.CommandId.GetSessionTimeCodeRate,
                {},
                { timeout: 10000 }
            );
            
            if (!responseBody.current_setting) {
                throw createPTSLError(
                    PTSL_ERROR_TYPES.PARSING_ERROR,
                    'GetSessionTimeCodeRate response missing current_setting field',
                    null,
                    { responseBody }
                );
            }
            
            log.info('✅ Successfully retrieved session timecode rate', {
                currentSetting: responseBody.current_setting,
                possibleSettings: responseBody.possible_settings?.length || 0
            });
            
            return {
                current_setting: responseBody.current_setting,
                possible_settings: responseBody.possible_settings || []
            };
            
        } catch (error) {
            const classifiedError = error.type ? error : createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `Failed to get session timecode rate: ${error.message}`,
                error
            );
            
            log.error('❌ Failed to get session timecode rate', {
                errorType: classifiedError.type,
                message: classifiedError.message
            });
            
            throw classifiedError;
        }
    }
    
    /**
     * Get comprehensive Pro Tools session information
     * Retrieves session name, sample rate, and timecode rate in one call
     * 
     * @returns {Promise<Object>} - Complete session information
     */
    async getSessionInfo() {
        try {
            log.info('Getting comprehensive Pro Tools session information');
            
            // Get all session info in parallel for better performance
            const [sessionName, sampleRate, timecodeRate] = await Promise.all([
                this.getSessionName(),
                this.getSessionSampleRate(),
                this.getSessionTimeCodeRate()
            ]);
            
            const sessionInfo = {
                name: sessionName,
                sampleRate: sampleRate,
                timecodeRate: timecodeRate.current_setting,
                timecodeRateOptions: timecodeRate.possible_settings,
                retrievedAt: new Date().toISOString()
            };
            
            log.info('✅ Successfully retrieved complete session information', {
                name: sessionInfo.name,
                sampleRate: sessionInfo.sampleRate,
                timecodeRate: sessionInfo.timecodeRate,
                optionsCount: sessionInfo.timecodeRateOptions.length
            });
            
            return sessionInfo;
            
        } catch (error) {
            const classifiedError = error.type ? error : createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `Failed to get session information: ${error.message}`,
                error
            );
            
            log.error('❌ Failed to get session information', {
                errorType: classifiedError.type,
                message: classifiedError.message
            });
            
            throw classifiedError;
        }
    }
    
    /**
     * Validate Pro Tools session compatibility for Frame.io marker creation
     * Checks session properties and provides compatibility warnings/errors
     * 
     * @param {Object} frameIoData - Optional Frame.io data for additional validation
     * @returns {Promise<Object>} - Validation result with compatibility status
     */
    async validateSessionCompatibility(frameIoData = null) {
        try {
            log.info('Validating Pro Tools session compatibility for NoteMarker');
            
            // Get current session information
            const sessionInfo = await this.getSessionInfo();
            
            const validation = {
                sessionInfo,
                isCompatible: true,
                warnings: [],
                errors: [],
                recommendations: [],
                markerCreationReady: false
            };
            
            // 1. Session Name Validation
            if (!sessionInfo.name || sessionInfo.name.trim().length === 0) {
                validation.errors.push({
                    type: 'MISSING_SESSION_NAME',
                    message: 'Pro Tools session has no name',
                    impact: 'Cannot determine session context for marker placement',
                    resolution: 'Save the Pro Tools session with a proper name'
                });
                validation.isCompatible = false;
            } else if (sessionInfo.name.includes('Untitled')) {
                validation.warnings.push({
                    type: 'UNTITLED_SESSION',
                    message: 'Pro Tools session appears to be untitled',
                    impact: 'May indicate unsaved work',
                    resolution: 'Save session with descriptive name before adding markers'
                });
            }
            
            // 2. Sample Rate Validation
            const compatibleSampleRates = [
                'SR_44100',   // 44.1 kHz - CD quality
                'SR_48000',   // 48 kHz - Standard digital audio
                'SR_88200',   // 88.2 kHz - High resolution
                'SR_96000',   // 96 kHz - High resolution
                'SR_176400',  // 176.4 kHz - Ultra high resolution
                'SR_192000'   // 192 kHz - Ultra high resolution
            ];
            
            if (!compatibleSampleRates.includes(sessionInfo.sampleRate)) {
                validation.warnings.push({
                    type: 'UNCOMMON_SAMPLE_RATE',
                    message: `Uncommon sample rate detected: ${sessionInfo.sampleRate}`,
                    impact: 'Frame.io timecode calculations may need verification',
                    resolution: 'Verify Frame.io export matches this sample rate'
                });
            }
            
            // 3. Timecode Rate Validation
            const compatibleTimecodeRates = [
                'STCR_Fps23976',      // 23.976 fps - Film/broadcast standard
                'STCR_Fps24',         // 24 fps - Film standard
                'STCR_Fps25',         // 25 fps - PAL standard
                'STCR_Fps2997',       // 29.97 fps - NTSC standard
                'STCR_Fps2997Drop',   // 29.97 Drop Frame - NTSC broadcast
                'STCR_Fps30',         // 30 fps - Digital standard
                'STCR_Fps30Drop',     // 30 Drop Frame
                'STCR_Fps50',         // 50 fps - High frame rate
                'STCR_Fps5994',       // 59.94 fps - High frame rate
                'STCR_Fps60'          // 60 fps - High frame rate
            ];
            
            if (!compatibleTimecodeRates.includes(sessionInfo.timecodeRate)) {
                validation.errors.push({
                    type: 'INCOMPATIBLE_TIMECODE_RATE',
                    message: `Unsupported timecode rate: ${sessionInfo.timecodeRate}`,
                    impact: 'Frame.io timecode conversion will fail',
                    resolution: 'Change session timecode rate to standard format (23.976, 24, 25, 29.97, 30)'
                });
                validation.isCompatible = false;
            }
            
            // 4. Drop Frame Considerations
            if (sessionInfo.timecodeRate.includes('Drop')) {
                validation.recommendations.push({
                    type: 'DROP_FRAME_DETECTED',
                    message: 'Drop frame timecode detected',
                    impact: 'Requires precise Frame.io timecode alignment',
                    resolution: 'Ensure Frame.io export uses matching drop frame settings'
                });
            }
            
            // 5. Frame.io Data Validation (if provided)
            if (frameIoData) {
                validation = await this.validateFrameIoCompatibility(validation, frameIoData, sessionInfo);
            }
            
            // 6. Overall Readiness Assessment
            validation.markerCreationReady = validation.isCompatible && validation.errors.length === 0;
            
            // 7. Generate Summary
            const summary = this.generateCompatibilitySummary(validation, sessionInfo);
            validation.summary = summary;
            
            log.info('✅ Session compatibility validation completed', {
                isCompatible: validation.isCompatible,
                markerCreationReady: validation.markerCreationReady,
                warningCount: validation.warnings.length,
                errorCount: validation.errors.length,
                recommendationCount: validation.recommendations.length
            });
            
            return validation;
            
        } catch (error) {
            const classifiedError = error.type ? error : createPTSLError(
                PTSL_ERROR_TYPES.UNKNOWN_ERROR,
                `Failed to validate session compatibility: ${error.message}`,
                error
            );
            
            log.error('❌ Failed to validate session compatibility', {
                errorType: classifiedError.type,
                message: classifiedError.message
            });
            
            throw classifiedError;
        }
    }
    
    /**
     * Validate Frame.io data compatibility with Pro Tools session
     * @private
     */
    async validateFrameIoCompatibility(validation, frameIoData, sessionInfo) {
        log.debug('Validating Frame.io data compatibility');
        
        // Extract timecode rate from Frame.io data if available
        if (frameIoData.timecodeRate || frameIoData.frameRate) {
            const frameIoRate = frameIoData.timecodeRate || frameIoData.frameRate;
            const sessionRate = sessionInfo.timecodeRate;
            
            // Convert to comparable formats
            const frameIoFps = this.extractFrameRate(frameIoRate);
            const sessionFps = this.extractFrameRate(sessionRate);
            
            if (frameIoFps !== sessionFps) {
                validation.errors.push({
                    type: 'FRAME_RATE_MISMATCH',
                    message: `Frame.io frame rate (${frameIoFps}fps) doesn't match Pro Tools (${sessionFps}fps)`,
                    impact: 'Markers will be placed at incorrect timecode positions',
                    resolution: 'Change Pro Tools session timecode rate to match Frame.io export'
                });
                validation.isCompatible = false;
            }
        }
        
        // Validate comment count and complexity
        if (frameIoData.comments && Array.isArray(frameIoData.comments)) {
            const commentCount = frameIoData.comments.length;
            
            if (commentCount === 0) {
                validation.warnings.push({
                    type: 'NO_COMMENTS_FOUND',
                    message: 'No Frame.io comments found in data',
                    impact: 'No markers will be created',
                    resolution: 'Verify Frame.io export contains comments'
                });
            } else if (commentCount > 1000) {
                validation.warnings.push({
                    type: 'LARGE_COMMENT_COUNT',
                    message: `Large number of comments detected (${commentCount})`,
                    impact: 'Marker creation may take significant time',
                    resolution: 'Consider filtering comments or processing in batches'
                });
            }
            
            // Check for complex timecode formats
            const hasComplexTimecodes = frameIoData.comments.some(comment => 
                comment.timecode && comment.timecode.includes(':') && comment.timecode.split(':').length > 3
            );
            
            if (hasComplexTimecodes) {
                validation.recommendations.push({
                    type: 'COMPLEX_TIMECODES_DETECTED',
                    message: 'Complex timecode formats detected in Frame.io data',
                    impact: 'May require additional parsing and validation',
                    resolution: 'Verify all timecodes are properly formatted'
                });
            }
        }
        
        return validation;
    }
    
    /**
     * Extract frame rate number from PTSL or Frame.io format
     * @private
     */
    extractFrameRate(rateString) {
        if (typeof rateString !== 'string') return null;
        
        // PTSL format: STCR_Fps23976 -> 23.976
        if (rateString.startsWith('STCR_Fps')) {
            const fps = rateString.replace('STCR_Fps', '').replace('Drop', '');
            if (fps === '23976') return 23.976;
            if (fps === '2997') return 29.97;
            if (fps === '5994') return 59.94;
            return parseFloat(fps);
        }
        
        // Direct fps format: "24", "23.976", etc.
        const parsed = parseFloat(rateString);
        return isNaN(parsed) ? null : parsed;
    }
    
    /**
     * Generate human-readable compatibility summary
     * @private
     */
    generateCompatibilitySummary(validation, sessionInfo) {
        const summary = {
            status: validation.isCompatible ? 'COMPATIBLE' : 'INCOMPATIBLE',
            sessionName: sessionInfo.name,
            readableFrameRate: this.getReadableFrameRate(sessionInfo.timecodeRate),
            readableSampleRate: this.getReadableSampleRate(sessionInfo.sampleRate),
            criticalIssues: validation.errors.length,
            minorIssues: validation.warnings.length,
            recommendations: validation.recommendations.length
        };
        
        // Generate status message
        if (validation.markerCreationReady) {
            summary.statusMessage = '✅ Session is fully ready for Frame.io marker creation';
        } else if (validation.isCompatible) {
            summary.statusMessage = '⚠️ Session is compatible but has minor issues to address';
        } else {
            summary.statusMessage = '❌ Session has compatibility issues that must be resolved';
        }
        
        return summary;
    }
    
    /**
     * Convert PTSL frame rate to human-readable format
     * @private
     */
    getReadableFrameRate(ptslRate) {
        const conversions = {
            'STCR_Fps23976': '23.976 fps',
            'STCR_Fps24': '24 fps',
            'STCR_Fps25': '25 fps',
            'STCR_Fps2997': '29.97 fps',
            'STCR_Fps2997Drop': '29.97 fps (Drop Frame)',
            'STCR_Fps30': '30 fps',
            'STCR_Fps30Drop': '30 fps (Drop Frame)',
            'STCR_Fps50': '50 fps',
            'STCR_Fps5994': '59.94 fps',
            'STCR_Fps60': '60 fps'
        };
        return conversions[ptslRate] || ptslRate;
    }
    
    /**
     * Convert PTSL sample rate to human-readable format
     * @private
     */
    getReadableSampleRate(ptslRate) {
        const conversions = {
            'SR_44100': '44.1 kHz',
            'SR_48000': '48 kHz',
            'SR_88200': '88.2 kHz',
            'SR_96000': '96 kHz',
            'SR_176400': '176.4 kHz',
            'SR_192000': '192 kHz'
        };
        return conversions[ptslRate] || ptslRate;
    }

    /**
     * Convert PTSL sample rate string to numeric format
     * @private
     * @param {string} ptslRate - PTSL sample rate (e.g., "SR_48000")
     * @returns {number} - Numeric sample rate (e.g., 48000)
     */
    getNumericSampleRate(ptslRate) {
        const conversions = {
            'SR_44100': 44100,
            'SR_48000': 48000,
            'SR_88200': 88200,
            'SR_96000': 96000,
            'SR_176400': 176400,
            'SR_192000': 192000
        };
        return conversions[ptslRate] || (typeof ptslRate === 'number' ? ptslRate : 48000);
    }

    /**
     * Convert numeric sample rate to PTSL string format
     * @private
     * @param {number} numericRate - Numeric sample rate (e.g., 48000)
     * @returns {string} - PTSL sample rate (e.g., "SR_48000")
     */
    getPTSLSampleRate(numericRate) {
        const conversions = {
            44100: 'SR_44100',
            48000: 'SR_48000',
            88200: 'SR_88200',
            96000: 'SR_96000',
            176400: 'SR_176400',
            192000: 'SR_192000'
        };
        return conversions[numericRate] || (typeof numericRate === 'string' ? numericRate : 'SR_48000');
    }
    
    /**
     * Disconnect from PTSL server
     */
    async disconnect() {
        if (this.ptslClient) {
            log.info('Disconnecting from PTSL server');
            
            try {
                // Close the gRPC clients
                this.ptslClient.close();
                if (this.client) {
                    this.client.close();
                }
            } catch (error) {
                log.warn('Error closing gRPC client', { error: error.message });
            }
            
            this.ptslClient = null;
            this.client = null;
        }
        
        this.isConnected = false;
        this.sessionId = null;
        
        this.emit('disconnected');
        log.info('Disconnected from PTSL server');
    }
    
    /**
     * Check if client is connected and ready
     */
    isReady() {
        return this.isConnected && 
               this.ptslClient && 
               this.getChannelState() === 'READY';
    }
    
    /**
     * Check if client is fully registered and ready for PTSL commands
     */
    isRegistered() {
        return this.isReady() && !!this.sessionId;
    }
    
    /**
     * Get connection status information
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            hasClient: !!this.ptslClient,
            channelState: this.getChannelState(),
            serverAddress: this.serverAddress,
            sessionId: this.sessionId,
            isReady: this.isReady(),
            isRegistered: this.isRegistered()
        };
    }
    
    /**
     * Get PTSL error type constants for external error handling
     */
    static get ERROR_TYPES() {
        return PTSL_ERROR_TYPES;
    }
    
    /**
     * Check if an error is a specific PTSL error type
     */
    static isErrorType(error, errorType) {
        return error && error.type === errorType;
    }
    
    /**
     * Check if an error is retryable
     */
    static isRetryableError(error) {
        return error && error.retryable === true;
    }
}

module.exports = PTSLGrpcClient;