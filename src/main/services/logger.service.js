/**
 * Logger Service
 * Unified logging with electron-log
 */

const log = require('electron-log');
const path = require('path');

class LoggerService {
    constructor(configService) {
        this.config = configService;
        this.setupLogger();
    }

    /**
     * Setup logger configuration
     */
    setupLogger() {
        // Configure log format
        log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
        log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

        // Set log levels based on environment
        if (this.config.isDevelopment()) {
            log.transports.console.level = 'debug';
            log.transports.file.level = 'debug';
        } else {
            log.transports.console.level = 'info';
            log.transports.file.level = 'info';
        }

        // Log file location
        log.info('Logger initialized', {
            logPath: log.transports.file.getFile().path,
            level: log.transports.console.level
        });
    }

    /**
     * Format metadata for logging
     * @param {*} meta - Metadata to format
     * @returns {string} Formatted metadata
     */
    formatMeta(meta) {
        if (!meta) return '';
        if (typeof meta === 'string') return meta;
        try {
            return JSON.stringify(meta);
        } catch (err) {
            return String(meta);
        }
    }

    /**
     * Log error message
     * @param {string} message - Error message
     * @param {*} meta - Optional metadata
     */
    error(message, meta = null) {
        if (meta) {
            log.error(`${message} | ${this.formatMeta(meta)}`);
        } else {
            log.error(message);
        }
    }

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {*} meta - Optional metadata
     */
    warn(message, meta = null) {
        if (meta) {
            log.warn(`${message} | ${this.formatMeta(meta)}`);
        } else {
            log.warn(message);
        }
    }

    /**
     * Log info message
     * @param {string} message - Info message
     * @param {*} meta - Optional metadata
     */
    info(message, meta = null) {
        if (meta) {
            log.info(`${message} | ${this.formatMeta(meta)}`);
        } else {
            log.info(message);
        }
    }

    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {*} meta - Optional metadata
     */
    debug(message, meta = null) {
        if (meta) {
            log.debug(`${message} | ${this.formatMeta(meta)}`);
        } else {
            log.debug(message);
        }
    }

    /**
     * Measure performance of a function
     * @param {string} label - Performance label
     * @param {Function} fn - Function to measure
     * @returns {*} Function result
     */
    async performance(label, fn) {
        const start = Date.now();
        this.debug(`[Performance] ${label} - started`);

        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.debug(`[Performance] ${label} - completed in ${duration}ms`);
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.error(`[Performance] ${label} - failed after ${duration}ms`, error);
            throw error;
        }
    }

    /**
     * Log IPC communication
     * @param {string} channel - IPC channel
     * @param {string} direction - 'request' or 'response'
     * @param {*} data - IPC data
     */
    ipc(channel, direction, data = null) {
        const arrow = direction === 'request' ? '→' : '←';
        this.debug(`[IPC ${arrow}] ${channel}`, data);
    }

    /**
     * Log service lifecycle events
     * @param {string} serviceName - Service name
     * @param {string} event - Event name
     * @param {*} meta - Optional metadata
     */
    service(serviceName, event, meta = null) {
        this.info(`[Service] ${serviceName} - ${event}`, meta);
    }

    /**
     * Get log file path
     * @returns {string} Log file path
     */
    getLogPath() {
        return log.transports.file.getFile().path;
    }

    /**
     * Clear log files
     */
    clearLogs() {
        log.transports.file.getFile().clear();
        this.info('Log files cleared');
    }
}

module.exports = LoggerService;
