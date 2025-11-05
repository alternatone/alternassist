/**
 * Format Service
 * Consistent formatting utilities across the entire app
 */

class FormatService {
    /**
     * Format currency value
     * @param {number} amount - Amount to format
     * @param {boolean} includeCents - Whether to include cents
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount, includeCents = true) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return '$0.00';
        }

        const numAmount = Number(amount);
        const formatted = includeCents
            ? numAmount.toFixed(2)
            : Math.round(numAmount).toString();

        // Add thousands separators
        const parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        return `$${parts.join('.')}`;
    }

    /**
     * Format date to readable string
     * @param {string|Date} date - Date to format
     * @param {string} format - Format type ('short', 'long', 'iso')
     * @returns {string} Formatted date
     */
    formatDate(date, format = 'short') {
        if (!date) return '';

        const dateObj = typeof date === 'string' ? new Date(date) : date;

        if (isNaN(dateObj.getTime())) {
            return '';
        }

        switch (format) {
            case 'short':
                return dateObj.toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                });

            case 'long':
                return dateObj.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

            case 'iso':
                return dateObj.toISOString().split('T')[0];

            case 'relative':
                return this.formatDateRelative(dateObj);

            default:
                return dateObj.toLocaleDateString('en-US');
        }
    }

    /**
     * Format date as relative time (e.g., "2 days ago")
     * @param {Date} date - Date to format
     * @returns {string} Relative time string
     */
    formatDateRelative(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    /**
     * Get current date in ISO format (YYYY-MM-DD)
     * @returns {string} Current date
     */
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Format project/invoice status for display
     * @param {string} status - Status value
     * @returns {string} Formatted status
     */
    formatStatus(status) {
        if (!status) return '';

        // Map internal status values to display names
        const statusMap = {
            'prospects': 'Prospects',
            'in-process': 'In Process',
            'in-review': 'In Review',
            'approved-billed': 'Approved / Billed',
            'archive': 'Archive',
            'draft': 'Draft',
            'sent': 'Sent',
            'partial': 'Partially Paid',
            'paid': 'Paid',
            'overdue': 'Overdue',
            'to-write': 'To Write',
            'written': 'Written',
            'revisions': 'Revisions',
            'approved': 'Approved'
        };

        return statusMap[status] || status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Format category for display
     * @param {string} category - Category value
     * @returns {string} Formatted category
     */
    formatCategory(category) {
        if (!category) return '';

        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Format tax category with proper display name and badge style
     * @param {string} taxCategory - Tax category value
     * @returns {Object} Category info with display name and style
     */
    formatTaxCategory(taxCategory) {
        const categories = {
            // Income categories
            'income-music': {
                display: 'Music Production',
                type: 'income',
                badge: 'success'
            },
            'income-post': {
                display: 'Post Production',
                type: 'income',
                badge: 'success'
            },
            'income-consultation': {
                display: 'Consultation',
                type: 'income',
                badge: 'success'
            },
            'income-other': {
                display: 'Other Income',
                type: 'income',
                badge: 'success'
            },

            // Expense categories
            'expense-equipment': {
                display: 'Equipment',
                type: 'expense',
                badge: 'danger'
            },
            'expense-software': {
                display: 'Software',
                type: 'expense',
                badge: 'danger'
            },
            'expense-marketing': {
                display: 'Marketing',
                type: 'expense',
                badge: 'danger'
            },
            'expense-office': {
                display: 'Office Supplies',
                type: 'expense',
                badge: 'danger'
            },
            'expense-professional': {
                display: 'Professional Services',
                type: 'expense',
                badge: 'danger'
            },
            'expense-education': {
                display: 'Education',
                type: 'expense',
                badge: 'danger'
            },
            'expense-travel': {
                display: 'Travel',
                type: 'expense',
                badge: 'danger'
            },
            'expense-utilities': {
                display: 'Utilities',
                type: 'expense',
                badge: 'danger'
            }
        };

        return categories[taxCategory] || {
            display: this.formatCategory(taxCategory),
            type: taxCategory.startsWith('income') ? 'income' : 'expense',
            badge: 'neutral'
        };
    }

    /**
     * Convert time string to seconds
     * @param {string} timeStr - Time in format "HH:MM:SS" or "MM:SS"
     * @returns {number} Total seconds
     */
    timeToSeconds(timeStr) {
        if (!timeStr) return 0;

        const parts = timeStr.split(':').map(p => parseInt(p) || 0);

        if (parts.length === 3) {
            // HH:MM:SS format
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            // MM:SS format
            return parts[0] * 60 + parts[1];
        }

        return 0;
    }

    /**
     * Convert seconds to time string
     * @param {number} seconds - Total seconds
     * @param {boolean} includeHours - Whether to include hours in output
     * @returns {string} Time in format "HH:MM:SS" or "MM:SS"
     */
    secondsToTime(seconds, includeHours = true) {
        if (!seconds || isNaN(seconds)) {
            return includeHours ? '00:00:00' : '00:00';
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const pad = (num) => String(num).padStart(2, '0');

        if (includeHours) {
            return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
        } else {
            return `${pad(minutes)}:${pad(secs)}`;
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    escapeHtml(text) {
        if (!text) return '';

        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Format email address for display
     * @param {string} email - Email address
     * @returns {string} Formatted email
     */
    formatEmail(email) {
        if (!email) return '';
        return email.toLowerCase().trim();
    }

    /**
     * Format phone number for display
     * @param {string} phone - Phone number
     * @returns {string} Formatted phone
     */
    formatPhone(phone) {
        if (!phone) return '';

        // Remove all non-numeric characters
        const cleaned = phone.replace(/\D/g, '');

        // Format as (XXX) XXX-XXXX for 10-digit US numbers
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }

        return phone;
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @param {string} suffix - Suffix to add (default '...')
     * @returns {string} Truncated text
     */
    truncate(text, maxLength, suffix = '...') {
        if (!text || text.length <= maxLength) {
            return text || '';
        }

        return text.slice(0, maxLength - suffix.length) + suffix;
    }

    /**
     * Format percentage
     * @param {number} value - Value to format as percentage
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted percentage
     */
    formatPercentage(value, decimals = 0) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0%';
        }

        return `${(value * 100).toFixed(decimals)}%`;
    }

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
}

module.exports = FormatService;
