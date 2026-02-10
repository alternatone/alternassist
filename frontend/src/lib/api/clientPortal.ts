const API_BASE = '/api/projects';

async function handleResponse(response: Response) {
	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Request failed' }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}
	return response.json();
}

export const clientPortalAPI = {
	/**
	 * Login with project name and password (client authentication)
	 */
	async login(credentials: { name: string; password: string }) {
		const response = await fetch(`${API_BASE}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(credentials)
		});
		return handleResponse(response);
	},

	/**
	 * Get current authenticated project
	 */
	async getCurrent() {
		const response = await fetch(`${API_BASE}/current`, {
			credentials: 'include'
		});
		return handleResponse(response);
	},

	/**
	 * Logout from client portal
	 */
	async logout() {
		const response = await fetch(`${API_BASE}/logout`, {
			method: 'POST',
			credentials: 'include'
		});
		return handleResponse(response);
	}
};
