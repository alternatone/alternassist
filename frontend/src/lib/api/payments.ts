/**
 * Payments API
 * Payment tracking and invoice payment management
 */

import { get, post, patch, del } from './client';

export interface Payment {
	id: number;
	invoice_id: number;
	project_id: number;
	amount: number;
	payment_date: string;
	payment_method?: string;
	payment_type?: 'deposit' | 'balance' | 'full';
	notes?: string;
	created_at?: string;
}

export const paymentsAPI = {
	/**
	 * Get all payments
	 */
	async getAll(): Promise<Payment[]> {
		return get<Payment[]>('/payments');
	},

	/**
	 * Get payments with project details
	 */
	async getWithProjects(): Promise<any[]> {
		return get<any[]>('/payments/with-projects');
	},

	/**
	 * Get payments for a project
	 */
	async getByProject(projectId: number): Promise<Payment[]> {
		return get<Payment[]>(`/payments/project/${projectId}`);
	},

	/**
	 * Get payments for an invoice
	 */
	async getByInvoice(invoiceId: number): Promise<Payment[]> {
		return get<Payment[]>(`/payments/invoice/${invoiceId}`);
	},

	/**
	 * Create payment
	 */
	async create(paymentData: Partial<Payment>): Promise<Payment> {
		return post<Payment>('/payments', paymentData);
	},

	/**
	 * Update payment
	 */
	async update(id: number, paymentData: Partial<Payment>): Promise<Payment> {
		return patch<Payment>(`/payments/${id}`, paymentData);
	},

	/**
	 * Delete payment
	 */
	async delete(id: number): Promise<void> {
		return del(`/payments/${id}`);
	},

	/**
	 * Mark invoice as paid (atomic operation: create payment + update invoice)
	 * Backend expects { invoice_id, payment: { ... } } nested structure
	 */
	async markInvoicePaid(paymentData: {
		invoice_id: number;
		project_id: number;
		amount: number;
		payment_date: string;
		payment_method: string;
		payment_type: string;
		notes?: string;
	}): Promise<any> {
		const { invoice_id, ...payment } = paymentData;
		return post<any>('/payments/mark-invoice-paid', {
			invoice_id,
			payment
		});
	}
};
