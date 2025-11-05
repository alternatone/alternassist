/**
 * Configuration Service
 * Single source of truth for all application configuration
 */

class ConfigService {
    constructor() {
        this.config = {
            // Business rates and pricing
            rates: {
                MUSIC_RATE: 150,        // $ per minute
                DAY_RATE: 500,          // $ per day
                HOURS_PER_DAY: 8,       // hours per day
                TAX_RATE: 0.30,         // 30% tax
                BUNDLE_DISCOUNT: 0.10   // 10% discount for bundled services
            },

            // Business settings
            business: {
                COMPANY_NAME: 'Alternatone',
                PAYMENT_TERMS_DAYS: 15,
                LATE_FEE_RATE: 0.015,   // 1.5% per month
                DEFAULT_CATEGORY: 'music-production'
            },

            // LocalStorage keys
            storage: {
                KEYS: {
                    PROJECTS: 'kanban-projects',
                    INVOICES: 'logged-invoices',
                    PAYMENTS: 'outstanding-payments',
                    TRANSACTIONS: 'accountingTransactions',
                    ESTIMATES: 'logged-estimates',
                    INVOICE_COUNT: 'invoice-count'
                }
            },

            // PTSL configuration
            ptsl: {
                HOST: 'localhost',
                PORT: 31416,
                HEARTBEAT_INTERVAL: 30000,      // 30 seconds
                MAX_RECONNECT_ATTEMPTS: 10,
                BASE_RECONNECT_DELAY: 1000,     // 1 second
                MAX_RECONNECT_DELAY: 30000,     // 30 seconds
                COMPANY_NAME: 'alternatone',
                APPLICATION_NAME: 'alternassist'
            },

            // Electron window settings
            window: {
                WIDTH: 1400,
                HEIGHT: 900,
                BACKGROUND_COLOR: '#FDF8F0',
                TITLE_BAR_STYLE: 'hiddenInset'
            },

            // Application settings
            app: {
                NAME: 'Alternassist',
                VERSION: '1.0.0',
                ENVIRONMENT: process.env.NODE_ENV || 'production'
            },

            // Category definitions
            categories: {
                MUSIC_PRODUCTION: 'music-production',
                POST_PRODUCTION: 'post-production',
                SOUND_DESIGN: 'sound-design',
                MIXING: 'mixing',
                MASTERING: 'mastering',
                CONSULTATION: 'consultation'
            },

            // Tax categories for accounting
            taxCategories: {
                INCOME: {
                    MUSIC: 'income-music',
                    POST: 'income-post',
                    CONSULTATION: 'income-consultation',
                    OTHER: 'income-other'
                },
                EXPENSE: {
                    EQUIPMENT: 'expense-equipment',
                    SOFTWARE: 'expense-software',
                    MARKETING: 'expense-marketing',
                    OFFICE: 'expense-office',
                    PROFESSIONAL: 'expense-professional',
                    EDUCATION: 'expense-education',
                    TRAVEL: 'expense-travel',
                    UTILITIES: 'expense-utilities'
                }
            },

            // Status definitions
            statuses: {
                PROJECT: {
                    PROSPECT: 'prospects',
                    IN_PROCESS: 'in-process',
                    IN_REVIEW: 'in-review',
                    APPROVED: 'approved-billed',
                    ARCHIVE: 'archive'
                },
                INVOICE: {
                    DRAFT: 'draft',
                    SENT: 'sent',
                    PARTIAL: 'partial',
                    PAID: 'paid',
                    OVERDUE: 'overdue'
                },
                CUE: {
                    TO_WRITE: 'to-write',
                    WRITTEN: 'written',
                    REVISIONS: 'revisions',
                    APPROVED: 'approved'
                }
            },

            // Date formats
            formats: {
                DATE_SHORT: 'MM/DD/YYYY',
                DATE_LONG: 'MMMM DD, YYYY',
                DATE_ISO: 'YYYY-MM-DD',
                TIME_SHORT: 'HH:MM',
                TIME_LONG: 'HH:MM:SS'
            }
        };
    }

    /**
     * Get configuration value by path
     * @param {string} path - Dot-notated path (e.g., 'rates.MUSIC_RATE')
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Get all rates
     * @returns {Object} Rates object
     */
    getRates() {
        return { ...this.config.rates };
    }

    /**
     * Get storage key
     * @param {string} name - Key name (e.g., 'PROJECTS')
     * @returns {string} Storage key
     */
    getStorageKey(name) {
        return this.config.storage.KEYS[name] || null;
    }

    /**
     * Get PTSL configuration
     * @returns {Object} PTSL config
     */
    getPTSLConfig() {
        return { ...this.config.ptsl };
    }

    /**
     * Get window configuration
     * @returns {Object} Window config
     */
    getWindowConfig() {
        return { ...this.config.window };
    }

    /**
     * Check if running in development mode
     * @returns {boolean} True if development
     */
    isDevelopment() {
        return this.config.app.ENVIRONMENT === 'development';
    }

    /**
     * Get entire configuration (for debugging)
     * @returns {Object} Full config object
     */
    getAll() {
        return { ...this.config };
    }
}

module.exports = ConfigService;
