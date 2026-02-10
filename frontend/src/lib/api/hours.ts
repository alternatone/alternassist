/**
 * Hours Log API
 * Time tracking for project work
 */

import { get, post, patch, del } from './client';

export interface HoursEntry {
	id: number;
	project_id: number;
	date: string;
	hours: number;
	category: 'music' | 'dialogue' | 'sound-design' | 'mix' | 'revisions';
	description?: string;
	created_at?: string;
	updated_at?: string;
}

export interface HoursTotals {
	dialogue?: number;
	'sound-design'?: number;
	mix?: number;
	revisions?: number;
	total?: number;
}

export const hoursAPI = {
	/**
	 * Get all hours entries
	 */
	async getAll(): Promise<HoursEntry[]> {
		return get<HoursEntry[]>('/hours-log');
	},

	/**
	 * Get hours entries for a project
	 */
	async getByProject(projectId: number): Promise<HoursEntry[]> {
		return get<HoursEntry[]>(`/hours-log/project/${projectId}`);
	},

	/**
	 * Get hours totals for a project
	 */
	async getTotals(projectId: number): Promise<HoursTotals> {
		return get<HoursTotals>(`/hours-log/project/${projectId}/totals`);
	},

	/**
	 * Create hours entry
	 */
	async create(entryData: Partial<HoursEntry>): Promise<HoursEntry> {
		return post<HoursEntry>('/hours-log', entryData);
	},

	/**
	 * Update hours entry
	 */
	async update(id: number, entryData: Partial<HoursEntry>): Promise<HoursEntry> {
		return patch<HoursEntry>(`/hours-log/${id}`, entryData);
	},

	/**
	 * Delete hours entry
	 */
	async delete(id: number): Promise<void> {
		return del(`/hours-log/${id}`);
	},

	/**
	 * Upsert hour totals for a project (used by kanban hours logger)
	 */
	async upsertTotals(
		projectId: number,
		totals: { music?: number; dialogue?: number; soundDesign?: number; mix?: number; revisions?: number }
	): Promise<void> {
		return post(`/hours-log/project/${projectId}/upsert-totals`, totals);
	}
};
