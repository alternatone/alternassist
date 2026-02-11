/**
 * FTP API
 * FTP file browser and operations (Admin only)
 */

import { get, post } from './client';

export interface FTPItem {
	name: string;
	path?: string;
	type?: 'file' | 'directory';
	isDirectory?: boolean;
	isMedia?: boolean;
	size?: number;
	totalSize?: number;
	itemCount?: number;
	modified?: string;
	mimeType?: string;
	projectName?: string;
}

export interface FTPBrowseResult {
	type: 'directory';
	path: string;
	items: FTPItem[];
	projectMap: Record<string, any>;
}

export const ftpAPI = {
	/**
	 * Browse FTP directory — returns {items, projectMap}
	 */
	async browse(path: string = ''): Promise<FTPBrowseResult> {
		const encodedPath = encodeURIComponent(path);
		return get<FTPBrowseResult>(`/ftp/browse?path=${encodedPath}`);
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
	 * Delete file or folder — uses DELETE with query param
	 */
	async deletePath(path: string): Promise<void> {
		const response = await fetch(`/api/ftp/delete?path=${encodeURIComponent(path)}`, {
			method: 'DELETE',
			credentials: 'include'
		});
		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Delete failed' }));
			throw new Error(error.error || 'Delete failed');
		}
	},

	/**
	 * Upload file to FTP (use FormData with XHR for progress)
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
	},

	/**
	 * Backup FTP drive
	 */
	async backup(): Promise<{ success: boolean; message: string; output?: string }> {
		return post('/ftp/backup');
	},

	/**
	 * Get download URL for an FTP file
	 */
	getDownloadUrl(path: string): string {
		return `/api/ftp/download?path=${encodeURIComponent(path)}`;
	},

	/**
	 * Get stream URL for an FTP file
	 */
	getStreamUrl(path: string): string {
		return `/api/ftp/stream?path=${encodeURIComponent(path)}`;
	}
};
