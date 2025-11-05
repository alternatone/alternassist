/**
 * Validation Service
 * Data validation with consistent error messages
 */

class ValidationService {
    constructor(configService) {
        this.config = configService;
    }

    /**
     * Validate project data
     * @param {Object} project - Project object to validate
     * @returns {Object} Validation result { valid: boolean, errors: [] }
     */
    validateProject(project) {
        const errors = [];

        if (!project) {
            errors.push('Project data is required');
            return { valid: false, errors };
        }

        // Required fields
        if (!project.title || project.title.trim() === '') {
            errors.push('Project title is required');
        }

        if (!project.client || project.client.trim() === '') {
            errors.push('Client name is required');
        }

        // Optional but validated if present
        if (project.contactEmail && !this.validateEmail(project.contactEmail).valid) {
            errors.push('Invalid contact email address');
        }

        if (project.column) {
            const validColumns = Object.values(this.config.get('statuses.PROJECT', {}));
            if (!validColumns.includes(project.column)) {
                errors.push(`Invalid project status. Must be one of: ${validColumns.join(', ')}`);
            }
        }

        // Validate scope data if present
        if (project.scopeData) {
            const scopeValidation = this.validateScopeData(project.scopeData);
            if (!scopeValidation.valid) {
                errors.push(...scopeValidation.errors);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate scope data (music minutes, post hours, etc.)
     * @param {Object} scopeData - Scope data object
     * @returns {Object} Validation result
     */
    validateScopeData(scopeData) {
        const errors = [];

        if (!scopeData) {
            return { valid: true, errors };
        }

        // Validate numeric fields
        const numericFields = ['music', 'dialogue', 'soundDesign', 'mix'];
        numericFields.forEach(field => {
            if (scopeData[field] !== undefined) {
                const value = Number(scopeData[field]);
                if (isNaN(value) || value < 0) {
                    errors.push(`${field} must be a non-negative number`);
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate invoice data
     * @param {Object} invoice - Invoice object to validate
     * @returns {Object} Validation result
     */
    validateInvoice(invoice) {
        const errors = [];

        if (!invoice) {
            errors.push('Invoice data is required');
            return { valid: false, errors };
        }

        // Required fields
        if (!invoice.invoiceNumber) {
            errors.push('Invoice number is required');
        }

        if (!invoice.clientName || invoice.clientName.trim() === '') {
            errors.push('Client name is required');
        }

        if (!invoice.date) {
            errors.push('Invoice date is required');
        } else if (!this.validateDate(invoice.date).valid) {
            errors.push('Invalid invoice date');
        }

        if (!invoice.dueDate) {
            errors.push('Due date is required');
        } else if (!this.validateDate(invoice.dueDate).valid) {
            errors.push('Invalid due date');
        }

        // Validate amounts
        if (invoice.amount === undefined || invoice.amount === null) {
            errors.push('Invoice amount is required');
        } else {
            const amountValidation = this.validateAmount(invoice.amount);
            if (!amountValidation.valid) {
                errors.push('Invalid invoice amount');
            }
        }

        // Validate email if present
        if (invoice.clientEmail && !this.validateEmail(invoice.clientEmail).valid) {
            errors.push('Invalid client email address');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate payment data
     * @param {Object} payment - Payment object to validate
     * @returns {Object} Validation result
     */
    validatePayment(payment) {
        const errors = [];

        if (!payment) {
            errors.push('Payment data is required');
            return { valid: false, errors };
        }

        // Required fields
        if (!payment.invoiceId) {
            errors.push('Invoice ID is required');
        }

        if (payment.amount === undefined || payment.amount === null) {
            errors.push('Payment amount is required');
        } else {
            const amountValidation = this.validateAmount(payment.amount);
            if (!amountValidation.valid) {
                errors.push('Invalid payment amount');
            }
            if (payment.amount <= 0) {
                errors.push('Payment amount must be greater than zero');
            }
        }

        if (!payment.date) {
            errors.push('Payment date is required');
        } else if (!this.validateDate(payment.date).valid) {
            errors.push('Invalid payment date');
        }

        if (!payment.method || payment.method.trim() === '') {
            errors.push('Payment method is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate transaction data
     * @param {Object} transaction - Transaction object to validate
     * @returns {Object} Validation result
     */
    validateTransaction(transaction) {
        const errors = [];

        if (!transaction) {
            errors.push('Transaction data is required');
            return { valid: false, errors };
        }

        // Required fields
        if (!transaction.date) {
            errors.push('Transaction date is required');
        } else if (!this.validateDate(transaction.date).valid) {
            errors.push('Invalid transaction date');
        }

        if (!transaction.description || transaction.description.trim() === '') {
            errors.push('Transaction description is required');
        }

        if (transaction.amount === undefined || transaction.amount === null) {
            errors.push('Transaction amount is required');
        } else {
            const amountValidation = this.validateAmount(transaction.amount);
            if (!amountValidation.valid) {
                errors.push('Invalid transaction amount');
            }
        }

        if (!transaction.taxCategory || transaction.taxCategory.trim() === '') {
            errors.push('Tax category is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {Object} Validation result
     */
    validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, error: 'Email is required' };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const valid = emailRegex.test(email.trim());

        return {
            valid,
            error: valid ? null : 'Invalid email format'
        };
    }

    /**
     * Validate date string
     * @param {string|Date} date - Date to validate
     * @returns {Object} Validation result
     */
    validateDate(date) {
        if (!date) {
            return { valid: false, error: 'Date is required' };
        }

        const dateObj = typeof date === 'string' ? new Date(date) : date;
        const valid = dateObj instanceof Date && !isNaN(dateObj.getTime());

        return {
            valid,
            error: valid ? null : 'Invalid date format'
        };
    }

    /**
     * Validate amount (must be a valid number)
     * @param {number} amount - Amount to validate
     * @returns {Object} Validation result
     */
    validateAmount(amount) {
        if (amount === null || amount === undefined) {
            return { valid: false, error: 'Amount is required' };
        }

        const numAmount = Number(amount);
        const valid = !isNaN(numAmount) && isFinite(numAmount);

        return {
            valid,
            error: valid ? null : 'Amount must be a valid number'
        };
    }

    /**
     * Validate ID format
     * @param {string} id - ID to validate
     * @returns {Object} Validation result
     */
    validateId(id) {
        if (!id || typeof id !== 'string') {
            return { valid: false, error: 'ID is required' };
        }

        const valid = id.trim().length > 0;

        return {
            valid,
            error: valid ? null : 'Invalid ID format'
        };
    }

    /**
     * Validate required field
     * @param {*} value - Value to check
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    validateRequired(value, fieldName = 'Field') {
        const valid = value !== null && value !== undefined && value !== '';

        return {
            valid,
            error: valid ? null : `${fieldName} is required`
        };
    }

    /**
     * Validate string length
     * @param {string} value - String to validate
     * @param {number} min - Minimum length
     * @param {number} max - Maximum length
     * @returns {Object} Validation result
     */
    validateLength(value, min = 0, max = Infinity) {
        if (!value || typeof value !== 'string') {
            return { valid: false, error: 'Value must be a string' };
        }

        const length = value.trim().length;
        const valid = length >= min && length <= max;

        let error = null;
        if (!valid) {
            if (length < min) {
                error = `Must be at least ${min} characters`;
            } else {
                error = `Must be no more than ${max} characters`;
            }
        }

        return { valid, error };
    }

    /**
     * Validate number range
     * @param {number} value - Number to validate
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {Object} Validation result
     */
    validateRange(value, min = -Infinity, max = Infinity) {
        const numValue = Number(value);

        if (isNaN(numValue)) {
            return { valid: false, error: 'Value must be a number' };
        }

        const valid = numValue >= min && numValue <= max;

        let error = null;
        if (!valid) {
            if (numValue < min) {
                error = `Must be at least ${min}`;
            } else {
                error = `Must be no more than ${max}`;
            }
        }

        return { valid, error };
    }
}

module.exports = ValidationService;
