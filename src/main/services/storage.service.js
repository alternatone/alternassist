/**
 * Storage Service
 * Unified localStorage wrapper that eliminates duplicate JSON.parse/stringify calls
 *
 * NOTE: This service is designed to work in both main and renderer processes.
 * In the main process, it uses electron's remote localStorage access.
 * In the renderer process, it uses window.localStorage directly.
 */

class StorageService {
    constructor(loggerService, configService) {
        this.logger = loggerService;
        this.config = configService;
        this.storage = null;
        this.storageAvailable = false;

        this.initializeStorage();
    }

    /**
     * Initialize storage based on environment
     */
    initializeStorage() {
        try {
            // Check if localStorage is available
            if (typeof localStorage !== 'undefined') {
                this.storage = localStorage;
                this.storageAvailable = true;
                this.logger.info('StorageService initialized with localStorage');
            } else {
                this.logger.warn('localStorage not available, using in-memory storage');
                this.storage = new Map(); // Fallback to in-memory storage
                this.storageAvailable = false;
            }
        } catch (error) {
            this.logger.error('Failed to initialize storage', error);
            this.storage = new Map();
            this.storageAvailable = false;
        }
    }

    /**
     * Get data from storage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} Stored value or default
     */
    get(key, defaultValue = null) {
        try {
            if (this.storageAvailable) {
                const item = this.storage.getItem(key);
                if (item === null) {
                    return defaultValue;
                }
                return JSON.parse(item);
            } else {
                return this.storage.get(key) || defaultValue;
            }
        } catch (error) {
            this.logger.error(`Failed to get item from storage: ${key}`, error);
            return defaultValue;
        }
    }

    /**
     * Set data in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} Success status
     */
    set(key, value) {
        try {
            if (this.storageAvailable) {
                this.storage.setItem(key, JSON.stringify(value));
            } else {
                this.storage.set(key, value);
            }
            this.logger.debug(`Storage set: ${key}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to set item in storage: ${key}`, error);
            return false;
        }
    }

    /**
     * Remove item from storage
     * @param {string} key - Storage key
     * @returns {boolean} Success status
     */
    remove(key) {
        try {
            if (this.storageAvailable) {
                this.storage.removeItem(key);
            } else {
                this.storage.delete(key);
            }
            this.logger.debug(`Storage removed: ${key}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to remove item from storage: ${key}`, error);
            return false;
        }
    }

    /**
     * Check if key exists in storage
     * @param {string} key - Storage key
     * @returns {boolean} True if key exists
     */
    has(key) {
        try {
            if (this.storageAvailable) {
                return this.storage.getItem(key) !== null;
            } else {
                return this.storage.has(key);
            }
        } catch (error) {
            this.logger.error(`Failed to check storage key: ${key}`, error);
            return false;
        }
    }

    /**
     * Get all storage keys
     * @returns {string[]} Array of keys
     */
    keys() {
        try {
            if (this.storageAvailable) {
                return Object.keys(this.storage);
            } else {
                return Array.from(this.storage.keys());
            }
        } catch (error) {
            this.logger.error('Failed to get storage keys', error);
            return [];
        }
    }

    /**
     * Clear all storage
     * @returns {boolean} Success status
     */
    clear() {
        try {
            if (this.storageAvailable) {
                this.storage.clear();
            } else {
                this.storage.clear();
            }
            this.logger.info('Storage cleared');
            return true;
        } catch (error) {
            this.logger.error('Failed to clear storage', error);
            return false;
        }
    }

    /**
     * Export all storage data (for backup)
     * @returns {Object} All storage data
     */
    export() {
        try {
            const data = {};
            const keys = this.keys();

            keys.forEach(key => {
                data[key] = this.get(key);
            });

            this.logger.info('Storage exported', { keyCount: keys.length });
            return data;
        } catch (error) {
            this.logger.error('Failed to export storage', error);
            return {};
        }
    }

    /**
     * Import storage data (for restore)
     * @param {Object} data - Data to import
     * @param {boolean} clearExisting - Whether to clear existing data first
     * @returns {boolean} Success status
     */
    import(data, clearExisting = false) {
        try {
            if (clearExisting) {
                this.clear();
            }

            Object.entries(data).forEach(([key, value]) => {
                this.set(key, value);
            });

            this.logger.info('Storage imported', { keyCount: Object.keys(data).length });
            return true;
        } catch (error) {
            this.logger.error('Failed to import storage', error);
            return false;
        }
    }

    /**
     * Get storage size in bytes (approximate)
     * @returns {number} Size in bytes
     */
    getSize() {
        try {
            let size = 0;

            if (this.storageAvailable) {
                Object.keys(this.storage).forEach(key => {
                    const item = this.storage.getItem(key);
                    if (item) {
                        size += key.length + item.length;
                    }
                });
            } else {
                this.storage.forEach((value, key) => {
                    size += key.length + JSON.stringify(value).length;
                });
            }

            return size * 2; // 2 bytes per character in UTF-16
        } catch (error) {
            this.logger.error('Failed to calculate storage size', error);
            return 0;
        }
    }

    /**
     * Get storage keys with a specific prefix
     * @param {string} prefix - Key prefix
     * @returns {string[]} Array of matching keys
     */
    getKeysByPrefix(prefix) {
        try {
            const allKeys = this.keys();
            return allKeys.filter(key => key.startsWith(prefix));
        } catch (error) {
            this.logger.error(`Failed to get keys by prefix: ${prefix}`, error);
            return [];
        }
    }

    /**
     * Migrate data from old key to new key
     * @param {string} oldKey - Old storage key
     * @param {string} newKey - New storage key
     * @param {boolean} removeOld - Whether to remove old key after migration
     * @returns {boolean} Success status
     */
    migrate(oldKey, newKey, removeOld = true) {
        try {
            if (!this.has(oldKey)) {
                this.logger.warn(`Migration skipped: old key not found: ${oldKey}`);
                return false;
            }

            const data = this.get(oldKey);
            this.set(newKey, data);

            if (removeOld) {
                this.remove(oldKey);
            }

            this.logger.info(`Storage migrated: ${oldKey} → ${newKey}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to migrate storage: ${oldKey} → ${newKey}`, error);
            return false;
        }
    }
}

module.exports = StorageService;
