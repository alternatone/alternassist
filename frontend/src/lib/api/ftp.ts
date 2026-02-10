/**
 * FTP API
 * FTP file browser and operations (Admin only)
 */

import { get, post, del } from './client';

export interface FTPItem {
	name: string;
	path: string;
	type: 'file' | 'directory';
	size?: number;
	modified?: string;
}

export const ftpAPI = {
	/**
	 * Browse FTP directory
	 */
	async browse(path: string = '/'): Promise<FTPItem[]> {
		const encodedPath = encodeURIComponent(path);
		return get<FTPItem[]>(`/ftp/browse?path=${encodedPath}`);
	},

	/**
	 * Get project folder files
	 */
	async getProjectFiles(projectId: number): Promise<FTPItem[]> {
		return get<FTPItem[]>(`/ftp/project/${projectId}/files`);
	},

	/**
	 * Get FTP drive statistics
	 */
	async getStats(): Promise<{ used: number; available: number; total: number }> {
		return get('/ftp/stats');
	},

	/**
	 * Create folder
	 */
	async createFolder(path: string, folderName: string): Promise<void> {
		return post('/ftp/create-folder', { path, folder_name: folderName });
	},

	/**
	 * Rename file or folder
	 */
	async rename(oldPath: string, newName: string): Promise<void> {
		return post('/ftp/rename', { old_path: oldPath, new_name: newName });
	},

	/**
	 * Move file or folder
	 */
	async move(sourcePath: string, destPath: string): Promise<void> {
		return post('/ftp/move', { source_path: sourcePath, dest_path: destPath });
	},

	/**
	 * Delete file or folder
	 */
	async deletePath(path: string): Promise<void> {
		return post('/ftp/delete', { path });
	},

	/**
	 * Upload file to FTP (use FormData)
	 */
	async upload(formData: FormData): Promise<void> {
		const response = await fetch('/api/ftp/upload', {
			method: 'POST',
			credentials: 'include',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Upload failed' }));
			throw new Error(error.error || 'Upload failed');
		}

		return response.json();
	},

	/**
	 * Sync project folder structure
	 */
	async syncProject(projectId: number): Promise<void> {
		return post(`/ftp/project/${projectId}/sync`);
	}
};
