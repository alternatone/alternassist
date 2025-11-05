/**
 * Service Container
 * Dependency injection container that wires up all services
 */

const ConfigService = require('./config.service');
const LoggerService = require('./logger.service');
const ErrorService = require('./error.service');
const FormatService = require('./format.service');
const ValidationService = require('./validation.service');
const StorageService = require('./storage.service');
const CalculationService = require('./calculation.service');
const DataService = require('./data.service');

class ServiceContainer {
    constructor() {
        this.services = {};
        this.initialized = false;
    }

    /**
     * Initialize all services with proper dependency injection
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Layer 1: No dependencies
            this.services.config = new ConfigService();
            this.services.format = new FormatService();

            // Layer 2: Depends on Layer 1
            this.services.logger = new LoggerService(this.services.config);
            this.services.validation = new ValidationService(this.services.config);
            this.services.calculation = new CalculationService(this.services.config);

            // Layer 3: Depends on Layer 2
            this.services.error = new ErrorService(this.services.logger);
            this.services.storage = new StorageService(
                this.services.logger,
                this.services.config
            );

            // Layer 4: Depends on Layer 3
            this.services.data = new DataService(
                this.services.storage,
                this.services.validation,
                this.services.config,
                this.services.logger
            );

            this.initialized = true;
            this.services.logger.info('ServiceContainer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ServiceContainer:', error);
            throw error;
        }
    }

    /**
     * Get a service by name
     * @param {string} name - Service name
     * @returns {Object} Service instance
     */
    get(name) {
        if (!this.initialized) {
            throw new Error('ServiceContainer not initialized. Call initialize() first.');
        }

        if (!this.services[name]) {
            throw new Error(`Service "${name}" not found in container`);
        }

        return this.services[name];
    }

    /**
     * Get all services
     * @returns {Object} All services
     */
    getAll() {
        if (!this.initialized) {
            throw new Error('ServiceContainer not initialized. Call initialize() first.');
        }

        return this.services;
    }

    /**
     * Check if container is initialized
     * @returns {boolean} True if initialized
     */
    isInitialized() {
        return this.initialized;
    }
}

module.exports = ServiceContainer;
