/**
 * Environment Detection Utility
 * Detects if the app is running in Electron or browser
 */

/**
 * Check if running in Electron environment
 * @returns {boolean} True if running in Electron
 */
function isElectron() {
    // Check if running in Electron renderer process
    if (typeof window !== 'undefined' &&
        typeof window.process === 'object' &&
        window.process.type === 'renderer') {
        return true;
    }

    // Check if Electron is available via require (Node.js context)
    if (typeof process !== 'undefined' &&
        typeof process.versions !== 'undefined' &&
        typeof process.versions.electron !== 'undefined') {
        return true;
    }

    // Check for electron in user agent
    if (typeof navigator === 'object' &&
        typeof navigator.userAgent === 'string' &&
        navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}

/**
 * Check if PTSL (Pro Tools Scripting Library) is available
 * PTSL is only available in Electron environment
 * @returns {boolean} True if PTSL is available
 */
function isPTSLAvailable() {
    // PTSL requires Electron
    if (!isElectron()) {
        return false;
    }

    // Check if electronAPI.ptsl is exposed
    if (typeof window !== 'undefined' &&
        typeof window.electronAPI !== 'undefined' &&
        typeof window.electronAPI.ptsl !== 'undefined') {
        return true;
    }

    return false;
}

/**
 * Check if running in web browser
 * @returns {boolean} True if running in web browser
 */
function isBrowser() {
    return !isElectron();
}

/**
 * Get environment type as string
 * @returns {string} 'electron' or 'browser'
 */
function getEnvironment() {
    return isElectron() ? 'electron' : 'browser';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isElectron,
        isPTSLAvailable,
        isBrowser,
        getEnvironment
    };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.EnvironmentDetector = {
        isElectron,
        isPTSLAvailable,
        isBrowser,
        getEnvironment
    };
}
