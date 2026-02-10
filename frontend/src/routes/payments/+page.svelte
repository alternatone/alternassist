<script lang="ts">
	import { invoicesAPI, paymentsAPI, projectsAPI } from '$lib/api';
	import { onMount } from 'svelte';

	let invoiceData = $state({
		invoices: [] as any[],
		payments: [] as any[],
		currentInvoiceId: null as number | null
	});

	// Stats
	const stats = $derived.by(() => {
		const now = new Date();
		const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

		let totalOutstanding = 0;
		let totalOverdue = 0;
		let outstandingCount = 0;
		let overdueCount = 0;

		const unpaidInvoices = invoiceData.invoices.filter((inv) => inv.status !== 'paid');

		unpaidInvoices.forEach((invoice) => {
			const dueDate = new Date(invoice.dueDate);
			const isOverdue = now > dueDate;

			totalOutstanding += invoice.amount;
			outstandingCount++;

			if (isOverdue) {
				totalOverdue += invoice.amount;
				overdueCount++;
			}
		});

		const thisMonthPayments = invoiceData.payments.filter((p) => new Date(p.date) >= thisMonth);
		const paidThisMonth = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);
		const totalRevenue = invoiceData.payments.reduce((sum, p) => sum + p.amount, 0);

		return {
			totalOutstanding,
			outstandingCount,
			totalOverdue,
			overdueCount,
			paidThisMonth,
			paidThisMonthCount: thisMonthPayments.length,
			totalRevenue
		};
	});

	const unpaidInvoices = $derived(invoiceData.invoices.filter((inv) => inv.status !== 'paid'));
	const recentPayments = $derived(invoiceData.payments.slice(-10).reverse());

	// Modal state
	let showModal = $state(false);
	let paidAmount = $state(0);
	let paidDate = $state(new Date().toISOString().split('T')[0]);
	let paymentMethod = $state('Venmo');

	onMount(async () => {
		await loadPaymentData();
	});

	async function loadPaymentData() {
		try {
			const [allInvoices, projects, allPayments] = await Promise.all([
				invoicesAPI.getAll(),
				projectsAPI.getAll(),
				paymentsAPI.getAll()
			]);

			// Build project map
			const projectMap: Record<number, any> = {};
			projects.forEach((p) => {
				projectMap[p.id] = { name: p.name, client: p.client_name || '' };
			});

			// Map invoices
			invoiceData.invoices = allInvoices.map((inv) => ({
				id: inv.id,
				invoiceNumber: inv.invoice_number,
				projectName: projectMap[inv.project_id]?.name || 'Unknown',
				clientName: projectMap[inv.project_id]?.client || '',
				amount: inv.amount,
				dueDate: inv.due_date,
				status: inv.status === 'paid' ? 'paid' : 'sent',
				invoiceDate: inv.issue_date,
				projectId: inv.project_id
			}));

			// Map payments
			invoiceData.payments = allPayments
				.filter((p) => p.payment_date !== null)
				.map((p) => ({
					id: p.id,
					invoiceId: p.invoice_id,
					projectName: projectMap[p.project_id]?.name || 'Unknown',
					amount: p.amount,
					date: p.payment_date,
					method: p.payment_method || 'Unknown',
					notes: p.notes || ''
				}));
		} catch (error) {
			console.error('Error loading payment data:', error);
		}
	}

	function getInvoiceStatus(invoice: any) {
		if (invoice.status === 'paid') return 'paid';

		const now = new Date();
		const dueDate = new Date(invoice.dueDate);
		const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

		if (daysOverdue <= 0) return 'sent';
		if (daysOverdue <= 15) return 'overdue';
		return 'very-overdue';
	}

	function getDaysOverdue(invoice: any) {
		if (invoice.status === 'paid') return 0;

		const now = new Date();
		const dueDate = new Date(invoice.dueDate);
		return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
	}

	function showPaidModal(invoiceId: number) {
		invoiceData.currentInvoiceId = invoiceId;
		const invoice = invoiceData.invoices.find((inv) => inv.id === invoiceId);
		if (invoice) {
			paidAmount = invoice.amount;
			paidDate = new Date().toISOString().split('T')[0];
			showModal = true;
		}
	}

	function hidePaidModal() {
		showModal = false;
		invoiceData.currentInvoiceId = null;
	}

	async function markAsPaid() {
		if (!invoiceData.currentInvoiceId) return;

		if (!paidAmount || !paidDate) {
			alert('Please fill in payment amount and date');
			return;
		}

		try {
			const invoice = invoiceData.invoices.find((inv) => inv.id === invoiceData.currentInvoiceId);
			if (!invoice) return;

			// Optimistic UI update
			invoice.status = 'paid';

			// Single transactional API call
			const result = await paymentsAPI.markInvoicePaid({
				invoice_id: invoiceData.currentInvoiceId,
				project_id: invoice.projectId,
				amount: paidAmount,
				payment_date: paidDate,
				payment_method: paymentMethod,
				payment_type: 'final',
				notes: 'Payment received'
			});

			// Add payment to local data
			invoiceData.payments.push({
				id: result.payment.id,
				invoiceId: invoiceData.currentInvoiceId,
				projectName: invoice.projectName,
				amount: paidAmount,
				date: paidDate,
				method: paymentMethod,
				notes: 'Payment received'
			});

			hidePaidModal();
		} catch (error) {
			console.error('Error marking invoice as paid:', error);
			alert('Failed to mark invoice as paid. Please try again.');
			// Revert optimistic update on error
			await loadPaymentData();
		}
	}

	function logFollowUp(invoiceId: number) {
		const message = prompt('Enter follow-up note:');
		if (message) {
			const invoice = invoiceData.invoices.find((inv) => inv.id === invoiceId);
			if (invoice) {
				if (!invoice.followUps) invoice.followUps = [];
				invoice.followUps.push({
					date: new Date().toISOString(),
					message
				});
				// Note: Follow-ups should be stored in the database
				// TODO: Implement follow-up API endpoint
				alert('Follow-up logged (note: follow-ups are not yet saved to database)');
			}
		}
	}

	async function deleteInvoice(invoiceId: number) {
		if (confirm('Are you sure you want to delete this invoice?')) {
			try {
				await invoicesAPI.delete(invoiceId);
				await loadPaymentData();
			} catch (error) {
				console.error('Error deleting invoice:', error);
				alert('Failed to delete invoice. Please try again.');
			}
		}
	}
</script>

<div class="dashboard-container">
	<div class="header">
		<h1>Payment Tracking</h1>
		<p>Track outstanding invoices and payment history</p>
	</div>
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-label">Outstanding</div>
			<div class="stat-value red">${stats.totalOutstanding.toFixed(0)}</div>
			<div class="stat-subtitle">{stats.outstandingCount} invoices</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Overdue</div>
			<div class="stat-value orange">${stats.totalOverdue.toFixed(0)}</div>
			<div class="stat-subtitle">{stats.overdueCount} invoices</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Paid This Month</div>
			<div class="stat-value green">${stats.paidThisMonth.toFixed(0)}</div>
			<div class="stat-subtitle">{stats.paidThisMonthCount} payments</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Total Revenue</div>
			<div class="stat-value blue">${stats.totalRevenue.toFixed(0)}</div>
			<div class="stat-subtitle">All time</div>
		</div>
	</div>

	<div class="section">
		<div class="section-header">
			<h2 class="section-title">Outstanding Invoices</h2>
		</div>
		{#if unpaidInvoices.length === 0}
			<div class="empty-state">
				<h3>No outstanding invoices</h3>
				<p>Add an invoice to start tracking payments</p>
			</div>
		{:else}
			<table class="invoice-table">
				<thead>
					<tr>
						<th>Invoice #</th>
						<th>Project</th>
						<th>Amount</th>
						<th>Due Date</th>
						<th>Status</th>
						<th>Days Overdue</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each unpaidInvoices as invoice}
						{@const status = getInvoiceStatus(invoice)}
						{@const daysOverdue = getDaysOverdue(invoice)}
						{@const overdueClass = daysOverdue > 15 ? 'danger' : daysOverdue > 0 ? 'warning' : ''}
						<tr>
							<td>#{invoice.invoiceNumber || invoice.number}</td>
							<td>{invoice.projectName || invoice.clientName}</td>
							<td>${invoice.amount.toFixed(0)}</td>
							<td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
							<td>
								<span class="status-badge status-{status}">{status.replace('-', ' ')}</span>
							</td>
							<td>
								<span class="days-overdue {overdueClass}">
									{daysOverdue > 0 ? `${daysOverdue} days` : '-'}
								</span>
							</td>
							<td>
								<div class="action-buttons">
									<button class="btn btn-success action-btn" onclick={() => showPaidModal(invoice.id)}>
										mark paid
									</button>
									<button class="btn btn-secondary action-btn" onclick={() => logFollowUp(invoice.id)}>
										log follow-up
									</button>
									<button class="delete-btn" onclick={() => deleteInvoice(invoice.id)} title="Delete">
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6"></polyline>
											<path
												d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
											></path>
											<line x1="10" y1="11" x2="10" y2="17"></line>
											<line x1="14" y1="11" x2="14" y2="17"></line>
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<div class="section">
		<div class="section-header">
			<h2 class="section-title">Recent Payments</h2>
		</div>
		{#if recentPayments.length === 0}
			<div class="empty-state">
				<h3>No payments recorded</h3>
				<p>Mark invoices as paid to see payment history</p>
			</div>
		{:else}
			<table class="invoice-table">
				<thead>
					<tr>
						<th>Date</th>
						<th>Invoice #</th>
						<th>Project</th>
						<th>Amount</th>
						<th>Method</th>
					</tr>
				</thead>
				<tbody>
					{#each recentPayments as payment}
						{@const invoice = invoiceData.invoices.find((inv) => inv.id === payment.invoiceId)}
						<tr>
							<td>{new Date(payment.date).toLocaleDateString()}</td>
							<td>#{invoice ? invoice.invoiceNumber || invoice.number : 'N/A'}</td>
							<td>{invoice ? invoice.projectName || invoice.clientName : 'N/A'}</td>
							<td>${payment.amount.toFixed(0)}</td>
							<td>{payment.method}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<!-- Mark Paid Modal -->
{#if showModal}
	<div class="modal active">
		<div class="modal-content">
			<div class="modal-header">
				<h3 class="modal-title">mark as paid</h3>
			</div>
			<div class="form-group">
				<label for="paidAmount">Amount Paid</label>
				<input type="number" id="paidAmount" bind:value={paidAmount} placeholder="0" min="0" step="0.01" />
			</div>
			<div class="form-group">
				<label for="paidDate">Payment Date</label>
				<input type="date" id="paidDate" bind:value={paidDate} />
			</div>
			<div class="form-group">
				<label for="paymentMethod">Payment Method</label>
				<select id="paymentMethod" bind:value={paymentMethod}>
					<option value="Venmo">Venmo</option>
					<option value="Zelle">Zelle</option>
					<option value="Bank Transfer">Bank Transfer</option>
					<option value="Check">Check</option>
					<option value="Other">Other</option>
				</select>
			</div>
			<div class="form-actions">
				<button class="btn btn-secondary" onclick={hidePaidModal}>cancel</button>
				<button class="btn btn-success" onclick={markAsPaid}>mark paid</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow: auto !important;
	}

	.dashboard-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.header h1 {
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
	}

	.header p {
		color: var(--subtle-text);
		font-size: 1.1rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.stat-card {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
	}

	.stat-label {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted-text);
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 600;
		font-family: var(--font-display);
		margin-bottom: 0.25rem;
	}

	.stat-value.green {
		color: var(--accent-green);
	}
	.stat-value.red {
		color: var(--accent-red);
	}
	.stat-value.orange {
		color: var(--accent-gold);
	}
	.stat-value.blue {
		color: var(--accent-teal);
	}

	.stat-subtitle {
		font-size: 0.9rem;
		color: var(--subtle-text);
	}

	.section {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		margin-bottom: 2rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		font-family: var(--font-body);
	}

	.btn-secondary {
		background: var(--subtle-text);
		color: white;
	}
	.btn-secondary:hover {
		background: var(--secondary-text);
	}

	.btn-success {
		background: var(--accent-green);
		color: white;
	}
	.btn-success:hover {
		background: #47c760;
	}

	.invoice-table {
		width: 100%;
		border-collapse: collapse;
	}

	.invoice-table th {
		background: var(--bg-primary);
		padding: 1rem;
		text-align: left;
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--subtle-text);
		border-bottom: 2px solid var(--border-medium);
	}

	.invoice-table td {
		padding: 1rem;
		border-bottom: var(--border-light);
		font-size: 0.95rem;
		color: var(--secondary-text);
	}

	.invoice-table th:last-child,
	.invoice-table td:last-child {
		text-align: right;
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.status-sent {
		background: rgba(70, 159, 224, 0.1);
		color: var(--accent-teal);
	}
	.status-overdue {
		background: rgba(232, 164, 93, 0.1);
		color: var(--accent-gold);
	}
	.status-very-overdue {
		background: rgba(217, 100, 89, 0.1);
		color: var(--accent-red);
	}
	.status-paid {
		background: rgba(91, 140, 110, 0.1);
		color: var(--accent-green);
	}

	.days-overdue {
		font-weight: 600;
	}
	.days-overdue.warning {
		color: var(--accent-gold);
	}
	.days-overdue.danger {
		color: var(--accent-red);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.action-btn {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		border-radius: 4px;
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--muted-text);
		cursor: pointer;
		transition: color 0.2s;
		padding: 0.5rem;
	}
	.delete-btn:hover {
		color: var(--accent-red);
	}

	.modal {
		display: flex;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		align-items: center;
		justify-content: center;
	}

	.modal-content {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		max-width: 500px;
		width: 90%;
	}

	.modal-header {
		margin-bottom: 1.5rem;
	}

	.modal-title {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.form-group {
		margin-bottom: 1rem;
	}

	label {
		display: block;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--secondary-text);
		margin-bottom: 0.5rem;
	}

	input,
	select {
		width: 100%;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: var(--muted-text);
	}
	.empty-state h3 {
		margin-bottom: 0.5rem;
		color: var(--subtle-text);
	}

	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}
		.section-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}
		.action-buttons {
			flex-direction: column;
		}
		.invoice-table {
			font-size: 0.85rem;
		}
		.invoice-table th,
		.invoice-table td {
			padding: 0.75rem 0.5rem;
		}
	}
</style>
