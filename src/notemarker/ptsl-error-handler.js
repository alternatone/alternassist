const grpc = require('@grpc/grpc-js');
const log = require('electron-log');

/**
 * Comprehensive PTSL Error Handler
 * Maps gRPC/PTSL errors to user-friendly messages with retry logic and action suggestions
 */

// PTSL Error Types from SDK
const PTSL_ERROR_TYPES = {
    // Connection Errors
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    CONNECTION_LOST: 'CONNECTION_LOST',
    GRPC_UNAVAILABLE: 'GRPC_UNAVAILABLE',
    
    // Version and Compatibility
    SDK_VERSION_MISMATCH: 'SDK_VERSION_MISMATCH',
    PTSL_VERSION_INCOMPATIBLE: 'PTSL_VERSION_INCOMPATIBLE',
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    
    // Session Errors
    SESSION_NOT_OPEN: 'SESSION_NOT_OPEN',
    SESSION_LOCKED: 'SESSION_LOCKED',
    SESSION_READ_ONLY: 'SESSION_READ_ONLY',
    SESSION_BUSY: 'SESSION_BUSY',
    SESSION_INVALID: 'SESSION_INVALID',
    
    // Authentication and Permission
    REGISTRATION_FAILED: 'REGISTRATION_FAILED',
    INSUFFICIENT_PRIVILEGES: 'INSUFFICIENT_PRIVILEGES',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    
    // Marker Creation Errors
    INVALID_TIMECODE: 'INVALID_TIMECODE',
    MARKER_LIMIT_EXCEEDED: 'MARKER_LIMIT_EXCEEDED',
    MARKER_CONFLICT: 'MARKER_CONFLICT',
    INVALID_MARKER_NAME: 'INVALID_MARKER_NAME',
    TRACK_NOT_FOUND: 'TRACK_NOT_FOUND',
    
    // Transient Errors
    TEMPORARY_FAILURE: 'TEMPORARY_FAILURE',
    RESOURCE_BUSY: 'RESOURCE_BUSY',
    OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
    
    // System Errors
    PTSL_NOT_ENABLED: 'PTSL_NOT_ENABLED',
    PRO_TOOLS_NOT_RUNNING: 'PRO_TOOLS_NOT_RUNNING',
    SYSTEM_ERROR: 'SYSTEM_ERROR'
};

// User-friendly error definitions with retry logic and action suggestions
const ERROR_DEFINITIONS = {
    [PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH]: {
        title: 'Version Incompatible',
        message: 'Pro Tools version incompatible with NoteMarker',
        userMessage: 'Your Pro Tools version is not compatible with this version of NoteMarker. Please update either Pro Tools or NoteMarker to compatible versions.',
        severity: 'error',
        retryable: false,
        autoRetry: false,
        maxRetries: 0,
        retryDelay: 0,
        actionSuggestions: [
            'Update Pro Tools to the latest version',
            'Check NoteMarker compatibility requirements',
            'Contact support if the issue persists',
            'Visit Pro Tools compatibility documentation'
        ],
        recoveryStrategy: 'version_check',
        category: 'compatibility'
    },
    
    [PTSL_ERROR_TYPES.CONNECTION_REFUSED]: {
        title: 'Connection Refused',
        message: 'Pro Tools not running or PTSL not enabled',
        userMessage: 'Cannot connect to Pro Tools. Make sure Pro Tools is running and PTSL is enabled in preferences.',
        severity: 'error',
        retryable: true,
        autoRetry: true,
        maxRetries: 3,
        retryDelay: 2000,
        actionSuggestions: [
            'Start Pro Tools if not running',
            'Enable PTSL in Pro Tools > Preferences > MIDI > PTSL',
            'Restart Pro Tools if PTSL was just enabled',
            'Check firewall settings (port 31416)',
            'Try clicking Connect again'
        ],
        recoveryStrategy: 'connection_retry',
        category: 'connection'
    },
    
    [PTSL_ERROR_TYPES.PTSL_NOT_ENABLED]: {
        title: 'PTSL Not Enabled',
        message: 'PTSL service not enabled in Pro Tools',
        userMessage: 'PTSL (Pro Tools Scripting Library) is not enabled. Please enable it in Pro Tools preferences.',
        severity: 'error',
        retryable: true,
        autoRetry: false,
        maxRetries: 1,
        retryDelay: 5000,
        actionSuggestions: [
            'Open Pro Tools > Preferences > MIDI',
            'Check "PTSL (Pro Tools Scripting Library)" checkbox',
            'Restart Pro Tools after enabling PTSL',
            'Try connecting again'
        ],
        recoveryStrategy: 'ptsl_enable',
        category: 'configuration'
    },
    
    [PTSL_ERROR_TYPES.SESSION_LOCKED]: {
        title: 'Session Locked',
        message: 'Pro Tools session is locked for editing',
        userMessage: 'The Pro Tools session is currently locked and cannot be modified. Please unlock the session to create markers.',
        severity: 'warning',
        retryable: true,
        autoRetry: false,
        maxRetries: 2,
        retryDelay: 3000,
        actionSuggestions: [
            'Unlock the session in Pro Tools',
            'Wait for current operation to complete',
            'Check if session is in read-only mode',
            'Try again after unlocking'
        ],
        recoveryStrategy: 'session_unlock',
        category: 'session'
    },
    
    [PTSL_ERROR_TYPES.SESSION_NOT_OPEN]: {
        title: 'No Session Open',
        message: 'No Pro Tools session is currently open',
        userMessage: 'Please open a Pro Tools session before creating markers.',
        severity: 'error',
        retryable: true,
        autoRetry: false,
        maxRetries: 1,
        retryDelay: 1000,
        actionSuggestions: [
            'Open a Pro Tools session',
            'Create a new session if needed',
            'Make sure the session is fully loaded',
            'Try connecting again after opening session'
        ],
        recoveryStrategy: 'session_open',
        category: 'session'
    },
    
    [PTSL_ERROR_TYPES.INVALID_TIMECODE]: {
        title: 'Invalid Timecode',
        message: 'Timecode format error',
        userMessage: 'One or more timecodes in your Frame.io file are invalid or incompatible with the current session.',
        severity: 'warning',
        retryable: false,
        autoRetry: false,
        maxRetries: 0,
        retryDelay: 0,
        actionSuggestions: [
            'Check timecode format in Frame.io export',
            'Ensure timecodes match session frame rate',
            'Review markers with invalid timecodes',
            'Export Frame.io data with correct timecode format'
        ],
        recoveryStrategy: 'timecode_validation',
        category: 'validation'
    },
    
    [PTSL_ERROR_TYPES.MARKER_LIMIT_EXCEEDED]: {
        title: 'Marker Limit Exceeded',
        message: 'Too many markers for Pro Tools session',
        userMessage: 'The number of markers exceeds Pro Tools limits. Consider splitting markers across multiple sessions.',
        severity: 'warning',
        retryable: false,
        autoRetry: false,
        maxRetries: 0,
        retryDelay: 0,
        actionSuggestions: [
            'Reduce the number of markers to create',
            'Delete some existing markers in Pro Tools',
            'Split markers across multiple sessions',
            'Contact support for marker limit information'
        ],
        recoveryStrategy: 'marker_limit',
        category: 'limits'
    },
    
    [PTSL_ERROR_TYPES.SESSION_BUSY]: {
        title: 'Session Busy',
        message: 'Pro Tools is currently busy with another operation',
        userMessage: 'Pro Tools is busy with another operation. Please wait and try again.',
        severity: 'warning',
        retryable: true,
        autoRetry: true,
        maxRetries: 5,
        retryDelay: 2000,
        actionSuggestions: [
            'Wait for current operation to complete',
            'Stop any running operations in Pro Tools',
            'Try again in a few seconds',
            'Check Pro Tools status'
        ],
        recoveryStrategy: 'wait_retry',
        category: 'transient'
    },
    
    [PTSL_ERROR_TYPES.OPERATION_TIMEOUT]: {
        title: 'Operation Timeout',
        message: 'Pro Tools operation timed out',
        userMessage: 'The operation took too long to complete. This may happen with large sessions or heavy system load.',
        severity: 'warning',
        retryable: true,
        autoRetry: true,
        maxRetries: 2,
        retryDelay: 5000,
        actionSuggestions: [
            'Try again with smaller batches',
            'Close unnecessary applications',
            'Check system performance',
            'Restart Pro Tools if problem persists'
        ],
        recoveryStrategy: 'timeout_retry',
        category: 'performance'
    },
    
    [PTSL_ERROR_TYPES.INSUFFICIENT_PRIVILEGES]: {
        title: 'Insufficient Privileges',
        message: 'Not authorized to perform this operation',
        userMessage: 'NoteMarker does not have sufficient privileges to modify the Pro Tools session.',
        severity: 'error',
        retryable: false,
        autoRetry: false,
        maxRetries: 0,
        retryDelay: 0,
        actionSuggestions: [
            'Check session permissions in Pro Tools',
            'Ensure session is not read-only',
            'Restart Pro Tools with administrator privileges',
            'Check file system permissions'
        ],
        recoveryStrategy: 'privilege_check',
        category: 'authorization'
    },
    
    [PTSL_ERROR_TYPES.CONNECTION_LOST]: {
        title: 'Connection Lost',
        message: 'Connection to Pro Tools was lost',
        userMessage: 'The connection to Pro Tools was lost unexpectedly. This may happen if Pro Tools quits or becomes unresponsive.',
        severity: 'warning',
        retryable: true,
        autoRetry: true,
        maxRetries: 3,
        retryDelay: 3000,
        actionSuggestions: [
            'Check if Pro Tools is still running',
            'Restart Pro Tools if it has crashed',
            'Try reconnecting to Pro Tools',
            'Check network connectivity if using remote Pro Tools'
        ],
        recoveryStrategy: 'connection_retry',
        category: 'connection'
    },
    
    [PTSL_ERROR_TYPES.CONNECTION_TIMEOUT]: {
        title: 'Connection Timeout',
        message: 'Connection to Pro Tools timed out',
        userMessage: 'Failed to connect to Pro Tools within the timeout period. This may indicate network issues or Pro Tools being busy.',
        severity: 'warning',
        retryable: true,
        autoRetry: true,
        maxRetries: 2,
        retryDelay: 5000,
        actionSuggestions: [
            'Check that Pro Tools is running and responsive',
            'Close other applications that may be using Pro Tools',
            'Try connecting again in a few seconds',
            'Restart Pro Tools if it appears frozen'
        ],
        recoveryStrategy: 'timeout_retry',
        category: 'connection'
    },
    
    [PTSL_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING]: {
        title: 'Pro Tools Not Running',
        message: 'Pro Tools application is not running',
        userMessage: 'Pro Tools is not currently running. Please start Pro Tools before using NoteMarker.',
        severity: 'error',
        retryable: true,
        autoRetry: false,
        maxRetries: 1,
        retryDelay: 3000,
        actionSuggestions: [
            'Start Pro Tools application',
            'Wait for Pro Tools to fully load',
            'Try connecting again after Pro Tools starts',
            'Check if Pro Tools is installed correctly'
        ],
        recoveryStrategy: 'ptsl_enable',
        category: 'system'
    },
    
    [PTSL_ERROR_TYPES.REGISTRATION_FAILED]: {
        title: 'Registration Failed',
        message: 'Failed to register with Pro Tools PTSL service',
        userMessage: 'NoteMarker could not register with Pro Tools. This may indicate a compatibility issue or Pro Tools configuration problem.',
        severity: 'error',
        retryable: true,
        autoRetry: true,
        maxRetries: 2,
        retryDelay: 2000,
        actionSuggestions: [
            'Restart Pro Tools and try again',
            'Check PTSL is enabled in Pro Tools preferences',
            'Verify Pro Tools version compatibility',
            'Contact support if problem persists'
        ],
        recoveryStrategy: 'connection_retry',
        category: 'authentication'
    }
};

/**
 * PTSL Error Handler Class
 */
class PTSLErrorHandler {
    constructor() {
        this.errorHistory = [];
        this.retryAttempts = new Map();
        this.suppressedErrors = new Set();
        
        // Error pattern recognition
        this.errorPatterns = this.initializeErrorPatterns();
        
        log.info('PTSLErrorHandler initialized');
    }
    
    /**
     * Initialize error pattern recognition
     */
    initializeErrorPatterns() {
        return {
            // gRPC status codes to PTSL errors
            grpcStatusMap: {
                [grpc.status.UNAVAILABLE]: PTSL_ERROR_TYPES.CONNECTION_REFUSED,
                [grpc.status.DEADLINE_EXCEEDED]: PTSL_ERROR_TYPES.OPERATION_TIMEOUT,
                [grpc.status.CANCELLED]: PTSL_ERROR_TYPES.CONNECTION_LOST,
                [grpc.status.UNAUTHENTICATED]: PTSL_ERROR_TYPES.REGISTRATION_FAILED,
                [grpc.status.PERMISSION_DENIED]: PTSL_ERROR_TYPES.INSUFFICIENT_PRIVILEGES,
                [grpc.status.UNIMPLEMENTED]: PTSL_ERROR_TYPES.UNSUPPORTED_OPERATION,
                [grpc.status.RESOURCE_EXHAUSTED]: PTSL_ERROR_TYPES.MARKER_LIMIT_EXCEEDED,
                [grpc.status.ABORTED]: PTSL_ERROR_TYPES.SESSION_BUSY
            },
            
            // PTSL response error messages to error types
            ptslErrorMap: {
                'version': PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH,
                'incompatible': PTSL_ERROR_TYPES.PTSL_VERSION_INCOMPATIBLE,
                'session not found': PTSL_ERROR_TYPES.SESSION_NOT_OPEN,
                'session locked': PTSL_ERROR_TYPES.SESSION_LOCKED,
                'read only': PTSL_ERROR_TYPES.SESSION_READ_ONLY,
                'invalid timecode': PTSL_ERROR_TYPES.INVALID_TIMECODE,
                'memory location limit': PTSL_ERROR_TYPES.MARKER_LIMIT_EXCEEDED,
                'connection refused': PTSL_ERROR_TYPES.CONNECTION_REFUSED,
                'ptsl not enabled': PTSL_ERROR_TYPES.PTSL_NOT_ENABLED,
                'registration failed': PTSL_ERROR_TYPES.REGISTRATION_FAILED
            },
            
            // System error patterns
            systemErrorMap: {
                'ECONNREFUSED': PTSL_ERROR_TYPES.CONNECTION_REFUSED,
                'ENOTFOUND': PTSL_ERROR_TYPES.PRO_TOOLS_NOT_RUNNING,
                'ETIMEDOUT': PTSL_ERROR_TYPES.CONNECTION_TIMEOUT,
                'ECONNRESET': PTSL_ERROR_TYPES.CONNECTION_LOST
            }
        };
    }
    
    /**
     * Handle and classify error with context
     */
    async handleError(error, context = {}) {
        const classifiedError = this.classifyError(error, context);
        
        // Add to error history
        this.addToErrorHistory(classifiedError);
        
        // Check if error should be retried
        if (classifiedError.shouldRetry) {
            const retryResult = await this.attemptRetry(classifiedError, context);
            if (retryResult.success) {
                return retryResult;
            }
        }
        
        // Apply recovery strategy
        const recoveryAction = this.getRecoveryAction(classifiedError);
        
        // Create comprehensive error response
        const errorResponse = {
            ...classifiedError,
            recoveryAction,
            timestamp: new Date().toISOString(),
            context: context
        };
        
        log.error('PTSL Error handled:', errorResponse);
        
        return errorResponse;
    }
    
    /**
     * Classify error into standardized format
     */
    classifyError(error, context = {}) {
        let errorType = PTSL_ERROR_TYPES.SYSTEM_ERROR;
        let specificMessage = error.message || 'Unknown error';
        
        // Debug log the raw error for classification
        log.debug('Error classification input:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            syscall: error.syscall,
            name: error.name,
            type: typeof error.code
        });
        
        // Classify based on gRPC status
        if (error.code !== undefined) {
            const mappedType = this.errorPatterns.grpcStatusMap[error.code];
            log.debug('gRPC status classification:', { 
                code: error.code, 
                mappedType,
                available: Object.keys(this.errorPatterns.grpcStatusMap)
            });
            errorType = mappedType || errorType;
        }
        
        // Classify based on error message content
        const errorMessage = (error.message || '').toLowerCase();
        for (const [pattern, type] of Object.entries(this.errorPatterns.ptslErrorMap)) {
            if (errorMessage.includes(pattern)) {
                errorType = type;
                break;
            }
        }
        
        // Classify system errors
        if (error.errno || error.syscall || error.code) {
            const systemError = error.code || error.errno;
            const mappedSystemType = this.errorPatterns.systemErrorMap[systemError];
            log.debug('System error classification:', { 
                systemError, 
                mappedSystemType,
                available: Object.keys(this.errorPatterns.systemErrorMap),
                hasErrno: !!error.errno,
                hasSyscall: !!error.syscall,
                hasCode: !!error.code
            });
            errorType = mappedSystemType || errorType;
        }
        
        // Handle PTSL response errors
        if (error.responseError) {
            errorType = this.classifyPTSLResponseError(error.responseError);
            specificMessage = error.responseError.errorMessage || specificMessage;
        }
        
        // Add specific context for timecode errors
        if (errorType === PTSL_ERROR_TYPES.INVALID_TIMECODE && context.markerIndex !== undefined) {
            specificMessage = `Timecode format error at marker ${context.markerIndex + 1}: ${context.markerName || 'Unknown'}`;
        }
        
        // Get error definition
        const definition = ERROR_DEFINITIONS[errorType] || this.getDefaultErrorDefinition();
        
        // Log final classification result
        log.debug('Final error classification:', {
            finalErrorType: errorType,
            hasDefinition: !!ERROR_DEFINITIONS[errorType],
            definitionTitle: definition.title,
            definitionMessage: definition.message
        });
        
        // Determine retry logic
        const retryKey = `${errorType}_${context.operation || 'unknown'}`;
        const currentAttempts = this.retryAttempts.get(retryKey) || 0;
        const shouldRetry = definition.retryable && 
                           definition.autoRetry && 
                           currentAttempts < definition.maxRetries;
        
        return {
            type: errorType,
            title: definition.title,
            message: definition.message,
            userMessage: definition.userMessage.replace('{specificMessage}', specificMessage),
            severity: definition.severity,
            retryable: definition.retryable,
            shouldRetry: shouldRetry,
            maxRetries: definition.maxRetries,
            currentAttempts: currentAttempts,
            retryDelay: definition.retryDelay,
            actionSuggestions: definition.actionSuggestions,
            recoveryStrategy: definition.recoveryStrategy,
            category: definition.category,
            originalError: error,
            specificMessage: specificMessage
        };
    }
    
    /**
     * Classify PTSL response errors
     */
    classifyPTSLResponseError(responseError) {
        const errorType = responseError.errorType;
        const errorMessage = (responseError.errorMessage || '').toLowerCase();
        
        // Map specific PTSL error types
        switch (errorType) {
            case 'SDK_VersionMismatch':
                return PTSL_ERROR_TYPES.SDK_VERSION_MISMATCH;
            case 'SessionNotFound':
                return PTSL_ERROR_TYPES.SESSION_NOT_OPEN;
            case 'SessionLocked':
                return PTSL_ERROR_TYPES.SESSION_LOCKED;
            case 'InvalidTimecode':
                return PTSL_ERROR_TYPES.INVALID_TIMECODE;
            case 'MemoryLocationLimitExceeded':
                return PTSL_ERROR_TYPES.MARKER_LIMIT_EXCEEDED;
            case 'InsufficientPrivileges':
                return PTSL_ERROR_TYPES.INSUFFICIENT_PRIVILEGES;
            default:
                // Fallback to message-based classification
                for (const [pattern, type] of Object.entries(this.errorPatterns.ptslErrorMap)) {
                    if (errorMessage.includes(pattern)) {
                        return type;
                    }
                }
                return PTSL_ERROR_TYPES.SYSTEM_ERROR;
        }
    }
    
    /**
     * Attempt automatic retry for retryable errors
     */
    async attemptRetry(classifiedError, context) {
        const retryKey = `${classifiedError.type}_${context.operation || 'unknown'}`;
        const currentAttempts = this.retryAttempts.get(retryKey) || 0;
        
        if (currentAttempts >= classifiedError.maxRetries) {
            log.warn('Max retry attempts reached for error:', classifiedError.type);
            return { success: false, reason: 'max_retries_exceeded' };
        }
        
        // Increment retry counter
        this.retryAttempts.set(retryKey, currentAttempts + 1);
        
        // Wait for retry delay
        await this.delay(classifiedError.retryDelay);
        
        log.info(`Retrying operation (attempt ${currentAttempts + 1}/${classifiedError.maxRetries})`, {
            errorType: classifiedError.type,
            operation: context.operation
        });
        
        try {
            // Attempt to retry the original operation if retry function provided
            if (context.retryFunction && typeof context.retryFunction === 'function') {
                const result = await context.retryFunction();
                
                // Success - reset retry counter
                this.retryAttempts.delete(retryKey);
                
                log.info('Retry successful:', {
                    errorType: classifiedError.type,
                    attempt: currentAttempts + 1
                });
                
                return { success: true, result };
            }
            
            return { success: false, reason: 'no_retry_function' };
            
        } catch (retryError) {
            log.warn('Retry failed:', {
                errorType: classifiedError.type,
                attempt: currentAttempts + 1,
                error: retryError.message
            });
            
            return { success: false, error: retryError };
        }
    }
    
    /**
     * Get recovery action for error type
     */
    getRecoveryAction(classifiedError) {
        const recoveryActions = {
            'version_check': {
                type: 'version_check',
                message: 'Check version compatibility',
                automatic: false
            },
            'connection_retry': {
                type: 'connection_retry',
                message: 'Retry connection',
                automatic: true
            },
            'ptsl_enable': {
                type: 'user_action',
                message: 'Enable PTSL in Pro Tools preferences',
                automatic: false
            },
            'session_unlock': {
                type: 'user_action',
                message: 'Unlock Pro Tools session',
                automatic: false
            },
            'session_open': {
                type: 'user_action',
                message: 'Open Pro Tools session',
                automatic: false
            },
            'timecode_validation': {
                type: 'validation',
                message: 'Validate and fix timecode formats',
                automatic: false
            },
            'marker_limit': {
                type: 'user_action',
                message: 'Reduce number of markers',
                automatic: false
            },
            'wait_retry': {
                type: 'wait_retry',
                message: 'Wait and retry',
                automatic: true
            },
            'timeout_retry': {
                type: 'timeout_retry',
                message: 'Retry with smaller batches',
                automatic: false
            },
            'privilege_check': {
                type: 'user_action',
                message: 'Check permissions and privileges',
                automatic: false
            }
        };
        
        return recoveryActions[classifiedError.recoveryStrategy] || {
            type: 'manual',
            message: 'Manual intervention required',
            automatic: false
        };
    }
    
    /**
     * Get default error definition for unknown errors
     */
    getDefaultErrorDefinition() {
        return {
            title: 'Unknown Error',
            message: 'An unexpected error occurred',
            userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
            severity: 'error',
            retryable: false,
            autoRetry: false,
            maxRetries: 0,
            retryDelay: 0,
            actionSuggestions: [
                'Try the operation again',
                'Restart NoteMarker',
                'Restart Pro Tools',
                'Contact support with error details'
            ],
            recoveryStrategy: 'manual',
            category: 'unknown'
        };
    }
    
    /**
     * Add error to history for pattern analysis
     */
    addToErrorHistory(classifiedError) {
        this.errorHistory.push({
            ...classifiedError,
            timestamp: Date.now()
        });
        
        // Keep only last 100 errors
        if (this.errorHistory.length > 100) {
            this.errorHistory = this.errorHistory.slice(-100);
        }
    }
    
    /**
     * Get error statistics and patterns
     */
    getErrorStatistics() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const recentErrors = this.errorHistory.filter(e => now - e.timestamp < oneHour);
        
        const errorCounts = {};
        const categoryCounts = {};
        
        recentErrors.forEach(error => {
            errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
            categoryCounts[error.category] = (categoryCounts[error.category] || 0) + 1;
        });
        
        return {
            totalErrors: this.errorHistory.length,
            recentErrors: recentErrors.length,
            errorCounts,
            categoryCounts,
            retryAttempts: Object.fromEntries(this.retryAttempts)
        };
    }
    
    /**
     * Reset retry counters for fresh start
     */
    resetRetryCounters() {
        this.retryAttempts.clear();
        log.info('PTSL error retry counters reset');
    }
    
    /**
     * Utility: Add delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Create user-friendly error message for UI display
     */
    createUserErrorMessage(classifiedError) {
        const actions = classifiedError.actionSuggestions || [];
        const actionList = actions
            .map((action, index) => `${index + 1}. ${action}`)
            .join('\n');
        
        return {
            title: classifiedError.title || 'Error',
            message: classifiedError.userMessage || classifiedError.message || 'An error occurred',
            severity: classifiedError.severity || 'error',
            actions: actions,
            actionText: actionList,
            retryable: classifiedError.retryable || false,
            category: classifiedError.category || 'unknown'
        };
    }
}

module.exports = {
    PTSLErrorHandler,
    PTSL_ERROR_TYPES,
    ERROR_DEFINITIONS
};