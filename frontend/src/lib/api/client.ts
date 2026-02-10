/**
 * Base API Client
 * Provides generic fetch wrappers with error handling and authentication
 */

// Detect base URL for API calls
// In SvelteKit, this will work in both dev (proxy) and production (same origin)
const API_BASE = '/api';

/**
 * Generic API fetch wrapper with error handling
 */
async function apiFetch<T>(
	url: string,
	options: RequestInit = {}
): Promise<T> {
	const defaultOptions: RequestInit = {
		credentials: 'include', // Include session cookies
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		}
	};

	const response = await fetch(`${API_BASE}${url}`, {
		...defaultOptions,
		...options
	});

	if (!response.ok) {
		// Handle 401 (unauthorized) - redirect to login
		if (response.status === 401) {
			// Only redirect if not in Electron
			if (typeof window !== 'undefined' && !(window as any).electronAPI) {
				window.location.href = '/login';
			}
		}

		// Try to parse error message from response
		let errorMessage = `HTTP Error ${response.status}`;
		try {
			const errorData = await response.json();
			errorMessage = errorData.error || errorMessage;
		} catch {
			// If JSON parsing fails, use status text
			errorMessage = response.statusText || errorMessage;
		}

		throw new Error(errorMessage);
	}

	// Handle 204 No Content
	if (response.status === 204) {
		return null as T;
	}

	return response.json();
}

/**
 * GET request
 */
export async function get<T>(url: string): Promise<T> {
	return apiFetch<T>(url, { method: 'GET' });
}

/**
 * POST request
 */
export async function post<T>(url: string, data?: any): Promise<T> {
	return apiFetch<T>(url, {
		method: 'POST',
		body: data ? JSON.stringify(data) : undefined
	});
}

/**
 * PATCH request
 */
export async function patch<T>(url: string, data: any): Promise<T> {
	return apiFetch<T>(url, {
		method: 'PATCH',
		body: JSON.stringify(data)
	});
}

/**
 * PUT request
 */
export async function put<T>(url: string, data: any): Promise<T> {
	return apiFetch<T>(url, {
		method: 'PUT',
		body: JSON.stringify(data)
	});
}

/**
 * DELETE request
 */
export async function del<T>(url: string): Promise<T> {
	return apiFetch<T>(url, { method: 'DELETE' });
}

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
	return typeof window !== 'undefined' && !!(window as any).electronAPI;
}
