/**
 * Error Service
 * Centralized error handling with consistent error objects
 */

class ErrorService {
    constructor(loggerService) {
        this.logger = loggerService;

        // Error types
        this.ERROR_TYPES = {
            // Data errors
            NOT_FOUND: 'NOT_FOUND',
            ALREADY_EXISTS: 'ALREADY_EXISTS',
            INVALID_DATA: 'INVALID_DATA',
            VALIDATION_ERROR: 'VALIDATION_ERROR',

            // Storage errors
            STORAGE_ERROR: 'STORAGE_ERROR',
            STORAGE_FULL: 'STORAGE_FULL',

            // Calculation errors
            CALCULATION_ERROR: 'CALCULATION_ERROR',
            INVALID_INPUT: 'INVALID_INPUT',

            // PTSL errors
            PTSL_NOT_INITIALIZED: 'PTSL_NOT_INITIALIZED',
            PTSL_CONNECTION_FAILED: 'PTSL_CONNECTION_FAILED',
            PTSL_OPERATION_FAILED: 'PTSL_OPERATION_FAILED',

            // System errors
            INTERNAL_ERROR: 'INTERNAL_ERROR',
            NETWORK_ERROR: 'NETWORK_ERROR',
            PERMISSION_DENIED: 'PERMISSION_DENIED',

            // User errors
            USER_CANCELLED: 'USER_CANCELLED',
            INVALID_OPERATION: 'INVALID_OPERATION'
        };

        // User-friendly error messages
        this.ERROR_MESSAGES = {
            NOT_FOUND: 'The requested item could not be found',
            ALREADY_EXISTS: 'An item with this identifier already exists',
            INVALID_DATA: 'The provided data is invalid',
            VALIDATION_ERROR: 'Data validation failed',
            STORAGE_ERROR: 'Failed to access storage',
            STORAGE_FULL: 'Storage is full. Please free up space',
            CALCULATION_ERROR: 'Failed to perform calculation',
            INVALID_INPUT: 'Invalid input provided',
            PTSL_NOT_INITIALIZED: 'Pro Tools connection not initialized',
            PTSL_CONNECTION_FAILED: 'Failed to connect to Pro Tools',
            PTSL_OPERATION_FAILED: 'Pro Tools operation failed',
            INTERNAL_ERROR: 'An internal error occurred',
            NETWORK_ERROR: 'Network error occurred',
            PERMISSION_DENIED: 'Permission denied',
            USER_CANCELLED: 'Operation cancelled by user',
            INVALID_OPERATION: 'Invalid operation'
        };
    }

    /**
     * Create a standardized error object
     * @param {string} type - Error type from ERROR_TYPES
     * @param {string} message - Detailed error message
     * @param {*} details - Additional error details
     * @returns {Error} Error object with standard properties
     */
    createError(type, message, details = null) {
        const error = new Error(message);
        error.type = type;
        error.details = details;
        error.timestamp = new Date().toISOString();
        error.userMessage = this.ERROR_MESSAGES[type] || this.ERROR_MESSAGES.INTERNAL_ERROR;

        return error;
    }

    /**
     * Handle an error (log and optionally rethrow)
     * @param {Error} error - Error to handle
     * @param {boolean} rethrow - Whether to rethrow error
     * @returns {Object} Standardized error response
     */
    handleError(error, rethrow = false) {
        // Log the error
        this.logger.error('Error occurred', {
            type: error.type || 'UNKNOWN',
            message: error.message,
            stack: error.stack,
            details: error.details
        });

        const response = {
            success: false,
            error: {
                type: error.type || this.ERROR_TYPES.INTERNAL_ERROR,
                message: error.userMessage || error.message,
                details: error.details
            }
        };

        if (rethrow) {
            throw error;
        }

        return response;
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     */
    isRetryable(error) {
        const retryableTypes = [
            this.ERROR_TYPES.NETWORK_ERROR,
            this.ERROR_TYPES.PTSL_CONNECTION_FAILED,
            this.ERROR_TYPES.STORAGE_ERROR
        ];

        return retryableTypes.includes(error.type);
    }

    /**
     * Get user-friendly error message
     * @param {Error} error - Error object
     * @returns {string} User-friendly message
     */
    getErrorMessage(error) {
        if (error.userMessage) {
            return error.userMessage;
        }

        if (error.type && this.ERROR_MESSAGES[error.type]) {
            return this.ERROR_MESSAGES[error.type];
        }

        return error.message || this.ERROR_MESSAGES.INTERNAL_ERROR;
    }

    /**
     * Wrap a function with error handling
     * @param {Function} fn - Function to wrap
     * @param {string} context - Error context
     * @returns {Function} Wrapped function
     */
    wrap(fn, context = 'operation') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.logger.error(`Error in ${context}`, {
                    error: error.message,
                    stack: error.stack
                });

                // Re-throw with context if not already a standard error
                if (!error.type) {
                    throw this.createError(
                        this.ERROR_TYPES.INTERNAL_ERROR,
                        `${context} failed: ${error.message}`,
                        { originalError: error.message }
                    );
                }

                throw error;
            }
        };
    }

    /**
     * Create success response
     * @param {*} data - Response data
     * @param {*} meta - Optional metadata
     * @returns {Object} Success response
     */
    success(data, meta = null) {
        const response = {
            success: true,
            data
        };

        if (meta) {
            response.meta = meta;
        }

        return response;
    }

    /**
     * Create error response
     * @param {Error|string} error - Error or error message
     * @param {string} type - Error type
     * @returns {Object} Error response
     */
    failure(error, type = null) {
        if (typeof error === 'string') {
            error = this.createError(type || this.ERROR_TYPES.INTERNAL_ERROR, error);
        }

        return {
            success: false,
            error: {
                type: error.type || type || this.ERROR_TYPES.INTERNAL_ERROR,
                message: this.getErrorMessage(error)
            }
        };
    }
}

module.exports = ErrorService;
