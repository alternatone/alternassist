/**
 * Estimates API
 * Project cost estimation and budgeting
 */

import { get, post, del } from './client';

export interface Estimate {
	id: number;
	project_id: number;
	runtime?: number;
	music_minutes?: number;
	dialogue_hours?: number;
	sound_design_hours?: number;
	mix_hours?: number;
	revision_hours?: number;
	post_days?: number;
	bundle_discount?: number;
	music_cost?: number;
	post_cost?: number;
	discount_amount?: number;
	total_cost?: number;
	created_at?: string;
}

export const estimatesAPI = {
	/**
	 * Get all estimates
	 */
	async getAll(): Promise<Estimate[]> {
		return get<Estimate[]>('/estimates');
	},

	/**
	 * Get estimates with project details
	 */
	async getWithProjects(limit?: number): Promise<any[]> {
		const url = limit ? `/estimates/with-projects?limit=${limit}` : '/estimates/with-projects';
		return get<any[]>(url);
	},

	/**
	 * Get estimates for a project
	 */
	async getByProject(projectId: number): Promise<Estimate[]> {
		return get<Estimate[]>(`/estimates/project/${projectId}`);
	},

	/**
	 * Get estimate by ID
	 */
	async getById(id: number): Promise<Estimate> {
		return get<Estimate>(`/estimates/${id}`);
	},

	/**
	 * Get estimate with project details
	 */
	async getByIdWithProject(id: number): Promise<any> {
		return get(`/estimates/${id}/with-project`);
	},

	/**
	 * Create estimate
	 */
	async create(estimateData: Partial<Estimate>): Promise<Estimate> {
		return post<Estimate>('/estimates', estimateData);
	},

	/**
	 * Delete estimate
	 */
	async delete(id: number): Promise<void> {
		return del(`/estimates/${id}`);
	}
};
