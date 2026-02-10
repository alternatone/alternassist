/**
 * Accounting API
 * Financial transaction tracking and ledger management
 */

import { get, post, del } from './client';

export interface AccountingRecord {
	id: number;
	project_id?: number;
	transaction_type: string;
	category: string;
	amount: number;
	transaction_date: string;
	description?: string;
	created_at?: string;
}

export const accountingAPI = {
	/**
	 * Get all accounting records
	 */
	async getAll(): Promise<AccountingRecord[]> {
		return get<AccountingRecord[]>('/accounting');
	},

	/**
	 * Get accounting records for a project
	 */
	async getByProject(projectId: number): Promise<AccountingRecord[]> {
		return get<AccountingRecord[]>(`/accounting/project/${projectId}`);
	},

	/**
	 * Create accounting record
	 */
	async create(recordData: Partial<AccountingRecord>): Promise<AccountingRecord> {
		return post<AccountingRecord>('/accounting', recordData);
	},

	/**
	 * Delete accounting record
	 */
	async delete(id: number): Promise<void> {
		return del(`/accounting/${id}`);
	}
};
