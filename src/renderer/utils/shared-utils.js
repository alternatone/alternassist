/**
 * Shared Utility Functions for Alternassist
 * Common functions used across multiple pages
 */

/**
 * Convert time string to seconds
 * @param {string} timeStr - Time in format "HH:MM:SS" or "MM:SS"
 * @returns {number} Total seconds
 */
function timeToSeconds(timeStr) {
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
function secondsToTime(seconds, includeHours = true) {
    if (!seconds || isNaN(seconds)) return includeHours ? '00:00:00' : '00:00';

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
 * Normalize old status values to new ones (for backward compatibility)
 * @param {string} status - Status value (old or new)
 * @returns {string} Normalized status
 */
function normalizeStatus(status) {
    // Map old status values to new ones
    const statusMap = {
        'sketch': 'to-write',
        'recording': 'written',
        'mixing': 'revisions',
        'done': 'approved'
    };
    return statusMap[status] || status;
}

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {boolean} includeCents - Whether to include cents
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, includeCents = true) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    const formatted = includeCents ? amount.toFixed(2) : Math.round(amount);
    return `$${formatted.toLocaleString()}`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get current date in YYYY-MM-DD format
 * @returns {string} Date string
 */
function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Parse date string to readable format
 * @param {string} dateStr - ISO date string
 * @returns {string} Readable date
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
