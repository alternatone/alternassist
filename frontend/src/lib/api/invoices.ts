/**
 * Invoices API
 * Invoice generation and management
 */

import { get, post, patch, del } from './client';

export interface Invoice {
	id: number;
	project_id: number;
	invoice_number: string;
	amount: number;
	deposit_amount?: number;
	deposit_percentage?: number;
	final_amount?: number;
	status?: 'draft' | 'sent' | 'paid';
	due_date?: string;
	issue_date?: string;
	line_items?: string; // JSON string
	created_at?: string;
	updated_at?: string;
}

export const invoicesAPI = {
	/**
	 * Get all invoices
	 */
	async getAll(): Promise<Invoice[]> {
		return get<Invoice[]>('/invoices');
	},

	/**
	 * Get invoices with project details
	 */
	async getWithProjects(limit?: number): Promise<any[]> {
		const url = limit ? `/invoices/with-projects?limit=${limit}` : '/invoices/with-projects';
		return get<any[]>(url);
	},

	/**
	 * Get invoices for a project
	 */
	async getByProject(projectId: number): Promise<Invoice[]> {
		return get<Invoice[]>(`/invoices/project/${projectId}`);
	},

	/**
	 * Get invoice by ID
	 */
	async getById(id: number): Promise<Invoice> {
		return get<Invoice>(`/invoices/${id}`);
	},

	/**
	 * Get invoice with project details
	 */
	async getByIdWithProject(id: number): Promise<any> {
		return get(`/invoices/${id}/with-project`);
	},

	/**
	 * Get next invoice number
	 */
	async getNextNumber(): Promise<{ nextNumber: string; currentMax: number }> {
		return get('/invoices/next-number');
	},

	/**
	 * Get invoice deliverables
	 */
	async getDeliverables(id: number): Promise<any[]> {
		return get(`/invoices/${id}/deliverables`);
	},

	/**
	 * Create invoice
	 */
	async create(invoiceData: Partial<Invoice>): Promise<Invoice> {
		return post<Invoice>('/invoices', invoiceData);
	},

	/**
	 * Update invoice
	 */
	async update(id: number, invoiceData: Partial<Invoice>): Promise<Invoice> {
		return patch<Invoice>(`/invoices/${id}`, invoiceData);
	},

	/**
	 * Update invoice status
	 */
	async updateStatus(id: number, status: string): Promise<Invoice> {
		return patch<Invoice>(`/invoices/${id}/status`, { status });
	},

	/**
	 * Delete invoice
	 */
	async delete(id: number): Promise<void> {
		return del(`/invoices/${id}`);
	},

	/**
	 * Add deliverable to invoice
	 */
	async addDeliverable(id: number, fileId: number, description?: string): Promise<void> {
		return post(`/invoices/${id}/deliverables`, { file_id: fileId, description });
	},

	/**
	 * Remove deliverable from invoice
	 */
	async removeDeliverable(id: number, fileId: number): Promise<void> {
		return del(`/invoices/${id}/deliverables/${fileId}`);
	}
};
