/**
 * Comprehensive Error Handler for Marker Creation
 * 
 * Provides robust error handling for all marker creation scenarios:
 * - Network errors with exponential backoff
 * - Session locked detection and user prompts
 * - Invalid timecode handling
 * - Pro Tools crash detection and auto-reconnect
 * - Partial batch failure recovery
 * - Circuit breaker pattern for stability
 */

const log = require('electron-log');
const EventEmitter = require('events');
const { PTSLErrorHandler, PTSL_ERROR_TYPES } = require('./ptsl-error-handler');

/**
 * Error Categories for different handling strategies
 */
const ERROR_CATEGORIES = {
    NETWORK: 'network',
    SESSION: 'session',
    VALIDATION: 'validation',
    SYSTEM: 'system',
    USER: 'user',
    BATCH: 'batch'
};

/**
 * Recovery Strategies
 */
const RECOVERY_STRATEGIES = {
    RETRY_WITH_BACKOFF: 'retry_with_backoff',
    RECONNECT: 'reconnect',
    SKIP_AND_CONTINUE: 'skip_and_continue',
    PROMPT_USER: 'prompt_user',
    ABORT_OPERATION: 'abort_operation',
    PARTIAL_RETRY: 'partial_retry',
    CIRCUIT_BREAK: 'circuit_break'
};

/**
 * Circuit Breaker States
 */
const CIRCUIT_STATES = {
    CLOSED: 'closed',     // Normal operation
    OPEN: 'open',         // Failing fast
    HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Comprehensive Error Handler with multiple recovery strategies
 */
class ComprehensiveErrorHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxRetries: options.maxRetries || 3,
            baseDelay: options.baseDelay || 1000,
            maxDelay: options.maxDelay || 30000,
            backoffMultiplier: options.backoffMultiplier || 2,
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
            batchRetryLimit: options.batchRetryLimit || 2,
            ...options
        };
        
        // Error tracking
        this.errorHistory = [];
        this.consecutiveErrors = 0;
        this.lastErrorTime = null;
        
        // Circuit breaker state
        this.circuitState = CIRCUIT_STATES.CLOSED;
        this.circuitFailureCount = 0;
        this.circuitNextAttemptTime = 0;
        
        // Batch operation tracking
        this.batchOperations = new Map();
        this.failedMarkers = new Map();
        
        // User interaction callbacks
        this.userInteractionCallback = null;
        this.progressCallback = null;
        
        // Base error handler
        this.ptslErrorHandler = new PTSLErrorHandler();
        
        log.info('ComprehensiveErrorHandler initialized', this.options);
    }
    
    /**
     * Set user interaction callback for prompts
     * @param {Function} callback - Function to handle user prompts
     */
    setUserInteractionCallback(callback) {
        this.userInteractionCallback = callback;
    }
    
    /**
     * Set progress callback for status updates
     * @param {Function} callback - Function to handle progress updates
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
    
    /**
     * Main error handling entry point
     * @param {Error} error - The error to handle
     * @param {Object} context - Context about the operation that failed
     * @returns {Object} Recovery action and strategy
     */
    async handleError(error, context = {}) {
        try {
            // Record error for tracking
            this.recordError(error, context);
            
            // Check circuit breaker state
            if (this.circuitState === CIRCUIT_STATES.OPEN) {
                return this.handleCircuitOpen(error, context);
            }
            
            // Categorize error
            const errorCategory = this.categorizeError(error, context);
            const errorDefinition = await this.ptslErrorHandler.handleError(error, context);
            
            // Determine recovery strategy
            const recoveryStrategy = this.determineRecoveryStrategy(error, errorCategory, context);
            
            log.info('Error analysis completed', {
                category: errorCategory,
                strategy: recoveryStrategy,
                errorType: errorDefinition.errorType,
                retryable: errorDefinition.retryable
            });
            
            // Execute recovery strategy
            const recoveryResult = await this.executeRecoveryStrategy(
                recoveryStrategy, 
                error, 
                errorDefinition, 
                context
            );
            
            // Update circuit breaker
            this.updateCircuitBreaker(recoveryResult.success);
            
            return recoveryResult;
            
        } catch (handlingError) {
            log.error('Error in error handling:', handlingError);
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.ABORT_OPERATION,
                action: 'abort',
                reason: 'Error handler failure',
                error: handlingError
            };
        }
    }
    
    /**
     * Record error for tracking and analysis
     * @param {Error} error - The error that occurred
     * @param {Object} context - Error context
     */
    recordError(error, context) {
        const errorRecord = {
            timestamp: Date.now(),
            error: {
                message: error.message,
                name: error.name,
                code: error.code,
                stack: error.stack
            },
            context,
            consecutiveCount: this.consecutiveErrors + 1
        };
        
        this.errorHistory.push(errorRecord);
        this.consecutiveErrors++;
        this.lastErrorTime = Date.now();
        
        // Keep only recent errors (last 100)
        if (this.errorHistory.length > 100) {
            this.errorHistory = this.errorHistory.slice(-100);
        }
        
        // Emit error event for monitoring
        this.emit('error-recorded', errorRecord);
    }
    
    /**
     * Categorize error for appropriate handling
     * @param {Error} error - The error to categorize
     * @param {Object} context - Error context
     * @returns {string} Error category
     */
    categorizeError(error, context) {
        // Network-related errors
        if (error.code === 'ECONNREFUSED' || 
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT' ||
            error.message.includes('UNAVAILABLE') ||
            error.message.includes('connection')) {
            return ERROR_CATEGORIES.NETWORK;
        }
        
        // Session-related errors
        if (error.message.includes('session locked') ||
            error.message.includes('SESSION_LOCKED') ||
            error.message.includes('session not open') ||
            error.message.includes('session busy')) {
            return ERROR_CATEGORIES.SESSION;
        }
        
        // Validation errors
        if (error.message.includes('invalid timecode') ||
            error.message.includes('INVALID_TIMECODE') ||
            error.message.includes('marker name') ||
            context.operation === 'validate_timecode') {
            return ERROR_CATEGORIES.VALIDATION;
        }
        
        // System errors
        if (error.message.includes('Pro Tools') ||
            error.message.includes('PTSL') ||
            error.message.includes('system error')) {
            return ERROR_CATEGORIES.SYSTEM;
        }
        
        // Batch operation errors
        if (context.isBatchOperation || context.markerIndex !== undefined) {
            return ERROR_CATEGORIES.BATCH;
        }
        
        return ERROR_CATEGORIES.USER;
    }
    
    /**
     * Determine the best recovery strategy for the error
     * @param {Error} error - The error
     * @param {string} category - Error category
     * @param {Object} context - Error context
     * @returns {string} Recovery strategy
     */
    determineRecoveryStrategy(error, category, context) {
        switch (category) {
            case ERROR_CATEGORIES.NETWORK:
                return this.consecutiveErrors >= this.options.circuitBreakerThreshold ? 
                    RECOVERY_STRATEGIES.CIRCUIT_BREAK : 
                    RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF;
                    
            case ERROR_CATEGORIES.SESSION:
                if (error.message.includes('locked')) {
                    return RECOVERY_STRATEGIES.PROMPT_USER;
                }
                return RECOVERY_STRATEGIES.RECONNECT;
                
            case ERROR_CATEGORIES.VALIDATION:
                return RECOVERY_STRATEGIES.SKIP_AND_CONTINUE;
                
            case ERROR_CATEGORIES.SYSTEM:
                if (error.message.includes('Pro Tools') && error.message.includes('not running')) {
                    return RECOVERY_STRATEGIES.PROMPT_USER;
                }
                return RECOVERY_STRATEGIES.RECONNECT;
                
            case ERROR_CATEGORIES.BATCH:
                return RECOVERY_STRATEGIES.PARTIAL_RETRY;
                
            default:
                return RECOVERY_STRATEGIES.PROMPT_USER;
        }
    }
    
    /**
     * Execute the determined recovery strategy
     * @param {string} strategy - Recovery strategy to execute
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition from PTSL handler
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    async executeRecoveryStrategy(strategy, error, errorDefinition, context) {
        log.info('Executing recovery strategy', { strategy, errorType: errorDefinition.errorType });
        
        switch (strategy) {
            case RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF:
                return await this.retryWithExponentialBackoff(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.RECONNECT:
                return await this.handleReconnection(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.SKIP_AND_CONTINUE:
                return this.skipAndContinue(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.PROMPT_USER:
                return await this.promptUserForAction(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.PARTIAL_RETRY:
                return await this.handlePartialRetry(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.CIRCUIT_BREAK:
                return this.activateCircuitBreaker(error, errorDefinition, context);
                
            case RECOVERY_STRATEGIES.ABORT_OPERATION:
            default:
                return this.abortOperation(error, errorDefinition, context);
        }
    }
    
    /**
     * Retry operation with exponential backoff
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    async retryWithExponentialBackoff(error, errorDefinition, context) {
        const retryCount = context.retryCount || 0;
        
        if (retryCount >= this.options.maxRetries) {
            log.warn('Max retries exceeded', { retryCount, maxRetries: this.options.maxRetries });
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF,
                action: 'abort',
                reason: 'Maximum retry attempts exceeded',
                retryCount
            };
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.options.baseDelay * Math.pow(this.options.backoffMultiplier, retryCount),
            this.options.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * delay;
        const actualDelay = delay + jitter;
        
        log.info('Retrying with exponential backoff', {
            retryCount: retryCount + 1,
            delay: Math.round(actualDelay),
            nextAttemptIn: `${Math.round(actualDelay / 1000)}s`
        });
        
        // Update progress
        if (this.progressCallback) {
            this.progressCallback({
                type: 'retry',
                retryCount: retryCount + 1,
                maxRetries: this.options.maxRetries,
                delay: actualDelay,
                reason: errorDefinition.userMessage
            });
        }
        
        // Wait before retry
        await this.delay(actualDelay);
        
        return {
            success: true,
            strategy: RECOVERY_STRATEGIES.RETRY_WITH_BACKOFF,
            action: 'retry',
            delay: actualDelay,
            retryCount: retryCount + 1,
            context: {
                ...context,
                retryCount: retryCount + 1
            }
        };
    }
    
    /**
     * Handle Pro Tools reconnection
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    async handleReconnection(error, errorDefinition, context) {
        log.info('Attempting Pro Tools reconnection');
        
        if (this.progressCallback) {
            this.progressCallback({
                type: 'reconnecting',
                reason: 'Pro Tools connection lost, attempting to reconnect...'
            });
        }
        
        try {
            // Get connection manager from context
            const connectionManager = context.connectionManager;
            
            if (!connectionManager) {
                throw new Error('No connection manager available for reconnection');
            }
            
            // Disconnect and reconnect
            await connectionManager.disconnect();
            await this.delay(2000); // Brief pause
            await connectionManager.connect();
            
            // Reset error counters on successful reconnection
            this.consecutiveErrors = 0;
            
            log.info('Reconnection successful');
            
            if (this.progressCallback) {
                this.progressCallback({
                    type: 'reconnected',
                    reason: 'Successfully reconnected to Pro Tools'
                });
            }
            
            return {
                success: true,
                strategy: RECOVERY_STRATEGIES.RECONNECT,
                action: 'retry',
                reason: 'Reconnection successful'
            };
            
        } catch (reconnectError) {
            log.error('Reconnection failed:', reconnectError);
            
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.RECONNECT,
                action: 'prompt_user',
                reason: 'Reconnection failed',
                error: reconnectError,
                suggestions: [
                    'Check Pro Tools is running',
                    'Verify PTSL is enabled',
                    'Restart Pro Tools if necessary'
                ]
            };
        }
    }
    
    /**
     * Skip current marker and continue with batch
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    skipAndContinue(error, errorDefinition, context) {
        log.warn('Skipping marker due to validation error', {
            markerIndex: context.markerIndex,
            markerName: context.markerName,
            error: error.message
        });
        
        // Record failed marker for later review
        if (context.markerIndex !== undefined) {
            this.recordFailedMarker(context.markerIndex, error, context);
        }
        
        if (this.progressCallback) {
            this.progressCallback({
                type: 'marker_skipped',
                markerIndex: context.markerIndex,
                markerName: context.markerName,
                reason: errorDefinition.userMessage
            });
        }
        
        return {
            success: true,
            strategy: RECOVERY_STRATEGIES.SKIP_AND_CONTINUE,
            action: 'skip',
            reason: errorDefinition.userMessage,
            markerIndex: context.markerIndex
        };
    }
    
    /**
     * Prompt user for action
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    async promptUserForAction(error, errorDefinition, context) {
        if (!this.userInteractionCallback) {
            log.warn('No user interaction callback available, defaulting to abort');
            return this.abortOperation(error, errorDefinition, context);
        }
        
        const promptData = {
            type: 'error_recovery',
            error: {
                title: errorDefinition.title || 'Error Occurred',
                message: errorDefinition.userMessage || error.message,
                severity: errorDefinition.severity || 'error'
            },
            context,
            options: this.generateUserOptions(error, errorDefinition, context),
            suggestions: errorDefinition.actionSuggestions || []
        };
        
        try {
            log.info('Prompting user for error recovery action');
            
            const userResponse = await this.userInteractionCallback(promptData);
            
            log.info('User selected recovery action', { action: userResponse.action });
            
            return {
                success: userResponse.action !== 'abort',
                strategy: RECOVERY_STRATEGIES.PROMPT_USER,
                action: userResponse.action,
                userChoice: userResponse,
                reason: `User chose: ${userResponse.action}`
            };
            
        } catch (promptError) {
            log.error('Error prompting user:', promptError);
            return this.abortOperation(error, errorDefinition, context);
        }
    }
    
    /**
     * Handle partial batch retry
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    async handlePartialRetry(error, errorDefinition, context) {
        const batchId = context.batchId || 'default';
        const markerIndex = context.markerIndex;
        
        // Record failed marker
        if (markerIndex !== undefined) {
            this.recordFailedMarker(markerIndex, error, context);
        }
        
        // Get batch operation info
        let batchInfo = this.batchOperations.get(batchId);
        if (!batchInfo) {
            batchInfo = {
                totalMarkers: context.totalMarkers || 1,
                failedMarkers: [],
                retryCount: 0,
                startTime: Date.now()
            };
            this.batchOperations.set(batchId, batchInfo);
        }
        
        batchInfo.failedMarkers.push(markerIndex);
        
        log.info('Recorded batch failure', {
            batchId,
            markerIndex,
            totalFailed: batchInfo.failedMarkers.length,
            totalMarkers: batchInfo.totalMarkers
        });
        
        // Check if this is the last marker in batch
        const isLastMarker = context.isLastMarker || 
                           (markerIndex === batchInfo.totalMarkers - 1);
        
        if (isLastMarker && batchInfo.failedMarkers.length > 0) {
            return await this.offerBatchRetry(batchId, batchInfo);
        }
        
        // Continue with next marker
        return {
            success: true,
            strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
            action: 'continue',
            reason: 'Recorded failure, continuing with batch',
            failedCount: batchInfo.failedMarkers.length
        };
    }
    
    /**
     * Offer to retry failed markers in batch
     * @param {string} batchId - Batch identifier
     * @param {Object} batchInfo - Batch information
     * @returns {Object} Recovery result
     */
    async offerBatchRetry(batchId, batchInfo) {
        if (batchInfo.retryCount >= this.options.batchRetryLimit) {
            log.warn('Batch retry limit exceeded', {
                batchId,
                retryCount: batchInfo.retryCount,
                failedMarkers: batchInfo.failedMarkers.length
            });
            
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
                action: 'report_failures',
                reason: 'Batch retry limit exceeded',
                failedMarkers: batchInfo.failedMarkers,
                batchInfo
            };
        }
        
        if (!this.userInteractionCallback) {
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
                action: 'report_failures',
                reason: 'No user interaction available',
                failedMarkers: batchInfo.failedMarkers
            };
        }
        
        const promptData = {
            type: 'batch_retry',
            failedCount: batchInfo.failedMarkers.length,
            totalCount: batchInfo.totalMarkers,
            retryCount: batchInfo.retryCount,
            maxRetries: this.options.batchRetryLimit,
            failedMarkers: batchInfo.failedMarkers.map(index => ({
                index,
                ...this.failedMarkers.get(index)
            })),
            options: [
                { action: 'retry_failed', label: 'Retry Failed Markers' },
                { action: 'skip_failed', label: 'Skip Failed Markers' },
                { action: 'abort', label: 'Cancel Operation' }
            ]
        };
        
        try {
            const userResponse = await this.userInteractionCallback(promptData);
            
            if (userResponse.action === 'retry_failed') {
                batchInfo.retryCount++;
                
                return {
                    success: true,
                    strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
                    action: 'retry_failed',
                    reason: 'User chose to retry failed markers',
                    failedMarkers: batchInfo.failedMarkers,
                    retryCount: batchInfo.retryCount
                };
            }
            
            return {
                success: userResponse.action !== 'abort',
                strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
                action: userResponse.action,
                reason: `User chose: ${userResponse.action}`,
                failedMarkers: batchInfo.failedMarkers
            };
            
        } catch (error) {
            log.error('Error prompting for batch retry:', error);
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.PARTIAL_RETRY,
                action: 'report_failures',
                reason: 'Error prompting user',
                failedMarkers: batchInfo.failedMarkers
            };
        }
    }
    
    /**
     * Activate circuit breaker
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    activateCircuitBreaker(error, errorDefinition, context) {
        this.circuitState = CIRCUIT_STATES.OPEN;
        this.circuitNextAttemptTime = Date.now() + this.options.circuitBreakerTimeout;
        
        log.warn('Circuit breaker activated', {
            failureCount: this.circuitFailureCount,
            nextAttemptIn: Math.round(this.options.circuitBreakerTimeout / 1000) + 's'
        });
        
        if (this.progressCallback) {
            this.progressCallback({
                type: 'circuit_breaker_open',
                reason: 'Too many consecutive failures, pausing operations',
                nextAttemptTime: this.circuitNextAttemptTime
            });
        }
        
        return {
            success: false,
            strategy: RECOVERY_STRATEGIES.CIRCUIT_BREAK,
            action: 'circuit_open',
            reason: 'Circuit breaker activated due to consecutive failures',
            nextAttemptTime: this.circuitNextAttemptTime
        };
    }
    
    /**
     * Handle circuit breaker in open state
     * @param {Error} error - Original error
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    handleCircuitOpen(error, context) {
        const now = Date.now();
        
        if (now < this.circuitNextAttemptTime) {
            const waitTime = this.circuitNextAttemptTime - now;
            
            return {
                success: false,
                strategy: RECOVERY_STRATEGIES.CIRCUIT_BREAK,
                action: 'circuit_open',
                reason: 'Circuit breaker is open, operation not attempted',
                waitTime
            };
        }
        
        // Transition to half-open for testing
        this.circuitState = CIRCUIT_STATES.HALF_OPEN;
        log.info('Circuit breaker transitioning to half-open state');
        
        return {
            success: true,
            strategy: RECOVERY_STRATEGIES.CIRCUIT_BREAK,
            action: 'circuit_half_open',
            reason: 'Circuit breaker testing service recovery'
        };
    }
    
    /**
     * Abort operation
     * @param {Error} error - Original error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Object} Recovery result
     */
    abortOperation(error, errorDefinition, context) {
        log.error('Aborting operation due to unrecoverable error', {
            error: error.message,
            context
        });
        
        return {
            success: false,
            strategy: RECOVERY_STRATEGIES.ABORT_OPERATION,
            action: 'abort',
            reason: errorDefinition.userMessage || 'Unrecoverable error occurred',
            error: {
                message: error.message,
                type: errorDefinition.errorType
            }
        };
    }
    
    /**
     * Update circuit breaker state based on operation result
     * @param {boolean} success - Whether the operation succeeded
     */
    updateCircuitBreaker(success) {
        if (success) {
            this.consecutiveErrors = 0;
            this.circuitFailureCount = 0;
            
            if (this.circuitState === CIRCUIT_STATES.HALF_OPEN) {
                this.circuitState = CIRCUIT_STATES.CLOSED;
                log.info('Circuit breaker closed - service recovered');
            }
        } else {
            this.circuitFailureCount++;
            
            if (this.circuitState === CIRCUIT_STATES.HALF_OPEN) {
                this.circuitState = CIRCUIT_STATES.OPEN;
                this.circuitNextAttemptTime = Date.now() + this.options.circuitBreakerTimeout;
                log.warn('Circuit breaker reopened - service still failing');
            }
        }
    }
    
    /**
     * Record failed marker for later analysis
     * @param {number} markerIndex - Index of failed marker
     * @param {Error} error - Error that occurred
     * @param {Object} context - Error context
     */
    recordFailedMarker(markerIndex, error, context) {
        this.failedMarkers.set(markerIndex, {
            error: {
                message: error.message,
                name: error.name,
                code: error.code
            },
            context,
            timestamp: Date.now(),
            attempts: (this.failedMarkers.get(markerIndex)?.attempts || 0) + 1
        });
    }
    
    /**
     * Generate user options based on error type
     * @param {Error} error - The error
     * @param {Object} errorDefinition - Error definition
     * @param {Object} context - Error context
     * @returns {Array} User options
     */
    generateUserOptions(error, errorDefinition, context) {
        const options = [];
        
        if (errorDefinition.retryable) {
            options.push({
                action: 'retry',
                label: 'Retry',
                description: 'Try the operation again'
            });
        }
        
        if (context.markerIndex !== undefined) {
            options.push({
                action: 'skip',
                label: 'Skip This Marker',
                description: 'Skip this marker and continue with others'
            });
        }
        
        if (error.message.includes('session locked') || error.message.includes('Pro Tools')) {
            options.push({
                action: 'wait',
                label: 'Wait and Retry',
                description: 'Wait for the issue to be resolved, then retry'
            });
        }
        
        options.push({
            action: 'abort',
            label: 'Cancel',
            description: 'Cancel the entire operation'
        });
        
        return options;
    }
    
    /**
     * Utility function to create a delay
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get current error statistics
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        return {
            consecutiveErrors: this.consecutiveErrors,
            totalErrors: this.errorHistory.length,
            circuitState: this.circuitState,
            circuitFailureCount: this.circuitFailureCount,
            activeFailedMarkers: this.failedMarkers.size,
            activeBatchOperations: this.batchOperations.size,
            lastErrorTime: this.lastErrorTime,
            recentErrors: this.errorHistory.slice(-10)
        };
    }
    
    /**
     * Reset error tracking (for new operations)
     */
    reset() {
        this.errorHistory = [];
        this.consecutiveErrors = 0;
        this.lastErrorTime = null;
        this.circuitState = CIRCUIT_STATES.CLOSED;
        this.circuitFailureCount = 0;
        this.batchOperations.clear();
        this.failedMarkers.clear();
        
        log.info('Comprehensive error handler reset');
    }
    
    /**
     * Get failed markers for reporting
     * @returns {Array} Failed markers with details
     */
    getFailedMarkers() {
        return Array.from(this.failedMarkers.entries()).map(([index, data]) => ({
            index,
            ...data
        }));
    }
}

module.exports = {
    ComprehensiveErrorHandler,
    ERROR_CATEGORIES,
    RECOVERY_STRATEGIES,
    CIRCUIT_STATES
};