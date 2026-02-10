/**
 * Share API
 * Share link generation and management for public viewing
 */

import { get, post, del } from './client';

export interface ShareLink {
	id: number;
	project_id?: number;
	file_id?: number;
	token: string;
	password_hash?: string;
	expires_at?: string;
	created_by?: string;
	access_count?: number;
	last_accessed_at?: string;
	ftp_path?: string;
	created_at?: string;
}

export const shareAPI = {
	/**
	 * Generate share link
	 */
	async generate(data: {
		project_id?: number;
		file_id?: number;
		ftp_path?: string;
		password?: string;
		expires_at?: string;
	}): Promise<{ token: string; url: string }> {
		return post('/share/generate', data);
	},

	/**
	 * Verify share link token
	 */
	async verifyToken(token: string, password?: string): Promise<{ valid: boolean; message?: string }> {
		return get(`/share/verify/${token}${password ? `?password=${encodeURIComponent(password)}` : ''}`);
	},

	/**
	 * Get public share data (for viewer page)
	 */
	async getPublicData(token: string): Promise<any> {
		return get(`/share/public/${token}`);
	},

	/**
	 * Get share link info
	 */
	async getInfo(token: string): Promise<ShareLink> {
		return get(`/share/${token}/info`);
	},

	/**
	 * Get all share links for a project
	 */
	async getByProject(projectId: number): Promise<ShareLink[]> {
		return get(`/share/project/${projectId}`);
	},

	/**
	 * Delete/revoke share link
	 */
	async delete(token: string): Promise<void> {
		return del(`/share/${token}`);
	},

	/**
	 * Get public viewer URL for token
	 */
	getViewerUrl(token: string): string {
		return `/viewer/${token}`;
	}
};
