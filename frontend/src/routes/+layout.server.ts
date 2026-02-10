/**
 * Root Layout Server Load
 * Provides auth state to all pages and handles auth guards
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Public routes that don't require authentication
	const publicPaths = [
		'/login',
		'/client-login',
		'/viewer' // Public share viewer routes
	];

	// Check if current path is public
	const isPublicPath = publicPaths.some((path) => url.pathname.startsWith(path));

	// TEMPORARY DEV BYPASS: Skip server-side auth check in development
	// This is a workaround for cookie issues with Vite proxy
	const isDev = import.meta.env.DEV;

	// If not authenticated and trying to access protected route, redirect to login
	// (Skip this check in dev mode to allow client-side auth to work)
	if (!isDev && !isPublicPath && !locals.user.isAuthenticated) {
		throw redirect(302, '/login');
	}

	// Return user data to all pages
	return {
		user: locals.user
	};
};
