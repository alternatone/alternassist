/**
 * Data Service
 * Centralized CRUD operations for all entities
 */

class DataService {
    constructor(storageService, validationService, configService, loggerService) {
        this.storage = storageService;
        this.validation = validationService;
        this.config = configService;
        this.logger = loggerService;

        // Get storage keys from config
        this.keys = {
            PROJECTS: this.config.getStorageKey('PROJECTS'),
            INVOICES: this.config.getStorageKey('INVOICES'),
            PAYMENTS: this.config.getStorageKey('PAYMENTS'),
            TRANSACTIONS: this.config.getStorageKey('TRANSACTIONS'),
            ESTIMATES: this.config.getStorageKey('ESTIMATES'),
            INVOICE_COUNT: this.config.getStorageKey('INVOICE_COUNT')
        };
    }

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // ============================================================================
    // PROJECT OPERATIONS
    // ============================================================================

    /**
     * Get project by ID
     * @param {string} id - Project ID
     * @returns {Object|null} Project or null if not found
     */
    getProject(id) {
        try {
            const projects = this.getAllProjects();
            return projects.find(p => p.id === id) || null;
        } catch (error) {
            this.logger.error('Failed to get project', { id, error });
            return null;
        }
    }

    /**
     * Get all projects
     * @returns {Array} Array of projects
     */
    getAllProjects() {
        try {
            return this.storage.get(this.keys.PROJECTS, []);
        } catch (error) {
            this.logger.error('Failed to get all projects', error);
            return [];
        }
    }

    /**
     * Save project (create or update)
     * @param {Object} project - Project object
     * @returns {Object} Result {success, data/error}
     */
    saveProject(project) {
        try {
            // Validate project
            const validation = this.validation.validateProject(project);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.errors.join(', ')
                };
            }

            const projects = this.getAllProjects();
            const existingIndex = projects.findIndex(p => p.id === project.id);

            if (project.id && existingIndex >= 0) {
                // Update existing
                projects[existingIndex] = {
                    ...projects[existingIndex],
                    ...project,
                    updatedAt: new Date().toISOString()
                };
                this.logger.info('Project updated', { id: project.id });
            } else {
                // Create new
                const newProject = {
                    ...project,
                    id: project.id || this.generateId(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                projects.push(newProject);
                project = newProject;
                this.logger.info('Project created', { id: newProject.id });
            }

            this.storage.set(this.keys.PROJECTS, projects);

            return {
                success: true,
                data: project
            };
        } catch (error) {
            this.logger.error('Failed to save project', error);
            return {
                success: false,
                error: 'Failed to save project'
            };
        }
    }

    /**
     * Delete project
     * @param {string} id - Project ID
     * @returns {Object} Result {success, error?}
     */
    deleteProject(id) {
        try {
            const projects = this.getAllProjects();
            const filtered = projects.filter(p => p.id !== id);

            if (filtered.length === projects.length) {
                return {
                    success: false,
                    error: 'Project not found'
                };
            }

            this.storage.set(this.keys.PROJECTS, filtered);
            this.logger.info('Project deleted', { id });

            return { success: true };
        } catch (error) {
            this.logger.error('Failed to delete project', { id, error });
            return {
                success: false,
                error: 'Failed to delete project'
            };
        }
    }

    /**
     * Update project status
     * @param {string} id - Project ID
     * @param {string} status - New status
     * @returns {Object} Result
     */
    updateProjectStatus(id, status) {
        const project = this.getProject(id);
        if (!project) {
            return {
                success: false,
                error: 'Project not found'
            };
        }

        project.column = status;
        project.status = status;
        return this.saveProject(project);
    }

    // ============================================================================
    // INVOICE OPERATIONS
    // ============================================================================

    /**
     * Get invoice by ID
     * @param {string} id - Invoice ID
     * @returns {Object|null} Invoice or null
     */
    getInvoice(id) {
        try {
            const invoices = this.getAllInvoices();
            return invoices.find(i => i.id === id) || null;
        } catch (error) {
            this.logger.error('Failed to get invoice', { id, error });
            return null;
        }
    }

    /**
     * Get all invoices
     * @returns {Array} Array of invoices
     */
    getAllInvoices() {
        try {
            return this.storage.get(this.keys.INVOICES, []);
        } catch (error) {
            this.logger.error('Failed to get all invoices', error);
            return [];
        }
    }

    /**
     * Save invoice
     * @param {Object} invoice - Invoice object
     * @returns {Object} Result
     */
    saveInvoice(invoice) {
        try {
            // Validate invoice
            const validation = this.validation.validateInvoice(invoice);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.errors.join(', ')
                };
            }

            const invoices = this.getAllInvoices();
            const existingIndex = invoices.findIndex(i => i.id === invoice.id);

            if (invoice.id && existingIndex >= 0) {
                // Update existing
                invoices[existingIndex] = {
                    ...invoices[existingIndex],
                    ...invoice,
                    updatedAt: new Date().toISOString()
                };
                this.logger.info('Invoice updated', { id: invoice.id });
            } else {
                // Create new
                const newInvoice = {
                    ...invoice,
                    id: invoice.id || this.generateId(),
                    invoiceNumber: invoice.invoiceNumber || this.generateInvoiceNumber(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                invoices.push(newInvoice);
                invoice = newInvoice;
                this.logger.info('Invoice created', { id: newInvoice.id });
            }

            this.storage.set(this.keys.INVOICES, invoices);

            return {
                success: true,
                data: invoice
            };
        } catch (error) {
            this.logger.error('Failed to save invoice', error);
            return {
                success: false,
                error: 'Failed to save invoice'
            };
        }
    }

    /**
     * Delete invoice
     * @param {string} id - Invoice ID
     * @returns {Object} Result
     */
    deleteInvoice(id) {
        try {
            const invoices = this.getAllInvoices();
            const filtered = invoices.filter(i => i.id !== id);

            if (filtered.length === invoices.length) {
                return {
                    success: false,
                    error: 'Invoice not found'
                };
            }

            this.storage.set(this.keys.INVOICES, filtered);
            this.logger.info('Invoice deleted', { id });

            return { success: true };
        } catch (error) {
            this.logger.error('Failed to delete invoice', { id, error });
            return {
                success: false,
                error: 'Failed to delete invoice'
            };
        }
    }

    /**
     * Generate invoice number
     * @returns {string} Invoice number
     */
    generateInvoiceNumber() {
        const count = this.storage.get(this.keys.INVOICE_COUNT, 0);
        const nextCount = count + 1;
        this.storage.set(this.keys.INVOICE_COUNT, nextCount);
        return `INV-${String(nextCount).padStart(4, '0')}`;
    }

    // ============================================================================
    // PAYMENT OPERATIONS
    // ============================================================================

    /**
     * Get payment by ID
     * @param {string} id - Payment ID
     * @returns {Object|null} Payment or null
     */
    getPayment(id) {
        try {
            const payments = this.getAllPayments();
            return payments.find(p => p.id === id) || null;
        } catch (error) {
            this.logger.error('Failed to get payment', { id, error });
            return null;
        }
    }

    /**
     * Get all payments
     * @returns {Array} Array of payments
     */
    getAllPayments() {
        try {
            return this.storage.get(this.keys.PAYMENTS, []);
        } catch (error) {
            this.logger.error('Failed to get all payments', error);
            return [];
        }
    }

    /**
     * Record payment
     * @param {Object} payment - Payment object
     * @returns {Object} Result
     */
    recordPayment(payment) {
        try {
            // Validate payment
            const validation = this.validation.validatePayment(payment);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.errors.join(', ')
                };
            }

            const payments = this.getAllPayments();

            const newPayment = {
                ...payment,
                id: payment.id || this.generateId(),
                createdAt: new Date().toISOString()
            };

            payments.push(newPayment);
            this.storage.set(this.keys.PAYMENTS, payments);

            this.logger.info('Payment recorded', { id: newPayment.id });

            return {
                success: true,
                data: newPayment
            };
        } catch (error) {
            this.logger.error('Failed to record payment', error);
            return {
                success: false,
                error: 'Failed to record payment'
            };
        }
    }

    /**
     * Get outstanding payments
     * @returns {Array} Array of outstanding payments
     */
    getOutstandingPayments() {
        try {
            const invoices = this.getAllInvoices();
            const payments = this.getAllPayments();

            return invoices.filter(invoice => {
                const invoicePayments = payments.filter(p => p.invoiceId === invoice.id);
                const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
                return totalPaid < Number(invoice.amount || 0);
            });
        } catch (error) {
            this.logger.error('Failed to get outstanding payments', error);
            return [];
        }
    }

    // ============================================================================
    // TRANSACTION OPERATIONS (Accounting)
    // ============================================================================

    /**
     * Get transaction by ID
     * @param {string} id - Transaction ID
     * @returns {Object|null} Transaction or null
     */
    getTransaction(id) {
        try {
            const transactions = this.getAllTransactions();
            return transactions.find(t => t.id === id) || null;
        } catch (error) {
            this.logger.error('Failed to get transaction', { id, error });
            return null;
        }
    }

    /**
     * Get all transactions
     * @returns {Array} Array of transactions
     */
    getAllTransactions() {
        try {
            return this.storage.get(this.keys.TRANSACTIONS, []);
        } catch (error) {
            this.logger.error('Failed to get all transactions', error);
            return [];
        }
    }

    /**
     * Save transaction
     * @param {Object} transaction - Transaction object
     * @returns {Object} Result
     */
    saveTransaction(transaction) {
        try {
            // Validate transaction
            const validation = this.validation.validateTransaction(transaction);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.errors.join(', ')
                };
            }

            const transactions = this.getAllTransactions();
            const existingIndex = transactions.findIndex(t => t.id === transaction.id);

            if (transaction.id && existingIndex >= 0) {
                // Update existing
                transactions[existingIndex] = {
                    ...transactions[existingIndex],
                    ...transaction,
                    updatedAt: new Date().toISOString()
                };
                this.logger.info('Transaction updated', { id: transaction.id });
            } else {
                // Create new
                const newTransaction = {
                    ...transaction,
                    id: transaction.id || this.generateId(),
                    createdAt: new Date().toISOString()
                };
                transactions.push(newTransaction);
                transaction = newTransaction;
                this.logger.info('Transaction created', { id: newTransaction.id });
            }

            this.storage.set(this.keys.TRANSACTIONS, transactions);

            return {
                success: true,
                data: transaction
            };
        } catch (error) {
            this.logger.error('Failed to save transaction', error);
            return {
                success: false,
                error: 'Failed to save transaction'
            };
        }
    }

    /**
     * Delete transaction
     * @param {string} id - Transaction ID
     * @returns {Object} Result
     */
    deleteTransaction(id) {
        try {
            const transactions = this.getAllTransactions();
            const filtered = transactions.filter(t => t.id !== id);

            if (filtered.length === transactions.length) {
                return {
                    success: false,
                    error: 'Transaction not found'
                };
            }

            this.storage.set(this.keys.TRANSACTIONS, filtered);
            this.logger.info('Transaction deleted', { id });

            return { success: true };
        } catch (error) {
            this.logger.error('Failed to delete transaction', { id, error });
            return {
                success: false,
                error: 'Failed to delete transaction'
            };
        }
    }
}

module.exports = DataService;
