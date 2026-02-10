/**
 * Downloads API
 * Download token generation and management
 */

import { get, post, del } from './client';

export interface DownloadToken {
	token: string;
	file_id?: number;
	ftp_path?: string;
	expires_at?: string;
	download_count?: number;
	created_at?: string;
}

export const downloadsAPI = {
	/**
	 * Generate download token
	 */
	async generateToken(data: {
		file_id?: number;
		ftp_path?: string;
		expiry?: string;
	}): Promise<{ token: string; url: string }> {
		return post('/downloads/generate', data);
	},

	/**
	 * Get file info from token (without downloading)
	 */
	async getTokenInfo(token: string): Promise<any> {
		return get(`/downloads/${token}/info`);
	},

	/**
	 * Get download URL for token
	 */
	getDownloadUrl(token: string): string {
		return `/api/downloads/${token}`;
	},

	/**
	 * Revoke download token
	 */
	async revokeToken(token: string): Promise<void> {
		return del(`/downloads/${token}`);
	}
};
