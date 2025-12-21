/**
 * Admin Authentication Check
 * Include this script in any admin-only page to enforce authentication
 */

(async function() {
    try {
        const response = await fetch('http://localhost:3000/api/admin/status', {
            credentials: 'include'
        });

        const data = await response.json();

        if (!data.isAdmin) {
            // Not authenticated - redirect to login
            window.location.href = '/media/admin-login.html';
        }
    } catch (error) {
        // Server error or not authenticated - redirect to login
        console.error('Auth check failed:', error);
        window.location.href = '/media/admin-login.html';
    }
})();
