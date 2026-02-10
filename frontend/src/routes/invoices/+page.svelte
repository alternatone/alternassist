<script lang="ts">
	import { invoicesAPI, paymentsAPI, projectsAPI } from '$lib/api';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const MUSIC_RATE = 150;
	const DAY_RATE = 500;

	// State
	let paymentSplit = $state('full');
	let currentProjectId = $state<number | null>(null);
	let hasBundleDiscount = $state(false);
	let lastCalculatedTotal = $state(0);
	let lastCalculatedFinalAmount = $state(0);
	let useEstimateTotal = $state(false);
	let estimateTotal = $state(0);
	let loggedInvoices = $state<any[]>([]);

	// Form fields
	let invoiceNumber = $state('');
	let invoiceDate = $state('');
	let projectName = $state('');
	let clientName = $state('');
	let category = $state('Music Composition');
	let musicMinutes = $state(0);
	let postDays = $state(0);

	// Display fields (derived)
	let displayInvoiceNumber = $derived(`Invoice #${invoiceNumber}`);
	let displayInvoiceDate = $derived(
		invoiceDate
			? new Date(invoiceDate).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	onMount(async () => {
		// Set default date
		invoiceDate = new Date().toISOString().split('T')[0];

		// Get next invoice number
		try {
			const { nextNumber } = await invoicesAPI.getNextNumber();
			invoiceNumber = nextNumber;
		} catch (e) {
			console.error('Failed to get invoice number:', e);
			invoiceNumber = '2523';
		}

		// Load estimate data if coming from localStorage
		await loadEstimateData();

		// Render logged invoices
		await renderLoggedInvoices();

		// Generate initial invoice
		generateInvoice();
	});

	async function loadEstimateData() {
		// Check for invoice data from projects first
		const invoicesRaw = localStorage.getItem('invoices');
		const invoices = JSON.parse(invoicesRaw || '[]');

		if (invoices.length > 0) {
			const latestInvoice = invoices[invoices.length - 1];
			await populateFromProject(latestInvoice);
			localStorage.removeItem('invoices');
			return;
		}

		// Fall back to estimate data
		const savedData = localStorage.getItem('current-invoice-data');
		if (savedData) {
			const estimateData = JSON.parse(savedData);
			populateFromEstimate(estimateData);
		}
	}

	async function populateFromProject(invoiceData: any) {
		currentProjectId = invoiceData.projectId || null;
		hasBundleDiscount =
			(invoiceData.estimateData && invoiceData.estimateData.bundleDiscount) || false;

		if (invoiceData.estimateData && invoiceData.estimateData.total) {
			useEstimateTotal = true;
			estimateTotal = invoiceData.estimateData.total;
		}

		invoiceDate = new Date().toISOString().split('T')[0];

		try {
			const { nextNumber } = await invoicesAPI.getNextNumber();
			invoiceNumber = nextNumber;
		} catch (err) {
			console.error('Error fetching next invoice number:', err);
			invoiceNumber = '2601';
		}

		projectName = invoiceData.projectName || '';
		clientName = invoiceData.clientName || '';

		const scopeData = invoiceData.scopeData || {};
		const loggedHours = invoiceData.loggedHours || {};

		// Extract music minutes
		const musicMatch = (scopeData.music || '').match(/([\d.]+)/);
		const mins = musicMatch ? parseFloat(musicMatch[1]) : 0;

		// Calculate post days from logged hours
		let dialogueHrs = parseFloat(loggedHours.dialogue) || 0;
		let soundDesignHrs = parseFloat(loggedHours.soundDesign) || 0;
		let mixHrs = parseFloat(loggedHours.mix) || 0;
		let revisionHrs = parseFloat(loggedHours.revisions) || 0;

		if (dialogueHrs === 0 && scopeData.dialogue) {
			const match = scopeData.dialogue.match(/([\d.]+)/);
			dialogueHrs = match ? parseFloat(match[1]) : 0;
		}
		if (soundDesignHrs === 0 && scopeData.soundDesign) {
			const match = scopeData.soundDesign.match(/([\d.]+)/);
			soundDesignHrs = match ? parseFloat(match[1]) : 0;
		}
		if (mixHrs === 0 && scopeData.mix) {
			const match = scopeData.mix.match(/([\d.]+)/);
			mixHrs = match ? parseFloat(match[1]) : 0;
		}
		if (revisionHrs === 0 && scopeData.revisions) {
			const match = scopeData.revisions.match(/([\d.]+)/);
			revisionHrs = match ? parseFloat(match[1]) : 0;
		}

		const totalPostHours = dialogueHrs + soundDesignHrs + mixHrs + revisionHrs;
		const days = totalPostHours / 8;

		musicMinutes = mins;
		postDays = days;

		// Set category
		const hasMusic = mins > 0;
		const hasPost = totalPostHours > 0;
		if (hasMusic && hasPost) {
			category = 'Music & Post-Production';
		} else if (hasMusic) {
			category = 'Music Composition';
		} else if (hasPost) {
			category = 'Post-Production Audio';
		}

		// Auto-set payment split
		const isProspects = invoiceData.projectColumn === 'prospects';
		const isApprovedBilled = invoiceData.projectColumn === 'approved-billed';

		if (isProspects) {
			paymentSplit = '50%';
		} else if (isApprovedBilled && currentProjectId) {
			try {
				const projectPayments = await paymentsAPI.getByProject(currentProjectId);
				const previousInvoice = projectPayments.find((p: any) => p.payment_type === 'deposit');

				if (previousInvoice) {
					const actualMusicMins = mins;
					const actualPostDays = days;
					musicMinutes = actualMusicMins;
					postDays = actualPostDays;
				}

				paymentSplit = 'full';
			} catch (error) {
				console.error('Error loading payments for project:', error);
			}
		}

		generateInvoice();
	}

	function populateFromEstimate(estimateData: any) {
		invoiceDate = new Date().toISOString().split('T')[0];

		projectName = estimateData.projectName || '';
		clientName = estimateData.clientName || '';

		const mins = estimateData.runtime * (estimateData.musicCoverage / 100);
		const totalPostHours =
			estimateData.dialogueHours +
			estimateData.soundDesignHours +
			estimateData.mixHours +
			estimateData.revisionHours;
		const days = Math.ceil(totalPostHours / 4) * 0.5;

		musicMinutes = Math.ceil(mins);
		postDays = days;

		const hasMusic = mins > 0;
		const hasPost = days > 0;

		if (hasMusic && hasPost) {
			category = 'Music & Post-Production';
		} else if (hasMusic) {
			category = 'Music Composition';
		} else if (hasPost) {
			category = 'Post-Production Audio';
		}

		generateInvoice();
	}

	function setPaymentSplit(type: string) {
		paymentSplit = type;
		generateInvoice();
	}

	function generateInvoice() {
		const musicCost = musicMinutes * MUSIC_RATE;
		const postCost = postDays * DAY_RATE;
		let total;

		if (useEstimateTotal && estimateTotal > 0) {
			total = estimateTotal;
		} else {
			total = musicCost + postCost;
			if (hasBundleDiscount && musicCost > 0 && postCost > 0) {
				total = total * 0.9;
			}
		}

		const finalAmount = paymentSplit === '50%' ? total * 0.5 : total;

		lastCalculatedTotal = total;
		lastCalculatedFinalAmount = finalAmount;
	}

	// Reactive generation
	$effect(() => {
		generateInvoice();
	});

	async function renderLoggedInvoices() {
		try {
			const invoices = await invoicesAPI.getWithProjects(50);
			loggedInvoices = invoices.reverse();
		} catch (error) {
			console.error('Error loading invoices:', error);
			loggedInvoices = [];
		}
	}

	async function loadLoggedInvoice(id: number) {
		try {
			const invoice = await invoicesAPI.getByIdWithProject(id);
			if (!invoice) return;

			const lineItems = invoice.line_items ? JSON.parse(invoice.line_items) : [];
			const mins =
				lineItems.find((item: any) => item.description.includes('Music'))?.amount / MUSIC_RATE || 0;
			const days =
				lineItems.find((item: any) => item.description.includes('Post'))?.amount / DAY_RATE || 0;

			invoiceNumber = invoice.invoice_number || '';
			invoiceDate = invoice.issue_date || new Date().toISOString().split('T')[0];
			projectName = invoice.project_name || '';
			clientName = invoice.client_name || '';
			musicMinutes = mins;
			postDays = days;

			paymentSplit = invoice.deposit_percentage === 50 ? '50%' : 'full';
			currentProjectId = invoice.project_id;

			const hasMusic = mins > 0;
			const hasPost = days > 0;
			if (hasMusic && hasPost) {
				category = 'Music & Post-Production';
			} else if (hasMusic) {
				category = 'Music Composition';
			} else if (hasPost) {
				category = 'Post-Production Audio';
			}

			generateInvoice();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (error) {
			console.error('Error loading invoice:', error);
			alert('Failed to load invoice.');
		}
	}

	async function deleteLoggedInvoice(event: Event, id: number, num: string) {
		event.stopPropagation();
		if (!confirm(`Delete invoice #${num}?`)) return;

		try {
			await invoicesAPI.delete(id);
			await renderLoggedInvoices();
		} catch (error) {
			console.error('Error deleting invoice:', error);
			alert('Failed to delete invoice.');
		}
	}

	async function logInvoice() {
		if (!invoiceNumber || !clientName || !invoiceDate) {
			alert('Please fill in invoice number, client name, and date');
			return;
		}

		try {
			const dueDate = new Date(invoiceDate);
			dueDate.setDate(dueDate.getDate() + 15);

			const invoiceData = {
				project_id: currentProjectId,
				invoice_number: invoiceNumber,
				amount: lastCalculatedFinalAmount,
				deposit_amount: paymentSplit === '50%' ? lastCalculatedFinalAmount : 0,
				deposit_percentage: paymentSplit === '50%' ? 50 : 0,
				final_amount: paymentSplit === 'final' ? lastCalculatedFinalAmount : lastCalculatedTotal,
				status: 'draft',
				due_date: dueDate.toISOString().split('T')[0],
				issue_date: invoiceDate,
				line_items: JSON.stringify([
					{ description: `Music Composition: ${musicMinutes} minutes`, amount: musicMinutes * MUSIC_RATE },
					{ description: `Post Audio: ${postDays} days`, amount: postDays * DAY_RATE }
				]) as any
			};

			await invoicesAPI.create(invoiceData);
			await renderLoggedInvoices();
			alert('Invoice logged successfully!');
		} catch (error) {
			console.error('Error logging invoice:', error);
			alert('Failed to log invoice. Please try again.');
		}
	}

	async function sendToPayments() {
		if (!invoiceNumber || !clientName || !invoiceDate) {
			alert('Please fill in invoice number, client name, and date');
			return;
		}

		try {
			const dueDate = new Date(invoiceDate);
			dueDate.setDate(dueDate.getDate() + 15);

			const invoiceData = {
				project_id: currentProjectId,
				invoice_number: invoiceNumber,
				amount: lastCalculatedFinalAmount,
				deposit_amount: paymentSplit === '50%' ? lastCalculatedFinalAmount : 0,
				deposit_percentage: paymentSplit === '50%' ? 50 : 0,
				final_amount: paymentSplit === 'final' ? lastCalculatedFinalAmount : lastCalculatedTotal,
				status: 'sent',
				due_date: dueDate.toISOString().split('T')[0],
				issue_date: invoiceDate,
				line_items: JSON.stringify([
					{ description: `Music Composition: ${musicMinutes} minutes`, amount: musicMinutes * MUSIC_RATE },
					{ description: `Post Audio: ${postDays} days`, amount: postDays * DAY_RATE }
				]) as any
			};

			await invoicesAPI.create(invoiceData);

			// Create payment record
			const paymentData = {
				invoice_id: 0, // Will be set by backend
				project_id: currentProjectId,
				amount: lastCalculatedFinalAmount,
				payment_date: null as any,
				payment_method: null as any,
				payment_type: paymentSplit === '50%' ? 'deposit' : 'final',
				notes: `Outstanding payment for invoice #${invoiceNumber}`
			};

			await paymentsAPI.create(paymentData);

			// Update project status if this is a 50% deposit
			if (currentProjectId && paymentSplit === '50%') {
				await projectsAPI.update(currentProjectId, {
					status: '50% deposit invoiced'
				});
			}

			await renderLoggedInvoices();
			alert('Invoice logged as outstanding payment! Navigating to Payments page.');

			// Navigate to payments page
			goto('/payments');

			// Clear form
			projectName = '';
			clientName = '';
			musicMinutes = 0;
			postDays = 0;
			category = 'Music Composition';
			paymentSplit = 'full';
			currentProjectId = null;

			invoiceDate = new Date().toISOString().split('T')[0];
			const { nextNumber } = await invoicesAPI.getNextNumber();
			invoiceNumber = nextNumber;

			generateInvoice();
		} catch (error) {
			console.error('Error sending to payments:', error);
			alert('Failed to send invoice to payments. Please try again.');
		}
	}
</script>

<div class="generator-container">
	<!-- Form Panel -->
	<div class="form-panel">
		<div class="header">
			<h1>Invoice Generator</h1>
		</div>

		<div class="form-section">
			<h3 class="section-title">Invoice Details</h3>
			<div class="form-grid">
				<div class="form-group">
					<label for="invoiceNumber">Invoice Number</label>
					<input type="text" id="invoiceNumber" bind:value={invoiceNumber} placeholder="2523" />
				</div>
				<div class="form-group">
					<label for="invoiceDate">Date</label>
					<input type="date" id="invoiceDate" bind:value={invoiceDate} />
				</div>
				<div class="form-group full-width">
					<label for="projectName">Project Name</label>
					<input type="text" id="projectName" bind:value={projectName} />
				</div>
				<div class="form-group full-width">
					<label for="clientName">Point of Contact Name</label>
					<input type="text" id="clientName" bind:value={clientName} />
				</div>
				<div class="form-group full-width">
					<label for="category">Category</label>
					<select id="category" bind:value={category}>
						<option value="Music Composition">Music Composition</option>
						<option value="Post-Production Audio">Post-Production Audio</option>
						<option value="Music & Post-Production">Music & Post-Production</option>
					</select>
				</div>
			</div>
		</div>

		<div class="form-section">
			<h3 class="section-title">Services</h3>
			<div class="form-grid">
				<div class="form-group">
					<label for="musicMinutes">Music (minutes)</label>
					<input
						type="number"
						id="musicMinutes"
						bind:value={musicMinutes}
						placeholder="0"
						min="0"
						step="1"
					/>
				</div>
				<div class="form-group">
					<label for="postDays">Post Audio (days)</label>
					<input type="number" id="postDays" bind:value={postDays} placeholder="0" min="0" step="0.5" />
				</div>
			</div>
		</div>

		<div class="form-section">
			<h3 class="section-title">Payment Terms</h3>
			<div class="payment-split">
				<div
					class="split-option"
					class:active={paymentSplit === 'full'}
					onclick={() => setPaymentSplit('full')}
				>
					<strong>full amount</strong>
				</div>
				<div
					class="split-option"
					class:active={paymentSplit === '50%'}
					onclick={() => setPaymentSplit('50%')}
				>
					<strong>50%</strong>
				</div>
			</div>
		</div>

		<div class="action-buttons">
			<button class="btn btn-primary" onclick={() => window.print()}>print invoice</button>
			<button class="btn btn-gradient" onclick={sendToPayments}>send to payments</button>
		</div>
	</div>

	<!-- Invoice Preview -->
	<div class="invoice-preview">
		<div class="invoice-container">
			<header class="invoice-header">
				<div class="brand-section">
					<h2>Alternatone</h2>
					<p>music & post production audio by Micah Garrido</p>
				</div>
				<div class="invoice-meta">
					<div class="invoice-number">{displayInvoiceNumber}</div>
					<div class="invoice-date">{displayInvoiceDate}</div>
				</div>
			</header>

			<div class="category-tag">{category}</div>

			<section class="client-section">
				<h3 class="section-title">Project</h3>
				<div class="client-info" style="margin-bottom: 1.5rem;">{projectName}</div>
				<h3 class="section-title">Prepared For</h3>
				<div class="client-info">{clientName}</div>
			</section>

			<table class="invoice-table">
				<thead>
					<tr>
						<th>Task</th>
						<th>Rate</th>
						<th>Total</th>
					</tr>
				</thead>
				<tbody>
					<tr class="task-row">
						<td>Music Composition ({musicMinutes} minutes)</td>
						<td>${MUSIC_RATE}/min</td>
						<td>${paymentSplit === '50%' ? musicMinutes * MUSIC_RATE * 0.5 : musicMinutes * MUSIC_RATE}</td>
					</tr>
					<tr class="task-row">
						<td>Post-Production Audio ({postDays} days)</td>
						<td>${DAY_RATE}/day</td>
						<td>${paymentSplit === '50%' ? postDays * DAY_RATE * 0.5 : postDays * DAY_RATE}</td>
					</tr>
					<tr class="total-row">
						<td colspan="2">{paymentSplit === '50%' ? 'Total Due (50%)' : 'Total Due'}</td>
						<td>${lastCalculatedFinalAmount}</td>
					</tr>
				</tbody>
			</table>

			<section class="payment-section">
				<h3 class="section-title">Payment Methods</h3>
				<div class="payment-methods">
					<div class="payment-method">
						<h4>Venmo</h4>
						<p>@micah-garrido</p>
					</div>
					<div class="payment-method">
						<h4>Zelle</h4>
						<p>
							micah@alternatone.com<br />(314) 517-0251
						</p>
					</div>
					<div class="payment-method">
						<h4>Bank Transfer</h4>
						<p>Banking information available upon request</p>
					</div>
					<div class="payment-method">
						<h4>Check</h4>
						<p>
							Payable to Micah Garrido<br />3034 E Del Mar Blvd<br />Pasadena, CA 91107
						</p>
					</div>
				</div>
			</section>
		</div>
	</div>

	<!-- Logged Invoices Section -->
	{#if loggedInvoices.length > 0}
		<div style="max-width: 1400px; margin: 3rem auto 0; padding: 0 2rem;">
			<h3
				style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent-blue); margin-bottom: 1rem;"
			>
				Logged Invoices
			</h3>
			<div>
				{#each loggedInvoices as invoice}
					{@const lineItems = invoice.line_items ? JSON.parse(invoice.line_items) : []}
					{@const mins =
						lineItems.find((item: any) => item.description.includes('Music'))?.amount / MUSIC_RATE || 0}
					{@const days =
						lineItems.find((item: any) => item.description.includes('Post'))?.amount / DAY_RATE || 0}
					{@const paymentType = invoice.deposit_percentage === 50 ? '50%' : 'Full'}
					<div
						class="logged-invoice-card"
						onclick={() => loadLoggedInvoice(invoice.id)}
						style="cursor: pointer;"
					>
						<div class="logged-invoice-header">
							<div>
								<div class="logged-invoice-title">
									Invoice #{invoice.invoice_number} - {invoice.project_name || 'Untitled'}
								</div>
								<div class="logged-invoice-date">
									{new Date(invoice.issue_date).toLocaleDateString()}
								</div>
							</div>
							<button
								class="logged-invoice-delete"
								onclick={(e) => deleteLoggedInvoice(e, invoice.id, invoice.invoice_number)}
								title="Delete"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
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
						<div class="logged-invoice-info">
							<div><strong>Client:</strong> {invoice.client_name || ''}</div>
							<div><strong>Music:</strong> {Math.round(mins)} mins</div>
							<div><strong>Post:</strong> {days.toFixed(1)} days</div>
							<div><strong>Split:</strong> {paymentType}</div>
							<div><strong>Amount:</strong> ${invoice.amount}</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.generator-container {
		max-width: 1400px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 3rem;
		padding: 2rem;
	}

	.form-panel {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		height: fit-content;
		width: 100%;
	}

	.invoice-preview {
		background: white;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-subtle);
		border: var(--border-light);
		overflow: hidden;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: var(--border-medium);
	}

	.header h1 {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.section-title {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--accent-blue);
		margin-bottom: 1rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	label {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--secondary-text);
		margin-bottom: 0.5rem;
	}

	input,
	select {
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
		transition: border-color 0.2s;
		width: 100%;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.payment-split {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.split-option {
		flex: 1;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
		background: white;
	}

	.split-option.active {
		background: var(--accent-teal);
		color: white;
		border-color: var(--accent-teal);
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
		margin-top: 2rem;
	}

	.btn {
		flex: 1;
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

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}

	.btn-primary:hover {
		background: #3a8bc7;
	}

	.btn-gradient {
		background: linear-gradient(135deg, #4a90e2 0%, #e74c3c 100%);
		color: white;
		box-shadow:
			0 4px 20px rgba(0, 0, 0, 0.05),
			0 0 0 1px rgba(74, 144, 226, 0.1);
		transition: all 0.2s;
	}

	.btn-gradient:hover {
		background: linear-gradient(135deg, #3a7bc8 0%, #d43f33 100%);
		transform: translateY(-1px);
		box-shadow:
			0 6px 24px rgba(0, 0, 0, 0.08),
			0 0 0 1px rgba(74, 144, 226, 0.2);
	}

	/* Logged invoice styles */
	.logged-invoice-card {
		background: white;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1rem;
		border: var(--border-medium);
	}

	.logged-invoice-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.logged-invoice-title {
		font-weight: 600;
		font-size: 1rem;
		color: var(--primary-text);
	}

	.logged-invoice-date {
		font-size: 0.85rem;
		color: var(--muted-text);
	}

	.logged-invoice-info {
		display: flex;
		justify-content: flex-end;
		gap: 1.5rem;
		font-size: 0.9rem;
		color: var(--secondary-text);
	}

	.logged-invoice-delete {
		background: none;
		border: none;
		color: var(--muted-text);
		cursor: pointer;
		transition: color 0.2s;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logged-invoice-delete:hover {
		color: var(--accent-red);
	}

	/* Invoice preview styles */
	.invoice-container {
		padding: 3rem;
		font-family: var(--font-body);
		min-height: 800px;
	}

	.invoice-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: var(--border-medium);
	}

	.brand-section h2 {
		font-family: var(--font-display);
		font-size: 2.2rem;
		font-weight: 600;
		color: var(--primary-text);
		letter-spacing: -0.02em;
		margin-bottom: 0.5rem;
	}

	.brand-section p {
		font-family: var(--font-body);
		color: var(--subtle-text);
		font-size: 0.95rem;
		font-weight: 300;
	}

	.invoice-meta {
		text-align: right;
	}

	.invoice-number {
		font-family: var(--font-mono);
		font-size: 1.8rem;
		font-weight: 600;
		background: linear-gradient(90deg, var(--accent-red) 0%, var(--accent-teal) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 0.5rem;
		letter-spacing: -0.01em;
	}

	.invoice-date {
		font-family: var(--font-body);
		color: var(--muted-text);
		font-size: 0.9rem;
	}

	.client-section {
		margin-bottom: 2.5rem;
	}

	.client-info {
		font-family: var(--font-body);
		font-size: 1.1rem;
		color: var(--secondary-text);
		line-height: 1.5;
	}

	.category-tag {
		display: inline-block;
		background: rgba(70, 159, 224, 0.1);
		color: var(--accent-teal);
		padding: 0.4rem 1rem;
		border-radius: 24px;
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 2rem;
		font-family: var(--font-body);
	}

	.invoice-table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 2rem;
		font-family: var(--font-body);
	}

	.invoice-table th {
		background: var(--bg-primary);
		padding: 1rem;
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--subtle-text);
		border-bottom: 3px solid;
		border-image: linear-gradient(90deg, var(--accent-red) 0%, var(--accent-teal) 100%) 1;
	}

	.invoice-table th:last-child,
	.invoice-table td:last-child {
		text-align: right;
	}

	.invoice-table td {
		padding: 1rem;
		border-bottom: var(--border-light);
		font-size: 0.95rem;
		color: var(--secondary-text);
	}

	.task-row td:first-child {
		font-weight: 500;
		color: var(--primary-text);
	}

	.total-row {
		background: var(--bg-primary);
		font-weight: 600;
	}

	.total-row td {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		color: var(--primary-text);
		border-bottom: none;
		padding: 1.2rem 1rem;
	}

	.payment-section {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: var(--border-medium);
	}

	.payment-methods {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	.payment-method h4 {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--accent-blue);
		margin-bottom: 0.5rem;
	}

	.payment-method p {
		font-family: var(--font-body);
		color: var(--secondary-text);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	@media print {
		* {
			visibility: hidden;
		}
		.invoice-container,
		.invoice-container * {
			visibility: visible;
		}
		.invoice-container {
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			padding: 0.4in 0.5in;
		}
		@page {
			margin: 0;
			size: letter;
		}
	}

	@media (max-width: 1024px) {
		.generator-container {
			grid-template-columns: 1fr;
		}
		.invoice-container {
			padding: 2rem;
		}
		.payment-methods {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
	}
</style>
