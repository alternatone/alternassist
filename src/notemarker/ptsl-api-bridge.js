/**
 * PTSL API Bridge
 * 
 * This bridge wraps the new gRPC-based PTSL implementation and provides the same interface
 * as the old WebSocket-based PTSLBridge, ensuring minimal disruption to existing code.
 * 
 * Step 13 of PTSL gRPC Migration: Bridge layer for backward compatibility
 */

const EventEmitter = require('events');
const log = require('electron-log');

// Import the new gRPC-based bridge
const { PTSLGrpcBridge } = require('./ptsl-grpc-bridge.js');

// Re-export error types for compatibility
const ERROR_TYPES = {
    // Connection Errors
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    CONNECTION_LOST: 'CONNECTION_LOST',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    WEBSOCKET_ERROR: 'WEBSOCKET_ERROR', // Legacy compatibility
    GRPC_ERROR: 'GRPC_ERROR',
    
    // Pro Tools Errors
    PRO_TOOLS_NOT_RUNNING: 'PRO_TOOLS_NOT_RUNNING',
    PTSL_NOT_ENABLED: 'PTSL_NOT_ENABLED',
    PTSL_REGISTRATION_FAILED: 'PTSL_REGISTRATION_FAILED',
    
    // Session Errors
    SESSION_NOT_OPEN: 'SESSION_NOT_OPEN',
    SESSION_LOCKED: 'SESSION_LOCKED',
    SESSION_READ_ONLY: 'SESSION_READ_ONLY',
    SESSION_INFO_FAILED: 'SESSION_INFO_FAILED',
    
    // Marker Creation Errors
    MARKER_CREATION_FAILED: 'MARKER_CREATION_FAILED',
    MARKER_LIMIT_EXCEEDED: 'MARKER_LIMIT_EXCEEDED',
    INVALID_TIMECODE: 'INVALID_TIMECODE',
    INVALID_MARKER_TRACK: 'INVALID_MARKER_TRACK',
    INSUFFICIENT_PRIVILEGES: 'INSUFFICIENT_PRIVILEGES',
    
    // Settings Errors
    INVALID_SETTINGS: 'INVALID_SETTINGS',
    FRAME_RATE_MISMATCH: 'FRAME_RATE_MISMATCH',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    
    // File System Errors
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    FILE_READ_ERROR: 'FILE_READ_ERROR',
    FILE_PARSE_ERROR: 'FILE_PARSE_ERROR',
    INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
    
    // Application Errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
    INITIALIZATION_FAILED: 'INITIALIZATION_FAILED'
};

/**
 * Legacy PTSLError for backward compatibility
 */
class PTSLError extends Error {
    constructor(type, message, details = null) {
        super(message);
        this.name = 'PTSLError';
        this.type = type;
        this.details = details;
    }
}

/**
 * PTSL API Bridge - provides backward compatibility interface
 * Wraps the new gRPC implementation while maintaining the same API as the old WebSocket bridge
 */
class PTSLBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Initialize the new gRPC bridge
        this.grpcBridge = new PTSLGrpcBridge(options);
        
        // Legacy properties for backward compatibility
        this.isConnected = false;
        this.isRegistered = false;
        this.sessionInfo = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Bridge events from gRPC implementation to legacy interface
        this.setupEventBridging();
        
        log.debug('PTSL API Bridge initialized with gRPC backend');
    }

    /**
     * Setup event bridging between new gRPC bridge and legacy interface
     */
    setupEventBridging() {
        // Bridge connection state changes
        this.grpcBridge.on('connectionStateChanged', (state) => {
            this.connectionState = state.state;
            this.isConnected = state.isConnected || false;
            this.isRegistered = state.isRegistered || false;
            
            // Update session info if available
            if (state.sessionInfo) {
                this.sessionInfo = state.sessionInfo;
            }
            
            // Emit legacy-compatible event
            this.emit('connectionStateChanged', {
                state: state.state,
                isConnected: this.isConnected,
                isRegistered: this.isRegistered,
                message: state.message,
                error: state.error,
                title: state.title,
                guidance: state.guidance,
                severity: state.severity,
                recoverable: state.recoverable
            });
            
            log.debug('Bridge: Connection state changed', {
                state: this.connectionState,
                isConnected: this.isConnected,
                isRegistered: this.isRegistered
            });
        });
        
        // Bridge session state changes
        this.grpcBridge.on('sessionStateChanged', (sessionState) => {
            this.sessionInfo = sessionState.sessionInfo;
            this.emit('sessionStateChanged', sessionState);
        });
        
        // Bridge marker creation progress
        this.grpcBridge.on('markerCreationProgress', (progress) => {
            this.emit('markerCreationProgress', progress);
        });
        
        // Bridge diagnostics
        this.grpcBridge.on('diagnosticsUpdate', (diagnostics) => {
            this.emit('diagnosticsUpdate', diagnostics);
        });
        
        // Bridge any other events
        this.grpcBridge.on('error', (error) => {
            this.emit('error', error);
        });
    }

    /**
     * Connect to Pro Tools PTSL
     * @returns {Promise<void>}
     */
    async connect() {
        log.debug('Bridge: Initiating connection via gRPC bridge');
        try {
            await this.grpcBridge.connect();
            
            // Update legacy state
            this.isConnected = this.grpcBridge.isConnected;
            this.isRegistered = this.grpcBridge.isRegistered;
            this.connectionState = 'connected';
            
            log.info('Bridge: Successfully connected to Pro Tools via gRPC');
        } catch (error) {
            log.error('Bridge: Connection failed', error);
            this.connectionState = 'error';
            throw this.createLegacyError(error);
        }
    }

    /**
     * Disconnect from Pro Tools PTSL
     * @returns {Promise<void>}
     */
    async disconnect() {
        log.debug('Bridge: Disconnecting from Pro Tools');
        try {
            await this.grpcBridge.disconnect();
            
            // Update legacy state
            this.isConnected = false;
            this.isRegistered = false;
            this.connectionState = 'disconnected';
            this.sessionInfo = null;
            
            log.info('Bridge: Successfully disconnected from Pro Tools');
        } catch (error) {
            log.error('Bridge: Disconnect failed', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Check connection status
     * @returns {Promise<Object>}
     */
    async checkConnection() {
        try {
            const status = await this.grpcBridge.checkConnection();
            return {
                connected: status.connected,
                registered: this.isRegistered,
                error: status.error || null
            };
        } catch (error) {
            return {
                connected: false,
                registered: false,
                error: error.message
            };
        }
    }

    /**
     * Get session information
     * @returns {Promise<Object>}
     */
    async getSessionInfo() {
        log.debug('Bridge: Getting session info via gRPC bridge');
        try {
            const sessionInfo = await this.grpcBridge.getSessionInfo();
            
            // Cache for legacy compatibility
            this.sessionInfo = sessionInfo;
            
            // Convert to legacy format if needed
            const legacySessionInfo = {
                name: sessionInfo.name,
                path: sessionInfo.path,
                sampleRate: sessionInfo.sampleRate,
                timeCodeRate: sessionInfo.timeCodeRate,
                bitDepth: sessionInfo.bitDepth,
                startTime: sessionInfo.startTime,
                length: sessionInfo.length,
                locked: sessionInfo.locked,
                // Add any other legacy fields for backward compatibility
                session_name: sessionInfo.name, // Legacy field name
                sample_rate: sessionInfo.sampleRate, // Legacy field name
                time_code_rate: sessionInfo.timeCodeRate, // Legacy field name
                bit_depth: sessionInfo.bitDepth, // Legacy field name
                start_time: sessionInfo.startTime // Legacy field name
            };
            
            log.debug('Bridge: Session info retrieved', legacySessionInfo);
            return legacySessionInfo;
        } catch (error) {
            log.error('Bridge: Failed to get session info', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Get track list
     * @param {Object} options - Track list options
     * @returns {Promise<Object>}
     */
    async getTrackList(options = {}) {
        log.debug('Bridge: Getting track list via gRPC bridge');
        try {
            const trackList = await this.grpcBridge.getTrackList(options);
            
            // Convert to legacy format
            const legacyTrackList = {
                track_list: trackList.tracks || [],
                total_count: trackList.totalCount || 0
            };
            
            return legacyTrackList;
        } catch (error) {
            log.error('Bridge: Failed to get track list', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Create memory location (marker)
     * @param {string} name - Marker name
     * @param {string} timecode - Marker timecode
     * @param {string} text - Marker text/comments
     * @param {Object} options - Additional options
     * @returns {Promise<Object>}
     */
    async createMemoryLocation(name, timecode, text = '', options = {}) {
        log.debug('Bridge: Creating memory location via gRPC bridge', {
            name,
            timecode,
            hasText: !!text,
            options
        });
        
        try {
            const result = await this.grpcBridge.createMemoryLocation(name, timecode, text, options);
            
            // Convert to legacy format
            const legacyResult = {
                success: result.success || true,
                name: result.name || name,
                timecode: result.timecode || timecode,
                text: result.text || text,
                // Add legacy response fields if needed
                memory_location: {
                    name: name,
                    start_time: timecode,
                    comments: text
                }
            };
            
            log.info('Bridge: Memory location created successfully', legacyResult);
            return legacyResult;
        } catch (error) {
            log.error('Bridge: Failed to create memory location', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Get memory locations
     * @param {Object} options - Options for filtering
     * @returns {Promise<Object>}
     */
    async getMemoryLocations(options = {}) {
        log.debug('Bridge: Getting memory locations via gRPC bridge');
        try {
            const result = await this.grpcBridge.getMemoryLocations(options);
            
            // Convert to legacy format
            const legacyResult = {
                memory_locations: result.memoryLocations || [],
                total_count: result.totalCount || 0,
                stats: result.stats || {}
            };
            
            return legacyResult;
        } catch (error) {
            log.error('Bridge: Failed to get memory locations', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Create multiple markers from Frame.io comments
     * @param {Array} comments - Frame.io comments
     * @param {Object} settings - Marker creation settings
     * @param {Function} progressCallback - Progress callback
     * @returns {Promise<Object>}
     */
    async createMarkers(comments, settings, progressCallback = null) {
        log.debug('Bridge: Creating markers via gRPC bridge', {
            commentCount: comments.length,
            settings
        });
        
        try {
            const result = await this.grpcBridge.createMarkers(comments, settings, progressCallback);
            
            // Convert to legacy format if needed
            const legacyResult = {
                success: result.success,
                markersCreated: result.markersCreated,
                errors: result.errors || [],
                warnings: result.warnings || [],
                summary: result.summary || {}
            };
            
            log.info('Bridge: Markers created successfully', {
                markersCreated: legacyResult.markersCreated,
                errors: legacyResult.errors.length,
                warnings: legacyResult.warnings.length
            });
            
            return legacyResult;
        } catch (error) {
            log.error('Bridge: Failed to create markers', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Validate session settings
     * @param {Object} settings - Settings to validate
     * @returns {Promise<Object>}
     */
    async validateSessionSettings(settings) {
        log.debug('Bridge: Validating session settings via gRPC bridge');
        try {
            const result = await this.grpcBridge.validateSessionSettings(settings);
            
            // Convert to legacy format
            const legacyResult = {
                valid: result.valid,
                errors: result.errors || [],
                warnings: result.warnings || [],
                sessionInfo: result.sessionInfo || null
            };
            
            return legacyResult;
        } catch (error) {
            log.error('Bridge: Failed to validate session settings', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Validate marker track
     * @param {number} trackNumber - Track number to validate
     * @returns {Promise<Object>}
     */
    async validateMarkerTrack(trackNumber) {
        log.debug('Bridge: Validating marker track via gRPC bridge');
        try {
            const result = await this.grpcBridge.validateMarkerTrack(trackNumber);
            return result;
        } catch (error) {
            log.error('Bridge: Failed to validate marker track', error);
            throw this.createLegacyError(error);
        }
    }

    /**
     * Legacy sendRequest method for backward compatibility
     * This method translates legacy WebSocket-style requests to gRPC calls
     * @param {string} command - Command name
     * @param {Object} parameters - Command parameters
     * @returns {Promise<Object>}
     */
    async sendRequest(command, parameters = {}) {
        log.debug('Bridge: Legacy sendRequest called', { command, parameters });
        
        try {
            // Map legacy commands to gRPC bridge methods
            switch (command) {
                case 'HostReadyCheck':
                    return await this.checkConnection();
                    
                case 'GetSessionName':
                    const sessionInfo = await this.getSessionInfo();
                    return { session_name: sessionInfo.name };
                    
                case 'GetSessionInfo':
                    return await this.getSessionInfo();
                    
                case 'GetSessionPath':
                    const pathInfo = await this.getSessionInfo();
                    return { session_path: pathInfo.path };
                    
                case 'GetSessionSampleRate':
                    const sampleRateInfo = await this.getSessionInfo();
                    return { sample_rate: sampleRateInfo.sampleRate };
                    
                case 'GetSessionTimeCodeRate':
                    const timeCodeInfo = await this.getSessionInfo();
                    return { time_code_rate: timeCodeInfo.timeCodeRate };
                    
                case 'GetSessionBitDepth':
                    const bitDepthInfo = await this.getSessionInfo();
                    return { bit_depth: bitDepthInfo.bitDepth };
                    
                case 'GetSessionStartTime':
                    const startTimeInfo = await this.getSessionInfo();
                    return { start_time: startTimeInfo.startTime };
                    
                case 'GetTrackList':
                    return await this.getTrackList(parameters);
                    
                case 'GetMemoryLocations':
                    return await this.getMemoryLocations(parameters);
                    
                case 'CreateMemoryLocation':
                    return await this.createMemoryLocation(
                        parameters.name,
                        parameters.start_time || parameters.startTime,
                        parameters.comments || parameters.text || '',
                        parameters
                    );
                    
                case 'RegisterConnection':
                    // This is handled internally by the gRPC bridge
                    return { success: true };
                    
                default:
                    log.warn('Bridge: Unknown legacy command', { command });
                    throw new Error(`Unknown command: ${command}`);
            }
        } catch (error) {
            log.error('Bridge: Legacy sendRequest failed', { command, error });
            throw this.createLegacyError(error);
        }
    }

    /**
     * Get debug information (legacy compatibility)
     * @returns {Object}
     */
    getDebugInfo() {
        const grpcDebugInfo = this.grpcBridge.getDebugInfo ? this.grpcBridge.getDebugInfo() : {};
        
        // Convert to legacy debug format
        return {
            connectionInfo: {
                url: `grpc://localhost:31416`, // gRPC equivalent
                state: this.connectionState || 'disconnected',
                isConnected: Boolean(this.isConnected),
                isRegistered: Boolean(this.isRegistered),
                reconnectAttempts: this.reconnectAttempts || 0,
                maxReconnectAttempts: this.maxReconnectAttempts || 5
            },
            sessionInfo: this.sessionInfo,
            grpcDebugInfo: grpcDebugInfo,
            bridge: {
                type: 'gRPC',
                version: '2.0',
                legacy_compatibility: true
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clear debug information (legacy compatibility)
     */
    clearDebugInfo() {
        if (this.grpcBridge.clearDebugInfo) {
            this.grpcBridge.clearDebugInfo();
        }
        log.debug('Bridge: Debug information cleared');
    }

    /**
     * Create a legacy-compatible error from a gRPC error
     * @param {Error} grpcError - Original gRPC error
     * @returns {PTSLError} Legacy-compatible error
     */
    createLegacyError(grpcError) {
        // Map gRPC error types to legacy error types
        let errorType = ERROR_TYPES.UNEXPECTED_ERROR;
        let errorMessage = grpcError.message || 'Unknown error';
        
        if (grpcError.type) {
            // If the error already has a type, use it
            errorType = grpcError.type;
        } else if (grpcError.message) {
            // Try to infer error type from message
            const message = grpcError.message.toLowerCase();
            
            if (message.includes('connection') && message.includes('refused')) {
                errorType = ERROR_TYPES.CONNECTION_REFUSED;
            } else if (message.includes('timeout')) {
                errorType = ERROR_TYPES.CONNECTION_TIMEOUT;
            } else if (message.includes('session')) {
                errorType = ERROR_TYPES.SESSION_INFO_FAILED;
            } else if (message.includes('marker') || message.includes('memory location')) {
                errorType = ERROR_TYPES.MARKER_CREATION_FAILED;
            }
        }
        
        const legacyError = new PTSLError(errorType, errorMessage, {
            originalError: grpcError,
            bridge: 'gRPC',
            timestamp: new Date().toISOString()
        });
        
        // Copy additional properties from original error
        if (grpcError.title) legacyError.title = grpcError.title;
        if (grpcError.guidance) legacyError.guidance = grpcError.guidance;
        if (grpcError.severity) legacyError.severity = grpcError.severity;
        if (grpcError.recoverable !== undefined) legacyError.recoverable = grpcError.recoverable;
        
        return legacyError;
    }

    /**
     * Destroy the bridge and clean up resources
     */
    async destroy() {
        log.debug('Bridge: Destroying PTSL API bridge');
        
        try {
            if (this.grpcBridge) {
                await this.grpcBridge.destroy();
            }
            
            // Clean up legacy state
            this.isConnected = false;
            this.isRegistered = false;
            this.sessionInfo = null;
            this.connectionState = 'disconnected';
            
            // Remove all listeners
            this.removeAllListeners();
            
            log.info('Bridge: PTSL API bridge destroyed successfully');
        } catch (error) {
            log.error('Bridge: Failed to destroy bridge cleanly', error);
            throw error;
        }
    }

    // Legacy property getters for backward compatibility
    get ws() {
        // Legacy WebSocket property - not applicable to gRPC
        return null;
    }

    get connectionUrl() {
        return 'grpc://localhost:31416';
    }

    get debugInfo() {
        return this.getDebugInfo();
    }
}

module.exports = {
    PTSLBridge,
    PTSLError,
    ERROR_TYPES
};