// Check authentication and redirect to login if needed
async function checkAuth() {
    try {
        const response = await fetch('/api/projects/current', {
            credentials: 'include'
        });

        if (!response.ok) {
            // Not authenticated - redirect to login
            window.location.href = 'login.html';
            return null;
        }

        const project = await response.json();
        return project;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'login.html';
        return null;
    }
}

function logout() {
    fetch('/api/projects/logout', {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = 'login.html';
    });
}

// Initialize on page load
checkAuth().then(project => {
    if (project) {
        document.getElementById('filesView').style.display = 'block';
        document.getElementById('projectName').textContent = project.name;
        loadFiles();
    }
});
