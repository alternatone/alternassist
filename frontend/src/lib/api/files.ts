/**
 * Files API
 * Media file management and comments
 */

import { get, post, patch, del } from './client';

export interface MediaFile {
	id: number;
	project_id: number;
	filename: string;
	original_name: string;
	file_path: string;
	transcoded_file_path?: string;
	file_size: number;
	mime_type: string;
	duration?: number;
	folder: 'TO AA' | 'FROM AA';
	transcoding_status?: 'pending' | 'in-progress' | 'complete' | 'error';
	transcoding_error?: string;
	transcoding_attempts?: number;
	uploaded_at: string;
	updated_at?: string;
}

export interface Comment {
	id: number;
	file_id: number;
	reply_to_id?: number;
	author_name: string;
	timecode?: string;
	comment_text: string;
	status: 'open' | 'resolved';
	billable?: number;
	estimated_hours?: number;
	billed_in_invoice_id?: number;
	created_at: string;
	updated_at?: string;
}

export const filesAPI = {
	/**
	 * Get all files for current project (requires auth)
	 */
	async getAll(): Promise<MediaFile[]> {
		return get<MediaFile[]>('/files');
	},

	/**
	 * Get file by ID
	 */
	async getById(id: number): Promise<MediaFile> {
		return get<MediaFile>(`/files/${id}`);
	},

	/**
	 * Get files for a project
	 */
	async getByProject(projectId: number): Promise<MediaFile[]> {
		return get<MediaFile[]>(`/files/project/${projectId}`);
	},

	/**
	 * Get files in a specific folder
	 */
	async getByProjectFolder(projectId: number, folder: string): Promise<MediaFile[]> {
		return get<MediaFile[]>(`/files/project/${projectId}/folder/${folder}`);
	},

	/**
	 * Get file streaming URL
	 */
	getStreamUrl(id: number): string {
		return `/api/files/${id}/stream`;
	},

	/**
	 * Upload file (use FormData)
	 */
	async upload(formData: FormData): Promise<MediaFile> {
		const response = await fetch('/api/files', {
			method: 'POST',
			credentials: 'include',
			body: formData // Don't set Content-Type, browser will set it with boundary
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Upload failed' }));
			throw new Error(error.error || 'Upload failed');
		}

		return response.json();
	},

	/**
	 * Update file metadata
	 */
	async update(id: number, fileData: Partial<MediaFile>): Promise<MediaFile> {
		return patch<MediaFile>(`/files/${id}`, fileData);
	},

	/**
	 * Move file to different folder
	 */
	async moveToFolder(id: number, folder: string): Promise<MediaFile> {
		return patch<MediaFile>(`/files/${id}/folder`, { folder });
	},

	/**
	 * Set transcoded file path
	 */
	async setTranscodedPath(id: number, path: string): Promise<MediaFile> {
		return patch<MediaFile>(`/files/${id}/transcoded-path`, { transcoded_file_path: path });
	},

	/**
	 * Delete file
	 */
	async delete(id: number): Promise<void> {
		return del(`/files/${id}`);
	},

	/**
	 * Get comments for a file
	 */
	async getComments(fileId: number): Promise<Comment[]> {
		return get<Comment[]>(`/files/comments/${fileId}`);
	},

	/**
	 * Add comment to file
	 */
	async addComment(commentData: Partial<Comment>): Promise<Comment> {
		return post<Comment>(`/files/comment/${commentData.file_id}`, commentData);
	},

	/**
	 * Update comment
	 */
	async updateComment(commentId: number, commentData: Partial<Comment>): Promise<Comment> {
		return patch<Comment>(`/files/comment/${commentId}`, commentData);
	},

	/**
	 * Delete comment
	 */
	async deleteComment(commentId: number): Promise<void> {
		return del(`/files/comment/${commentId}`);
	},

	/**
	 * Get transcode status for all files
	 */
	async getTranscodeStatus(): Promise<any[]> {
		return get<any[]>('/files/transcode-status');
	}
};
