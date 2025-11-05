const EventEmitter = require('events');
const log = require('electron-log');

// Import connection manager and marker pipeline
const { PTSLConnectionManager, CONNECTION_STATE, PTSL_ERROR_TYPES: CONNECTION_ERROR_TYPES } = require('./ptsl-connection-manager.js');
const MarkerCreationPipeline = require('./marker-creation-pipeline.js');

// Comprehensive Error Classification System
const ERROR_TYPES = {
    // Connection Errors
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    CONNECTION_LOST: 'CONNECTION_LOST',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
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

// User-friendly error messages with guidance
const ERROR_MESSAGES = {
    [ERROR_TYPES.CONNECTION_REFUSED]: {
        title: 'Connection Refused',
        message: 'Pro Tools is not running or PTSL is not enabled.',
        guidance: process.platform === 'win32' 
            ? 'Please start Pro Tools and enable PTSL in Setup > Preferences > MIDI tab > PTSL (Pro Tools Scripting Library).'
            : 'Please start Pro Tools and enable PTSL in Pro Tools > Preferences > MIDI > PTSL (Pro Tools Scripting Library).',
        severity: 'error',
        recoverable: true
    },
    [ERROR_TYPES.CONNECTION_TIMEOUT]: {
        title: 'Connection Timeout',
        message: 'Unable to connect to Pro Tools within the timeout period.',
        guidance: 'Check that Pro Tools is running and not busy with another operation.',
        severity: 'error',
        recoverable: true
    },
    [ERROR_TYPES.CONNECTION_LOST]: {
        title: 'Connection Lost',
        message: 'The gRPC connection to Pro Tools was unexpectedly lost.',
        guidance: 'This usually happens when Pro Tools quits or becomes unresponsive. Please restart Pro Tools.',
        severity: 'warning',
        recoverable: true
    },
    [ERROR_TYPES.GRPC_ERROR]: {
        title: 'gRPC Communication Error',
        message: 'Failed to communicate with Pro Tools via gRPC.',
        guidance: 'Check that Pro Tools PTSL is configured for gRPC communication and port 31416 is available.',
        severity: 'error',
        recoverable: true
    },
    [ERROR_TYPES.PTSL_REGISTRATION_FAILED]: {
        title: 'PTSL Registration Failed',
        message: 'Failed to register with Pro Tools PTSL service.',
        guidance: 'Ensure Pro Tools is running and PTSL is enabled in preferences.',
        severity: 'error',
        recoverable: true
    }
};

/**
 * gRPC-based PTSL Bridge for Pro Tools communication
 * Uses connection manager with streams, heartbeats, and reconnection
 */
class PTSLGrpcBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Create connection manager with options
        this.connectionManager = new PTSLConnectionManager({
            host: options.host || 'localhost',
            port: options.port || 31416,
            companyName: 'alternatone',
            applicationName: 'notemarker'
        });
        
        // Session info cache
        this.sessionInfo = null;
        
        // Session validation cache
        this.validationCache = null;
        
        // Initialize marker creation pipeline
        this.markerPipeline = null;
        this.ipcHandler = options.ipcHandler || null;
        
        this.bindMethods();
        this.setupConnectionManagerEvents();
        this.setupErrorHandling();
        
        log.info('PTSLGrpcBridge initialized with connection manager', {
            host: this.connectionManager.host,
            port: this.connectionManager.port
        });
    }
    
    bindMethods() {
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.getSessionInfo = this.getSessionInfo.bind(this);
        this.createMemoryLocation = this.createMemoryLocation.bind(this);
        this.validateSessionSettings = this.validateSessionSettings.bind(this);
    }
    
    setupConnectionManagerEvents() {
        // Forward connection manager events to bridge
        this.connectionManager.on('connected', () => {
            this.sessionInfo = null; // Clear cache
            this.validationCache = null; // Clear validation cache
            
            // Initialize marker pipeline with connection
            this.markerPipeline = new MarkerCreationPipeline(this.connectionManager, this.ipcHandler);
            
            this.emit('connected');
        });
        
        this.connectionManager.on('disconnected', () => {
            this.sessionInfo = null; // Clear cache
            this.validationCache = null; // Clear validation cache
            this.markerPipeline = null; // Clear pipeline
            this.emit('disconnected');
        });
        
        this.connectionManager.on('state-changed', (newState, oldState) => {
            // Emit the event that main process expects (camelCase)
            this.emit('connectionStateChanged', {
                state: newState,
                isConnected: this.connectionManager.state === 'connected',
                isRegistered: this.connectionManager.state === 'connected',
                sessionId: this.connectionManager.sessionId,
                message: `Connection state changed to ${newState}`
            });
            // Keep the kebab-case version for compatibility
            this.emit('connection-state-changed', newState, oldState);
        });
        
        this.connectionManager.on('heartbeat', (status) => {
            this.emit('heartbeat', status);
        });
        
        this.connectionManager.on('pro-tools-not-running', () => {
            this.emit('error', this.createError(ERROR_TYPES.PRO_TOOLS_NOT_RUNNING, 'Pro Tools is not running'));
        });
        
        this.connectionManager.on('ptsl-disabled', () => {
            this.emit('error', this.createError(ERROR_TYPES.PTSL_NOT_ENABLED, 'PTSL is not enabled'));
        });
        
        this.connectionManager.on('version-mismatch', (error) => {
            this.emit('error', this.createError(ERROR_TYPES.UNEXPECTED_ERROR, 'PTSL version mismatch', error));
        });
        
        this.connectionManager.on('connection-failed', (error) => {
            this.emit('connection-failed', error);
        });
    }
    
    setupErrorHandling() {
        this.on('error', (error) => {
            log.error('PTSLGrpcBridge error:', error);
        });
    }
    
    /**
     * Connect to Pro Tools using connection manager
     */
    async connect() {
        try {
            log.info('Initiating connection via connection manager');
            await this.connectionManager.connect();
            return true;
        } catch (error) {
            log.error('Connection failed:', error);
            throw error;
        }
    }
    
    /**
     * Disconnect from Pro Tools using connection manager
     */
    async disconnect() {
        try {
            log.info('Disconnecting via connection manager');
            await this.connectionManager.disconnect();
        } catch (error) {
            log.error('Disconnect failed:', error);
            throw error;
        }
    }
    
    /**
     * Get Pro Tools session information
     */
    async getSessionInfo() {
        try {
            log.debug('Getting session info via connection manager');
            
            // Use cached session info if available
            if (this.sessionInfo) {
                return this.sessionInfo;
            }
            
            // Get fresh session info from connection manager
            this.sessionInfo = await this.connectionManager.getSessionInfo();
            return this.sessionInfo;
            
        } catch (error) {
            log.error('Failed to get session info:', error);
            throw this.createError(ERROR_TYPES.SESSION_INFO_FAILED, 'Failed to get session information', error);
        }
    }
    
    /**
     * Create a memory location (marker) in Pro Tools
     */
    async createMemoryLocation(name, timecode, text = '', options = {}) {
        try {
            log.debug('Creating memory location via connection manager', { name, timecode, text });
            
            const result = await this.connectionManager.createMemoryLocation(name, timecode, text, options);
            
            log.debug('Memory location created successfully', { name, timecode });
            return result;
            
        } catch (error) {
            log.error('Failed to create memory location:', error);
            throw this.createError(ERROR_TYPES.MARKER_CREATION_FAILED, 'Failed to create memory location', error);
        }
    }
    
    /**
     * Validate session settings against Pro Tools session
     * @param {Object} settings - Settings object with fps, markerTrack, sessionStart
     * @returns {Object} - Validation result with valid, errors, warnings
     */
    async validateSessionSettings(settings) {
        try {
            log.debug('Validating session settings', settings);
            
            // Check if we have cached validation results for these settings
            const settingsKey = JSON.stringify(settings);
            if (this.validationCache && this.validationCache.key === settingsKey) {
                log.debug('Returning cached validation results');
                return this.validationCache.result;
            }
            
            // Clear cache for debugging
            this.validationCache = null;
            
            // Ensure we're connected
            if (!this.connectionManager || this.connectionManager.state !== 'connected') {
                throw this.createError(ERROR_TYPES.CONNECTION_FAILED, 'Not connected to Pro Tools');
            }
            
            // Initialize validation result
            const validationResult = {
                valid: true,
                errors: [],
                warnings: [],
                sessionInfo: {}
            };
            
            // Get session information for validation
            const sessionInfo = await this.getSessionInfo();
            validationResult.sessionInfo = sessionInfo;
            
            // Validate frame rate
            await this.validateFrameRate(settings.fps, validationResult);
            
            // Validate marker track
            await this.validateMarkerTrack(settings.markerTrack, validationResult);
            
            // Validate session start time format
            this.validateSessionStartTime(settings.sessionStart, validationResult);
            
            // Set overall validity
            validationResult.valid = validationResult.errors.length === 0;
            
            // Cache the results
            this.validationCache = {
                key: settingsKey,
                result: validationResult,
                timestamp: Date.now()
            };
            
            log.info('Session validation completed', {
                valid: validationResult.valid,
                errors: validationResult.errors.length,
                warnings: validationResult.warnings.length
            });
            
            return validationResult;
            
        } catch (error) {
            log.error('Session validation failed:', error);
            throw this.createError(ERROR_TYPES.VALIDATION_FAILED, 'Session validation failed', error);
        }
    }
    
    /**
     * Validate frame rate against Pro Tools session
     * @private
     */
    async validateFrameRate(fps, validationResult) {
        try {
            // Get session timecode rate using proper message builder (same pattern as getSessionInfo)
            const timecodeRateRequest = this.connectionManager.messageBuilder.buildGetSessionTimeCodeRateRequest();
            const timecodeResponse = await this.connectionManager.sendGrpcRequest(timecodeRateRequest);
            
            // Parse JSON response (same pattern as GetTrackList)
            let timecodeResponseBody = {};
            if (timecodeResponse.response_body_json) {
                try {
                    timecodeResponseBody = JSON.parse(timecodeResponse.response_body_json);
                } catch (e) {
                    log.warn('Failed to parse timecode rate response:', e);
                }
            }
            
            const sessionTimecodeRate = timecodeResponseBody.timecode_rate || timecodeResponse.getSessionTimeCodeRateResponseBody?.timeCodeRate || 'Fps25';
            validationResult.sessionInfo.timecodeRate = sessionTimecodeRate;
            
            // Convert fps string to standard format for comparison
            const normalizedFps = this.normalizeFpsValue(fps);
            const normalizedSessionRate = this.normalizeFpsValue(sessionTimecodeRate);
            
            if (normalizedFps !== normalizedSessionRate) {
                validationResult.warnings.push(
                    `Frame rate mismatch: Settings (${fps}) vs Session (${sessionTimecodeRate}). ` +
                    'This may cause timecode synchronization issues.'
                );
            }
            
        } catch (error) {
            log.warn('Could not validate frame rate:', error);
            validationResult.warnings.push('Unable to validate frame rate against Pro Tools session');
        }
    }
    
    /**
     * Validate marker track exists
     * @private  
     */
    async validateMarkerTrack(markerTrack, validationResult) {
        try {
            log.debug('validateMarkerTrack called', { markerTrack, sessionId: this.connectionManager.sessionId });
            
            // Use connection manager's getTrackList method (same pattern as getSessionInfo)
            log.debug('🔍 TRACE[1] Before calling connectionManager.getTrackList (BRIDGE):', {
                markerTrack: markerTrack,
                sessionId: this.connectionManager.sessionId,
                connectionState: this.connectionManager.state
            });
            
            const trackListResult = await this.connectionManager.getTrackList();
            
            log.debug('GetTrackList result received in bridge', { 
                hasResult: !!trackListResult,
                tracksCount: trackListResult?.tracks?.length || 0,
                totalCount: trackListResult?.totalCount || 0,
                firstTrack: trackListResult?.tracks?.[0]
            });
            
            const tracks = trackListResult?.tracks || [];
            validationResult.sessionInfo.trackCount = tracks.length;
            
            // Check if marker track number is valid
            if (markerTrack < 1 || markerTrack > tracks.length) {
                validationResult.errors.push(
                    `Invalid marker track: ${markerTrack}. ` +
                    `Session has ${tracks.length} tracks (valid range: 1-${tracks.length})`
                );
            } else {
                // Check if the specified track exists and get its info
                const targetTrack = tracks[markerTrack - 1];
                if (targetTrack) {
                    validationResult.sessionInfo.markerTrackName = targetTrack.name;
                    validationResult.sessionInfo.markerTrackType = targetTrack.type;
                }
            }
            
        } catch (error) {
            log.warn('Could not validate marker track:', error);
            validationResult.warnings.push('Unable to validate marker track against Pro Tools session');
        }
    }
    
    /**
     * Validate session start time format
     * @private
     */
    validateSessionStartTime(sessionStart, validationResult) {
        // Validate timecode format
        const timecodeRegex = /^\d{1,2}:\d{2}:\d{2}:\d{2}$/;
        if (!timecodeRegex.test(sessionStart)) {
            validationResult.errors.push(
                `Invalid session start time format: "${sessionStart}". ` +
                'Expected format: HH:MM:SS:FF (e.g., "01:00:00:00")'
            );
            return;
        }
        
        // Parse timecode components
        const [hours, minutes, seconds, frames] = sessionStart.split(':').map(Number);
        
        // Validate ranges
        if (hours > 23) {
            validationResult.errors.push(`Invalid hours in session start time: ${hours} (max: 23)`);
        }
        if (minutes > 59) {
            validationResult.errors.push(`Invalid minutes in session start time: ${minutes} (max: 59)`);
        }
        if (seconds > 59) {
            validationResult.errors.push(`Invalid seconds in session start time: ${seconds} (max: 59)`);
        }
        if (frames > 29) {
            validationResult.warnings.push(`High frame value in session start time: ${frames}. Verify this matches your session's frame rate.`);
        }
    }
    
    /**
     * Normalize FPS values for comparison
     * @private
     */
    normalizeFpsValue(fps) {
        const fpsString = String(fps).toLowerCase();
        
        // Handle common frame rate variations
        const fpsMap = {
            '23.976': '23.976',
            '23.98': '23.976',
            '24': '24',
            '25': '25', 
            '29.97': '29.97',
            '29.97drop': '29.97',
            '30': '30',
            '50': '50',
            '59.94': '59.94',
            '59.94drop': '59.94',
            '60': '60'
        };
        
        return fpsMap[fpsString] || fpsString;
    }
    
    /**
     * Create multiple memory locations from Frame.io comments
     * @param {Array} frameioMarkers - Array of parsed Frame.io comments with timecodes
     * @param {Object} options - Options including sessionStart, progress callback
     * @returns {Object} Creation results with counts and details
     */
    async createMemoryLocations(frameioMarkers, options = {}) {
        try {
            log.info(`Starting marker creation for ${frameioMarkers.length} Frame.io markers`);
            
            // Ensure we're connected
            if (!this.connectionManager || this.connectionManager.state !== 'connected') {
                throw this.createError(ERROR_TYPES.CONNECTION_FAILED, 'Not connected to Pro Tools');
            }
            
            const { sessionStart = '00:00:00:00', stopOnError = false } = options;
            
            // Initialize result tracking
            const result = {
                total: frameioMarkers.length,
                created: 0,
                failed: 0,
                skipped: 0,
                errors: [],
                markers: [],
                startTime: Date.now(),
                endTime: null
            };
            
            // Emit initial progress event
            this.emitProgressEvent({
                phase: 'starting',
                current: 0,
                total: frameioMarkers.length,
                percent: 0,
                status: 'Initializing marker creation...',
                created: 0,
                failed: 0,
                currentMarker: null
            });
            
            // Process each marker with progress reporting
            for (let i = 0; i < frameioMarkers.length; i++) {
                const marker = frameioMarkers[i];
                const markerName = marker.author || `Comment ${i + 1}`;
                
                // Emit progress for current marker
                this.emitProgressEvent({
                    phase: 'creating',
                    current: i + 1,
                    total: frameioMarkers.length,
                    percent: Math.round(((i + 1) / frameioMarkers.length) * 100),
                    status: `Creating marker: ${markerName}`,
                    created: result.created,
                    failed: result.failed,
                    currentMarker: {
                        name: markerName,
                        timecode: marker.timecode,
                        isReply: marker.isReply
                    }
                });
                
                try {
                    // Calculate absolute timecode (comment timecode + session start offset)
                    const absoluteTimecode = this.calculateAbsoluteTimecode(marker.timecode, sessionStart);
                    
                    // Determine color index (0 for main comments, 1 for replies)
                    const colorIndex = marker.isReply ? 1 : 0;
                    
                    // Create the memory location using PTSL gRPC
                    const createResult = await this.createSingleMemoryLocation({
                        name: markerName,
                        timecode: absoluteTimecode,
                        text: marker.text || '',
                        colorIndex: colorIndex,
                        trackIndex: options.markerTrack || 1
                    });
                    
                    result.created++;
                    result.markers.push({
                        original: marker,
                        created: createResult,
                        timecode: absoluteTimecode,
                        colorIndex: colorIndex
                    });
                    
                    log.debug(`Created marker ${i + 1}/${frameioMarkers.length}`, {
                        author: marker.author,
                        timecode: absoluteTimecode,
                        isReply: marker.isReply
                    });
                    
                    // Emit success progress event
                    this.emitProgressEvent({
                        phase: 'creating',
                        current: i + 1,
                        total: frameioMarkers.length,
                        percent: Math.round(((i + 1) / frameioMarkers.length) * 100),
                        status: `Created marker: ${markerName}`,
                        created: result.created,
                        failed: result.failed,
                        currentMarker: {
                            name: markerName,
                            timecode: absoluteTimecode,
                            isReply: marker.isReply,
                            success: true
                        }
                    });
                    
                } catch (error) {
                    result.failed++;
                    const errorDetails = {
                        marker: marker,
                        error: error.message,
                        index: i,
                        timestamp: new Date().toISOString(),
                        isCritical: this.isCriticalError(error)
                    };
                    result.errors.push(errorDetails);
                    
                    log.error(`Failed to create marker ${i + 1}:`, error);
                    
                    // Emit error progress event
                    this.emitProgressEvent({
                        phase: 'creating',
                        current: i + 1,
                        total: frameioMarkers.length,
                        percent: Math.round(((i + 1) / frameioMarkers.length) * 100),
                        status: `Failed to create marker: ${markerName}`,
                        created: result.created,
                        failed: result.failed,
                        currentMarker: {
                            name: markerName,
                            timecode: marker.timecode,
                            isReply: marker.isReply,
                            success: false,
                            error: error.message
                        }
                    });
                    
                    // Stop batch creation on critical errors if specified
                    if (stopOnError && errorDetails.isCritical) {
                        log.warn(`Stopping marker creation due to critical error: ${error.message}`);
                        
                        // Mark remaining markers as skipped
                        result.skipped = frameioMarkers.length - (i + 1);
                        
                        this.emitProgressEvent({
                            phase: 'stopped',
                            current: i + 1,
                            total: frameioMarkers.length,
                            percent: Math.round(((i + 1) / frameioMarkers.length) * 100),
                            status: `Stopped due to critical error: ${error.message}`,
                            created: result.created,
                            failed: result.failed,
                            skipped: result.skipped,
                            currentMarker: null
                        });
                        
                        break;
                    }
                }
            }
            
            // Calculate completion time and summary
            result.endTime = Date.now();
            result.duration = result.endTime - result.startTime;
            result.successRate = result.total > 0 ? Math.round((result.created / result.total) * 100) : 0;
            
            // Emit completion event with detailed summary
            this.emitProgressEvent({
                phase: 'completed',
                current: result.total,
                total: result.total,
                percent: 100,
                status: this.generateCompletionSummary(result),
                created: result.created,
                failed: result.failed,
                skipped: result.skipped,
                duration: result.duration,
                successRate: result.successRate,
                summary: {
                    total: result.total,
                    created: result.created,
                    failed: result.failed,
                    skipped: result.skipped,
                    duration: result.duration,
                    successRate: result.successRate,
                    errors: result.errors.length > 0 ? result.errors : null
                }
            });
            
            log.info('Marker creation completed', {
                total: result.total,
                created: result.created,
                failed: result.failed,
                skipped: result.skipped,
                duration: `${result.duration}ms`,
                successRate: `${result.successRate}%`
            });
            
            return result;
            
        } catch (error) {
            log.error('Marker creation failed:', error);
            
            // Emit error completion event
            this.emitProgressEvent({
                phase: 'error',
                current: 0,
                total: frameioMarkers?.length || 0,
                percent: 0,
                status: `Marker creation failed: ${error.message}`,
                created: 0,
                failed: 0,
                error: error.message
            });
            
            throw this.createError(ERROR_TYPES.MARKER_CREATION_FAILED, 'Marker creation failed', error);
        }
    }
    
    /**
     * Calculate absolute timecode by adding comment timecode to session start
     * @param {string} commentTimecode - Comment timecode (e.g., "00:03:30:12")
     * @param {string} sessionStart - Session start timecode (e.g., "01:00:00:00")
     * @returns {string} Absolute timecode
     * @private
     */
    calculateAbsoluteTimecode(commentTimecode, sessionStart) {
        try {
            // Use TimecodeCalculator for precise calculation
            const { TimecodeCalculator } = require('./timecode-calculator');
            
            // Get current session frame rate for accurate calculation
            const sessionInfo = this.connectionManager.getSessionInfo();
            let frameRate = '29.97'; // default fallback
            
            if (sessionInfo && sessionInfo.frameRate) {
                frameRate = sessionInfo.frameRate.toString();
            }
            
            // Create calculator with correct frame rate
            const calculator = new TimecodeCalculator(frameRate);
            
            // Use precise timecode addition
            const result = calculator.addTimecodes(commentTimecode, sessionStart);
            
            log.debug('Absolute timecode calculated', {
                commentTimecode,
                sessionStart,
                frameRate,
                absoluteTimecode: result.absoluteTimecode
            });
            
            return result.absoluteTimecode;
            
        } catch (error) {
            log.error('Failed to calculate absolute timecode:', error);
            
            // Fallback to original simple calculation if TimecodeCalculator fails
            try {
                const [cHours, cMinutes, cSeconds, cFrames] = commentTimecode.split(':').map(Number);
                const [sHours, sMinutes, sSeconds, sFrames] = sessionStart.split(':').map(Number);
                
                let totalFrames = cFrames + sFrames;
                let totalSeconds = cSeconds + sSeconds;
                let totalMinutes = cMinutes + sMinutes;
                let totalHours = cHours + sHours;
                
                // Use 24fps as safer fallback than 30fps
                const maxFrames = 24;
                if (totalFrames >= maxFrames) {
                    totalSeconds += Math.floor(totalFrames / maxFrames);
                    totalFrames = totalFrames % maxFrames;
                }
                
                if (totalSeconds >= 60) {
                    totalMinutes += Math.floor(totalSeconds / 60);
                    totalSeconds = totalSeconds % 60;
                }
                
                if (totalMinutes >= 60) {
                    totalHours += Math.floor(totalMinutes / 60);
                    totalMinutes = totalMinutes % 60;
                }
                
                return [
                    totalHours.toString().padStart(2, '0'),
                    totalMinutes.toString().padStart(2, '0'),
                    totalSeconds.toString().padStart(2, '0'),
                    totalFrames.toString().padStart(2, '0')
                ].join(':');
                
            } catch (fallbackError) {
                log.error('Fallback timecode calculation also failed:', fallbackError);
                throw new Error(`Invalid timecode format: ${commentTimecode} or ${sessionStart}`);
            }
        }
    }
    
    /**
     * Create a single memory location using PTSL gRPC
     * @param {Object} markerData - Marker data with name, timecode, text, colorIndex
     * @returns {Object} Creation result from Pro Tools
     * @private
     */
    async createSingleMemoryLocation(markerData) {
        try {
            const { name, timecode, text, colorIndex, trackIndex } = markerData;
            
            // Use the connection manager's createMemoryLocation method which has proper protobuf structure
            const result = await this.connectionManager.createMemoryLocation(
                name,
                timecode,
                text,
                {
                    colorIndex: colorIndex || 0
                }
            );
            
            log.debug('Memory location created successfully', {
                name: name,
                timecode: timecode,
                colorIndex: colorIndex,
                responseId: result.response?.responseId
            });
            
            return result;
            
        } catch (error) {
            log.error('Failed to create single memory location:', error);
            throw error;
        }
    }
    
    /**
     * Get marker creation pipeline statistics
     */
    getMarkerPipelineStats() {
        if (!this.markerPipeline) {
            return null;
        }
        
        return this.markerPipeline.getStatistics();
    }
    
    /**
     * Get error handler statistics
     */
    getErrorStatistics() {
        const connectionStats = this.connectionManager?.errorHandler?.getErrorStatistics() || {};
        const pipelineStats = this.markerPipeline?.errorHandler?.getErrorStatistics() || {};
        
        return {
            connection: connectionStats,
            pipeline: pipelineStats,
            combined: {
                totalErrors: (connectionStats.totalErrors || 0) + (pipelineStats.totalErrors || 0),
                recentErrors: (connectionStats.recentErrors || 0) + (pipelineStats.recentErrors || 0)
            }
        };
    }
    
    /**
     * Reset error counters for fresh session
     */
    resetErrorCounters() {
        if (this.connectionManager?.errorHandler) {
            this.connectionManager.errorHandler.resetRetryCounters();
        }
        if (this.markerPipeline?.errorHandler) {
            this.markerPipeline.errorHandler.resetRetryCounters();
        }
        log.info('Error counters reset');
    }
    
    /**
     * Get memory locations from Pro Tools
     * @param {Object} [options] - Optional filtering parameters
     * @returns {Promise<Object>} Memory locations with conflict detection data
     */
    async getMemoryLocations(options = {}) {
        try {
            log.debug('Getting memory locations via connection manager');
            
            // Ensure we're connected
            if (!this.connectionManager || this.connectionManager.state !== 'connected') {
                throw this.createError(ERROR_TYPES.CONNECTION_FAILED, 'Not connected to Pro Tools');
            }
            
            // Use connection manager's getMemoryLocations method
            const result = await this.connectionManager.getMemoryLocations(options);
            
            log.debug('Memory locations retrieved successfully', {
                count: result.memoryLocations.length,
                hasStats: !!result.stats,
                options
            });
            
            // Return in format expected by marker creation pipeline and conflict detection
            return {
                memoryLocations: result.memoryLocations,
                stats: result.stats,
                totalCount: result.memoryLocations.length,
                response: result.response
            };
            
        } catch (error) {
            log.error('Failed to get memory locations:', error);
            throw this.createError(ERROR_TYPES.SESSION_INFO_FAILED, 'Failed to get memory locations', error);
        }
    }
    
    /**
     * Get track list from Pro Tools
     * @param {Object} [options] - Optional filtering parameters
     * @returns {Promise<Object>} Track list
     */
    async getTrackList(options = {}) {
        try {
            log.debug('Getting track list via connection manager');
            
            // Ensure we're connected
            if (!this.connectionManager || this.connectionManager.state !== 'connected') {
                throw this.createError(ERROR_TYPES.CONNECTION_FAILED, 'Not connected to Pro Tools');
            }
            
            // Use connection manager's getTrackList method
            const result = await this.connectionManager.getTrackList(options);
            
            log.debug('Track list retrieved successfully', {
                trackCount: result.tracks?.length || 0,
                hasStats: !!result.stats,
                options
            });
            
            // Return in format expected by API bridge
            return {
                tracks: result.tracks || [],
                totalCount: result.tracks?.length || 0,
                stats: result.stats,
                response: result.response
            };
            
        } catch (error) {
            log.error('Failed to get track list:', error);
            throw this.createError(ERROR_TYPES.SESSION_INFO_FAILED, 'Failed to get track list', error);
        }
    }
    
    /**
     * Get connection status and statistics
     */
    getStatus() {
        const connectionStatus = this.connectionManager.getStatus();
        return {
            isConnected: connectionStatus.isConnected,
            state: connectionStatus.state,
            sessionId: connectionStatus.sessionId,
            sessionInfo: this.sessionInfo,
            lastHeartbeat: connectionStatus.lastHeartbeat,
            heartbeatFailures: connectionStatus.heartbeatFailures,
            reconnectAttempts: connectionStatus.reconnectAttempts,
            stats: connectionStatus.stats,
            uptime: connectionStatus.uptime
        };
    }
    
    /**
     * Emit progress event to both internal listeners and IPC
     * @param {Object} progressData - Progress data to emit
     * @private
     */
    emitProgressEvent(progressData) {
        // Add timestamp to progress data
        const progressWithTimestamp = {
            ...progressData,
            timestamp: new Date().toISOString()
        };
        
        // Emit to internal event listeners
        this.emit('marker-creation-progress', progressWithTimestamp);
        
        // Send to renderer via IPC if handler is available
        if (this.ipcHandler && typeof this.ipcHandler.send === 'function') {
            this.ipcHandler.send('marker-creation-progress', progressWithTimestamp);
        }
        
        log.debug('Progress event emitted', {
            phase: progressData.phase,
            current: progressData.current,
            total: progressData.total,
            percent: progressData.percent,
            status: progressData.status
        });
    }
    
    /**
     * Check if an error is critical and should stop batch processing
     * @param {Error} error - Error to classify
     * @returns {boolean} - True if error is critical
     * @private
     */
    isCriticalError(error) {
        // Define critical error conditions
        const criticalErrorTypes = [
            ERROR_TYPES.CONNECTION_FAILED,
            ERROR_TYPES.CONNECTION_LOST,
            ERROR_TYPES.SESSION_NOT_OPEN,
            ERROR_TYPES.SESSION_LOCKED,
            ERROR_TYPES.PTSL_NOT_ENABLED,
            ERROR_TYPES.PRO_TOOLS_NOT_RUNNING
        ];
        
        // Check if error type is critical
        if (error.type && criticalErrorTypes.includes(error.type)) {
            return true;
        }
        
        // Check error message for critical indicators
        const criticalMessages = [
            'connection lost',
            'connection failed',
            'not connected',
            'session not open',
            'pro tools not running',
            'ptsl not enabled',
            'session locked'
        ];
        
        const errorMessage = error.message?.toLowerCase() || '';
        return criticalMessages.some(msg => errorMessage.includes(msg));
    }
    
    /**
     * Generate completion summary message
     * @param {Object} result - Creation result object
     * @returns {string} - Human-readable summary
     * @private
     */
    generateCompletionSummary(result) {
        const { total, created, failed, skipped, duration, successRate } = result;
        
        if (created === total) {
            return `✅ All ${total} markers created successfully in ${Math.round(duration / 1000)}s`;
        }
        
        if (created === 0) {
            return `❌ Failed to create any markers (${failed} failed)`;
        }
        
        let summary = `📊 Created ${created}/${total} markers (${successRate}% success)`;
        
        if (failed > 0) {
            summary += `, ${failed} failed`;
        }
        
        if (skipped > 0) {
            summary += `, ${skipped} skipped`;
        }
        
        summary += ` in ${Math.round(duration / 1000)}s`;
        
        return summary;
    }
    
    /**
     * Create standardized error object using comprehensive error classification
     */
    createError(type, message, originalError = null) {
        // If we have an original error and connection manager with error handler, use comprehensive classification
        if (originalError && this.connectionManager?.errorHandler) {
            try {
                const classifiedError = this.connectionManager.errorHandler.classifyError(originalError, {
                    operation: 'bridge_operation',
                    bridge: 'gRPC',
                    requestedType: type
                });
                
                // Use classified error if it provides better information
                if (classifiedError.type && classifiedError.userMessage) {
                    return {
                        ...classifiedError,
                        originalType: type,
                        bridgeMessage: message,
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (classificationError) {
                log.warn('Error classification failed, falling back to basic error:', classificationError);
            }
        }
        
        // Fallback to basic error info for legacy compatibility
        const errorInfo = ERROR_MESSAGES[type] || {
            title: 'Unknown Error',
            message: message,
            guidance: 'Please try again or contact support.',
            severity: 'error',
            recoverable: false
        };
        
        const error = new Error(message);
        error.type = type;
        error.title = errorInfo.title;
        error.guidance = errorInfo.guidance;
        error.severity = errorInfo.severity;
        error.recoverable = errorInfo.recoverable;
        error.originalError = originalError;
        error.timestamp = new Date().toISOString();
        
        // Add action suggestions from error definitions
        if (errorInfo.actionSuggestions) {
            error.actionSuggestions = errorInfo.actionSuggestions;
        }
        
        // Add user-friendly message
        error.userMessage = errorInfo.userMessage || message;
        
        return error;
    }
    
    /**
     * Cleanup resources
     */
    async destroy() {
        try {
            await this.connectionManager.destroy();
            this.removeAllListeners();
            log.info('PTSLGrpcBridge destroyed');
        } catch (error) {
            log.error('Error during bridge destruction:', error);
        }
    }
}

module.exports = {
    PTSLGrpcBridge,
    ERROR_TYPES,
    ERROR_MESSAGES
};