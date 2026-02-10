/**
 * SvelteKit Server Hooks
 * Handles authentication and session management
 */

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Check if running in Electron based on user agent
	const userAgent = event.request.headers.get('user-agent') || '';
	const isElectron = userAgent.includes('Electron');

	// In Electron, assume authenticated (local trusted environment)
	if (isElectron) {
		event.locals.user = {
			isAuthenticated: true,
			isAdmin: true,
			isElectron: true
		};
		return resolve(event);
	}

	// For web browser, check session with Express backend
	// The session cookie will be forwarded automatically
	try {
		const cookieHeader = event.request.headers.get('cookie') || '';

		const response = await fetch('http://localhost:3000/api/admin/status', {
			headers: {
				// Forward session cookie from the request
				cookie: cookieHeader
			},
			credentials: 'include'
		});

		if (response.ok) {
			const data = await response.json();
			// Express returns { isAdmin: boolean, username: string | null }
			// If isAdmin is true, user is authenticated
			event.locals.user = {
				isAuthenticated: data.isAdmin || false,
				isAdmin: data.isAdmin || false,
				username: data.username,
				isElectron: false
			};
		} else {
			event.locals.user = {
				isAuthenticated: false,
				isAdmin: false,
				isElectron: false
			};
		}
	} catch (error) {
		// If can't reach backend, assume not authenticated
		event.locals.user = {
			isAuthenticated: false,
			isAdmin: false,
			isElectron: false
		};
	}

	// In dev mode, bypass auth so SvelteKit dev server works without separate login
	// API calls still go through Vite proxy which forwards cookies correctly
	const isDev = import.meta.env.DEV;
	if (isDev && !event.locals.user.isAuthenticated) {
		event.locals.user = {
			isAuthenticated: true,
			isAdmin: true,
			username: 'dev',
			isElectron: false
		};
	}

	return resolve(event);
};
