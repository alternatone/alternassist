/**
 * Admin Authentication Check
 * Include this script in any admin-only page to enforce authentication
 */

// Hide body until auth check completes to prevent flash
document.documentElement.style.visibility = 'hidden';

(async function() {
    try {
        const response = await fetch('http://localhost:3000/api/admin/status', {
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
