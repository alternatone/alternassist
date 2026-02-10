/**
 * Projects API
 * All project-related API calls
 */

import { get, post, patch, del } from './client';

export interface Project {
	id: number;
	name: string;
	client_name?: string;
	contact_email?: string;
	status?: string;
	status_text?: string;
	notes?: string;
	pinned?: number;
	archived?: number;
	created_at?: string;
	updated_at?: string;
	// Fields from /projects/with-scope endpoint
	music_coverage?: number;
	music_minutes?: number;
	dialogue_hours?: number;
	sound_design_hours?: number;
	mix_hours?: number;
	revision_hours?: number;
	// Additional fields from aggregation endpoints
	file_count?: number;
	total_size?: number;
}

export const projectsAPI = {
	/**
	 * Get all projects
	 */
	async getAll(): Promise<Project[]> {
		return get<Project[]>('/projects');
	},

	/**
	 * Get project by ID
	 */
	async getById(id: number): Promise<Project> {
		return get<Project>(`/projects/${id}`);
	},

	/**
	 * Get projects with music coverage (for cue tracker)
	 */
	async getWithMusic(): Promise<Project[]> {
		return get<Project[]>('/projects/with-music');
	},

	/**
	 * Get projects with scope data (for Kanban)
	 */
	async getWithScope(): Promise<Project[]> {
		return get<Project[]>('/projects/with-scope');
	},

	/**
	 * Get aggregated Kanban data for a project
	 */
	async getKanbanData(id: number): Promise<any> {
		return get(`/projects/${id}/kanban-data`);
	},

	/**
	 * Create new project
	 */
	async create(projectData: Partial<Project>): Promise<Project> {
		return post<Project>('/projects', projectData);
	},

	/**
	 * Create project with estimate and scope (from estimates calculator)
	 */
	async createWithEstimate(data: {
		project: any;
		scope: any;
		estimate: any;
	}): Promise<any> {
		return post('/projects/with-estimate', data);
	},

	/**
	 * Update project
	 */
	async update(id: number, projectData: Partial<Project>): Promise<Project> {
		return patch<Project>(`/projects/${id}`, projectData);
	},

	/**
	 * Delete project
	 */
	async delete(id: number): Promise<void> {
		return del(`/projects/${id}`);
	},

	/**
	 * Archive project
	 */
	async archive(id: number): Promise<void> {
		return post(`/projects/${id}/archive`);
	},

	/**
	 * Unarchive project
	 */
	async unarchive(id: number): Promise<void> {
		return post(`/projects/${id}/unarchive`);
	},

	/**
	 * Update project password
	 */
	async updatePassword(id: number, password: string): Promise<void> {
		return patch(`/projects/${id}/update-password`, { password });
	},

	/**
	 * Sync folder structure from FTP
	 */
	async syncFolder(id: number): Promise<void> {
		return post(`/projects/${id}/folder-sync`);
	}
};
