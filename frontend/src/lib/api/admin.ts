/**
 * Admin API
 * Authentication and admin user management
 */

import { get, post, del } from './client';

export interface AdminUser {
	id: number;
	username: string;
	created_at?: string;
}

export interface LoginCredentials {
	username: string;
	password: string;
}

export interface AuthStatus {
	isAuthenticated: boolean;
	isAdmin?: boolean;
	username?: string;
}

export const adminAPI = {
	/**
	 * Admin login
	 */
	async login(credentials: LoginCredentials): Promise<{ success: boolean; message?: string }> {
		return post('/admin/login', credentials);
	},

	/**
	 * Admin logout
	 */
	async logout(): Promise<void> {
		return get('/admin/logout');
	},

	/**
	 * Check authentication status
	 */
	async getStatus(): Promise<AuthStatus> {
		return get<AuthStatus>('/admin/status');
	},

	/**
	 * Get all admin users
	 */
	async getUsers(): Promise<AdminUser[]> {
		return get<AdminUser[]>('/admin/users');
	},

	/**
	 * Create new admin user
	 */
	async createUser(userData: {
		username: string;
		password: string;
	}): Promise<AdminUser> {
		return post<AdminUser>('/admin/create-user', userData);
	},

	/**
	 * Delete admin user
	 */
	async deleteUser(id: number): Promise<void> {
		return del(`/admin/users/${id}`);
	}
};
