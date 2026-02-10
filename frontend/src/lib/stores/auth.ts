/**
 * Auth Store
 * Client-side authentication state management
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { adminAPI, type AuthStatus } from '$lib/api';

interface AuthState extends AuthStatus {
	loading: boolean;
	error?: string;
}

/**
 * Create auth store with initial state
 */
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		isAuthenticated: false,
		loading: true
	});

	return {
		subscribe,

		/**
		 * Initialize auth state by checking with backend
		 */
		async init() {
			if (!browser) return;

			update((state) => ({ ...state, loading: true }));

			try {
				const status = await adminAPI.getStatus();
				// Express returns { isAdmin, username }, derive isAuthenticated from isAdmin
				set({
					isAuthenticated: status.isAuthenticated ?? status.isAdmin ?? false,
					isAdmin: status.isAdmin,
					username: status.username,
					loading: false
				});
			} catch (error) {
				set({
					isAuthenticated: false,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to check auth status'
				});
			}
		},

		/**
		 * Login
		 */
		async login(username: string, password: string) {
			update((state) => ({ ...state, loading: true, error: undefined }));

			try {
				const result = await adminAPI.login({ username, password });

				if (result.success) {
					// Re-check auth status to get full user data
					await this.init();
					return { success: true };
				} else {
					update((state) => ({
						...state,
						loading: false,
						error: result.message || 'Login failed'
					}));
					return { success: false, message: result.message };
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Login failed';
				update((state) => ({
					...state,
					loading: false,
					error: errorMessage
				}));
				return { success: false, message: errorMessage };
			}
		},

		/**
		 * Logout
		 */
		async logout() {
			update((state) => ({ ...state, loading: true }));

			try {
				await adminAPI.logout();
				set({
					isAuthenticated: false,
					loading: false
				});
			} catch (error) {
				// Even if logout fails, clear local state
				set({
					isAuthenticated: false,
					loading: false,
					error: error instanceof Error ? error.message : 'Logout failed'
				});
			}
		},

		/**
		 * Clear error
		 */
		clearError() {
			update((state) => ({ ...state, error: undefined }));
		}
	};
}

export const authStore = createAuthStore();
