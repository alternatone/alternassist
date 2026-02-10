/**
 * Admin Authentication Check
 * Include this script in any admin-only page to enforce authentication
 *
 * When loaded inside Electron app (as iframe from file://), skip auth check
 * since the user is already on the local machine.
 */

// Check if we're being loaded from within Electron (parent is file://)
const isInElectronApp = (function() {
    try {
        // If we're in an iframe and parent is using file:// protocol, we're in Electron
        if (window.parent && window.parent !== window) {
            const parentProtocol = window.parent.location.protocol;
            if (parentProtocol === 'file:') {
                return true;
            }
        }
        // Also check if electronAPI is available (indicates Electron environment)
        if (typeof window.electronAPI !== 'undefined') {
            return true;
        }
    } catch (e) {
        // Cross-origin error means parent is different origin - not in Electron iframe
    }
    return false;
})();

if (isInElectronApp) {
    // Skip auth check in Electron - show page immediately
    // The user is already authenticated by virtue of running the local app
} else {
    // Hide body until auth check completes to prevent flash
    document.documentElement.style.visibility = 'hidden';

    (async function() {
        try {
            const response = await fetch('/api/admin/status', {
                credentials: 'include'
            });

            const data = await response.json();

            if (!data.isAdmin) {
                // Not authenticated - redirect to login
                window.location.replace('/media/admin-login.html');
            } else {
                // Authenticated - show the page
                document.documentElement.style.visibility = 'visible';
            }
        } catch (error) {
            // Server error or not authenticated - redirect to login
            console.error('Auth check failed:', error);
            window.location.replace('/media/admin-login.html');
        }
    })();
}
