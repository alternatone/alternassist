/**
 * Cues API
 * Music cue tracking and status management
 */

import { get, post, patch, del } from './client';

export interface Cue {
	id: number;
	project_id: number;
	cue_number: string;
	title?: string;
	status?: 'to-write' | 'written' | 'revisions' | 'approved' | 'complete';
	duration?: number;
	notes?: string;
	start_time?: string;
	end_time?: string;
	theme?: string;
	version?: number;
	created_at?: string;
	updated_at?: string;
}

export interface CueStats {
	'to-write': number;
	written: number;
	revisions: number;
	approved: number;
	complete?: number;
	total_duration?: number;
}

export const cuesAPI = {
	/**
	 * Get all cues
	 */
	async getAll(): Promise<Cue[]> {
		return get<Cue[]>('/cues');
	},

	/**
	 * Get cues for a project
	 */
	async getByProject(projectId: number): Promise<Cue[]> {
		return get<Cue[]>(`/cues/project/${projectId}`);
	},

	/**
	 * Get cue statistics for a project
	 */
	async getStats(projectId: number): Promise<CueStats> {
		return get<CueStats>(`/cues/project/${projectId}/stats`);
	},

	/**
	 * Create cue
	 */
	async create(cueData: Partial<Cue>): Promise<Cue> {
		return post<Cue>('/cues', cueData);
	},

	/**
	 * Update cue
	 */
	async update(id: number, cueData: Partial<Cue>): Promise<Cue> {
		return patch<Cue>(`/cues/${id}`, cueData);
	},

	/**
	 * Delete cue
	 */
	async delete(id: number): Promise<void> {
		return del(`/cues/${id}`);
	},

	/**
	 * Delete all cues for a project
	 */
	async deleteByProject(projectId: number): Promise<void> {
		return del(`/cues/project/${projectId}`);
	}
};
