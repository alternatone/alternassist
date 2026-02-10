<script lang="ts">
	import { onMount } from 'svelte';
	import { projectsAPI, estimatesAPI } from '$lib/api';

	// Constants
	const DAY_RATE = 500;
	const MUSIC_RATE = 150;
	const HOURS_PER_DAY = 8;
	const TAX_RATE = 0.30;

	// Form state
	let projectName = $state('');
	let clientName = $state('');
	let clientEmail = $state('');
	let runtime = $state(0);
	let musicCoverage = $state(80);
	let dialogueHours = $state(0);
	let soundDesignHours = $state(0);
	let mixHours = $state(0);
	let revisionHours = $state(4);
	let bundleDiscount = $state(false);

	// Logged estimates state
	let loggedEstimates = $state<any[]>([]);
	let fileInput: HTMLInputElement;

	// Editable breakdown fields
	let editableTotal = $state(0);
	let editableTimeline = $state(0);
	let emailText = $state('');

	// Helper functions
	function roundToHalfDay(hours: number): number {
		return Math.ceil(hours / (HOURS_PER_DAY / 2)) * 0.5;
	}

	// Reactive calculations
	const musicMinutes = $derived(runtime * (musicCoverage / 100));
	const musicCost = $derived(musicMinutes * MUSIC_RATE);
	const totalPostHours = $derived(dialogueHours + soundDesignHours + mixHours + revisionHours);
	const postDays = $derived(roundToHalfDay(totalPostHours));
	const postCost = $derived(postDays * DAY_RATE);

	const subtotal = $derived(musicCost + postCost);
	const discountAmount = $derived(
		bundleDiscount && musicCost > 0 && postCost > 0 ? subtotal * 0.1 : 0
	);
	const calculatedTotal = $derived(subtotal - discountAmount);

	const musicDays = $derived(musicMinutes > 0 ? Math.ceil(musicMinutes / 2) : 0);
	const calculatedTimeline = $derived(musicDays + postDays);

	const taxes = $derived(editableTotal * TAX_RATE);
	const netAmount = $derived(editableTotal - taxes);

	// Auto-resize for editable inputs
	const totalInputWidth = $derived(Math.max(70, String(editableTotal).length * 12 + 30) + 'px');
	const timelineInputWidth = $derived(Math.max(70, String(editableTimeline).length * 12 + 30) + 'px');

	// Auto-check bundle discount if both music and post have values
	$effect(() => {
		if (musicCost > 0 && postCost > 0) {
			bundleDiscount = true;
		} else {
			bundleDiscount = false;
		}
	});

	// Sync editable fields with calculated values and update email text
	$effect(() => {
		editableTotal = Math.round(calculatedTotal);
		editableTimeline = calculatedTimeline;

		// Generate email copy
		const firstName = clientName.split(' ')[0] || 'Client';
		const timeline = editableTimeline;

		let text = `Hi ${firstName},\n\nMy estimate for this project is $${Math.round(editableTotal)}.`;

		if (timeline > 0) {
			text += ` My estimated timeline is ${timeline} ${timeline === 1 ? 'day' : 'days'}.`;
		}

		text += `\n\n`;

		if (musicMinutes > 0 && totalPostHours > 0) {
			text += `This amount includes all music and post-production audio work including dialogue editing, sound design, mixing, and three rounds of revisions.`;
		} else if (musicMinutes > 0) {
			text += `This amount includes ${Math.ceil(musicMinutes)} minutes of original music composition.`;
		} else if (totalPostHours > 0) {
			text += `This amount includes all post-production audio work including dialogue editing, sound design, mixing, and three rounds of revisions.`;
		}

		text += `\n\nPayment terms: Net 15. Additional revisions beyond the estimated scope will be billed starting at my half day rate.\n\nLet me know if you have any questions!\n\nThanks,\nMicah`;

		emailText = text;
	});

	// Send to projects
	async function sendToProjects() {
		if (!projectName || !clientName) {
			alert('Please enter project name and client contact to add to projects');
			return;
		}

		try {
			const estimatedTaxes = editableTotal * 0.30;
			const netAfterTaxes = editableTotal - estimatedTaxes;

			await projectsAPI.createWithEstimate({
				project: {
					name: projectName,
					client_name: clientName,
					contact_email: clientEmail,
					status: 'prospects',
					notes: '',
					pinned: 0,
					password: 'default',
					trt: `${runtime} min`,
					music_coverage: Math.round(musicMinutes),
					timeline_start: null,
					timeline_end: null,
					estimated_total: editableTotal,
					estimated_taxes: estimatedTaxes,
					net_after_taxes: netAfterTaxes
				},
				scope: {
					contact_email: clientEmail,
					music_minutes: Math.round(musicMinutes),
					dialogue_hours: dialogueHours,
					sound_design_hours: soundDesignHours,
					mix_hours: mixHours,
					revision_hours: revisionHours
				},
				estimate: {
					runtime: runtime,
					music_minutes: Math.round(musicMinutes),
					dialogue_hours: dialogueHours,
					sound_design_hours: soundDesignHours,
					mix_hours: mixHours,
					revision_hours: revisionHours,
					post_days: postDays,
					bundle_discount: bundleDiscount,
					music_cost: musicCost,
					post_cost: postCost,
					discount_amount: discountAmount,
					total_cost: editableTotal
				}
			});

			alert('Project added to prospects pipeline successfully! Switch to the Projects tab to see it.');
			if (window.parent && window.parent !== window) {
				window.parent.postMessage({ type: 'projects-updated' }, '*');
			}
			clearForm();
			await loadLoggedEstimates();
		} catch (error) {
			console.error('Error creating project:', error);
			alert('Failed to create project. Please try again.');
		}
	}

	function clearForm() {
		projectName = '';
		clientName = '';
		clientEmail = '';
		runtime = 0;
		musicCoverage = 80;
		dialogueHours = 0;
		soundDesignHours = 0;
		mixHours = 0;
		revisionHours = 4;
		bundleDiscount = false;
	}

	// --- Logged Estimates ---

	async function loadLoggedEstimates() {
		try {
			const estimates = await estimatesAPI.getWithProjects(50);
			loggedEstimates = estimates.reverse();
		} catch (error) {
			console.error('Error loading estimates:', error);
			loggedEstimates = [];
		}
	}

	async function loadLoggedEstimate(id: number) {
		try {
			const data = await estimatesAPI.getByIdWithProject(id);
			projectName = data.project_name || '';
			clientName = data.client_name || '';
			clientEmail = data.contact_email || '';
			runtime = data.runtime || 0;
			musicCoverage = 80;
			dialogueHours = data.dialogue_hours || 0;
			soundDesignHours = data.sound_design_hours || 0;
			mixHours = data.mix_hours || 0;
			revisionHours = data.revision_hours || 0;
			bundleDiscount = Boolean(data.bundle_discount);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (error) {
			console.error('Error loading estimate:', error);
			alert('Failed to load estimate');
		}
	}

	async function deleteLoggedEstimate(id: number, name: string) {
		if (!confirm(`Delete estimate for "${name}"?`)) return;
		try {
			await estimatesAPI.delete(id);
			loggedEstimates = loggedEstimates.filter((e) => e.id !== id);
		} catch (error) {
			console.error('Error deleting estimate:', error);
			alert('Failed to delete estimate');
		}
	}

	// --- Import Project Info ---

	function handleFileImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			parseProjectInfo(content);
			alert('Project info imported successfully!');
			input.value = '';
		};
		reader.readAsText(file);
	}

	function parseProjectInfo(content: string) {
		const lines = content.split('\n');
		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex === -1) continue;
			const key = line.substring(0, colonIndex).trim().toLowerCase();
			const value = line.substring(colonIndex + 1).trim();

			switch (key) {
				case 'project':
					projectName = value;
					break;
				case 'client':
					clientName = value;
					break;
				case 'email':
					clientEmail = value;
					break;
				case 'runtime': {
					const num = parseFloat(value);
					if (!isNaN(num)) runtime = num;
					break;
				}
				case 'scope': {
					const scopeLower = value.toLowerCase();
					if (scopeLower.includes('dialogue')) {
						dialogueHours = Math.max(1, Math.round(runtime / 2));
					}
					if (scopeLower.includes('sound design')) {
						soundDesignHours = Math.max(1, Math.round(runtime / 4));
					}
					if (scopeLower.includes('mix')) {
						mixHours = Math.max(1, Math.round(runtime / 4));
					}
					break;
				}
			}
		}
	}

	onMount(() => {
		loadLoggedEstimates();
	});
</script>

<div class="calculator-container">
	<div class="header">
		<h1>Project Estimate Calculator</h1>
	</div>

	<!-- Project Details Section -->
	<div class="form-section">
		<div class="section-header-row">
			<h3 class="section-title" style="margin-bottom: 0;">Project Details</h3>
			<button class="import-btn" onclick={() => fileInput.click()}>import project info</button>
			<input type="file" accept=".txt" bind:this={fileInput} onchange={handleFileImport} style="display: none;" />
		</div>
		<div class="form-grid">
			<div class="form-group full-width">
				<label for="projectName">Project Name</label>
				<input type="text" id="projectName" bind:value={projectName} />
			</div>
			<div class="form-group full-width">
				<label for="clientName">Point of Contact Name</label>
				<input type="text" id="clientName" bind:value={clientName} />
			</div>
			<div class="form-group full-width">
				<label for="clientEmail">Point of Contact Email</label>
				<input type="email" id="clientEmail" bind:value={clientEmail} />
			</div>
		</div>
	</div>

	<!-- Music Composition Section -->
	<div class="form-section">
		<h3 class="section-title">Music Composition</h3>
		<div class="form-grid">
			<div class="form-group">
				<label for="runtime">TRT</label>
				<div class="input-with-suffix">
					<input
						type="number"
						id="runtime"
						bind:value={runtime}
						min="0"
						step="0.1"
						placeholder="0"
					/>
					<span class="input-suffix">mins</span>
				</div>
			</div>
			<div class="form-group">
				<label for="musicCoverage">Estimated Coverage %</label>
				<input type="number" id="musicCoverage" bind:value={musicCoverage} min="0" max="100" />
			</div>
		</div>
	</div>

	<!-- Post-Production Audio Section -->
	<div class="form-section">
		<h3 class="section-title">Post-Production Audio</h3>
		<div class="form-grid">
			<div class="form-group">
				<label for="dialogueHours">Dialogue</label>
				<div class="input-with-suffix">
					<input
						type="number"
						id="dialogueHours"
						bind:value={dialogueHours}
						min="0"
						step="0.5"
						placeholder="0"
					/>
					<span class="input-suffix">hrs</span>
				</div>
			</div>
			<div class="form-group">
				<label for="soundDesignHours">Sound Design</label>
				<div class="input-with-suffix">
					<input
						type="number"
						id="soundDesignHours"
						bind:value={soundDesignHours}
						min="0"
						step="0.5"
						placeholder="0"
					/>
					<span class="input-suffix">hrs</span>
				</div>
			</div>
			<div class="form-group">
				<label for="mixHours">Mix</label>
				<div class="input-with-suffix">
					<input
						type="number"
						id="mixHours"
						bind:value={mixHours}
						min="0"
						step="0.5"
						placeholder="0"
					/>
					<span class="input-suffix">hrs</span>
				</div>
			</div>
			<div class="form-group">
				<label for="revisionHours">Revisions</label>
				<div class="input-with-suffix">
					<input
						type="number"
						id="revisionHours"
						bind:value={revisionHours}
						min="0"
						step="0.5"
						placeholder="0"
					/>
					<span class="input-suffix">hrs</span>
				</div>
			</div>
		</div>
		<div class="checkbox-group">
			<input type="checkbox" id="bundleDiscount" bind:checked={bundleDiscount} />
			<label for="bundleDiscount" style="margin: 0;">Apply bundle discount</label>
		</div>
	</div>

	<!-- Results Section -->
	<div class="results">
		<h3 class="section-title">Estimate Breakdown</h3>
		<div class="breakdown">
			{#if musicCost > 0}
				<div class="breakdown-row">
					<span>Music Composition ({musicMinutes.toFixed(1)} minutes @ ${MUSIC_RATE}/min)</span>
					<span>${Math.round(musicCost)}</span>
				</div>
			{/if}
			{#if postCost > 0}
				<div class="breakdown-row">
					<span>Post-Production Audio ({postDays} days)</span>
					<span>${Math.round(postCost)}</span>
				</div>
			{/if}
			{#if discountAmount > 0}
				<div class="breakdown-row">
					<span>Bundle Discount (10%)</span>
					<span>-${Math.round(discountAmount)}</span>
				</div>
			{/if}
			{#if musicDays > 0 || postDays > 0}
				<div class="breakdown-row" style="margin-top: 1rem; padding-top: 0.75rem; border-top: var(--border-light);">
					<span style="font-weight: 500;">Estimated Timeline</span>
					<span></span>
				</div>
				{#if musicDays > 0}
					<div class="breakdown-row" style="font-size: 0.9rem; color: var(--secondary-text);">
						<span>• Music composition</span>
						<span>{musicDays} days</span>
					</div>
				{/if}
				{#if postDays > 0}
					<div class="breakdown-row" style="font-size: 0.9rem; color: var(--secondary-text);">
						<span>• Post-production audio</span>
						<span>{postDays} days</span>
					</div>
				{/if}
				<div class="breakdown-row" style="font-size: 0.9rem; color: var(--accent-teal); font-weight: 500;">
					<span>Total project timeline</span>
					<span>
						<input
							type="number"
							class="breakdown-input"
							bind:value={editableTimeline}
							min="0"
							step="0.5"
							style="font-weight: 500; font-size: 0.9rem; width: {timelineInputWidth};"
						/> days
					</span>
				</div>
			{/if}

			<div class="breakdown-row total">
				<span>Total Estimate</span>
				<span style="display: flex; align-items: center; gap: 0.25rem;">
					$<input
						type="number"
						class="breakdown-input"
						bind:value={editableTotal}
						step="100"
						style="font-weight: 600; font-size: 1.1rem; width: {totalInputWidth};"
					/>
				</span>
			</div>
			<div class="breakdown-row" style="font-size: 0.9rem; color: var(--muted-text); margin-top: 0.5rem;">
				<span>Estimated taxes (30%)</span>
				<span>-${Math.round(taxes)}</span>
			</div>
			<div class="breakdown-row" style="font-size: 0.9rem; color: var(--accent-blue); font-weight: 500;">
				<span>Net after taxes</span>
				<span>${Math.round(netAmount)}</span>
			</div>
		</div>

		<div class="copy-section">
			<h4 class="section-title">Email Copy</h4>
			<textarea bind:value={emailText} rows="12" style="width: 100%; min-height: 200px;"></textarea>
			<div class="action-buttons">
				<button class="action-btn btn-gradient" onclick={sendToProjects}>send to projects</button>
			</div>
		</div>
	</div>

	{#if loggedEstimates.length > 0}
		<div class="logged-estimates-section">
			<h3 class="section-title">Logged Estimates</h3>
			{#each loggedEstimates as estimate}
				<div
					class="logged-estimate-card"
					onclick={() => loadLoggedEstimate(estimate.id)}
					role="button"
					tabindex="0"
					onkeydown={(e) => { if (e.key === 'Enter') loadLoggedEstimate(estimate.id); }}
				>
					<div class="logged-estimate-header">
						<div>
							<div class="logged-estimate-title">{estimate.project_name || 'Unknown'}</div>
							<div class="logged-estimate-date">
								{new Date(estimate.created_at).toLocaleDateString()}
							</div>
						</div>
						<button
							class="logged-estimate-delete"
							onclick={(e) => { e.stopPropagation(); deleteLoggedEstimate(estimate.id, estimate.project_name || 'Unknown'); }}
							title="Delete"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
						</button>
					</div>
					<div class="logged-estimate-info">
						<div><strong>Client:</strong> {estimate.client_name || ''}</div>
						<div><strong>Music:</strong> {estimate.music_minutes || 0} mins</div>
						<div><strong>Post:</strong> {estimate.post_days || 0} days</div>
						<div><strong>Total:</strong> ${(estimate.total_cost || 0).toFixed(0)}</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.calculator-container {
		max-width: 800px;
		margin: 0 auto;
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-subtle);
		padding: 2rem;
		border: var(--border-light);
		margin-top: 2rem;
		margin-bottom: 2rem;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: var(--border-medium);
	}

	.header h1 {
		font-family: var(--font-display);
		font-size: 2rem;
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
		margin-bottom: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	.input-with-suffix {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.input-suffix {
		color: var(--muted-text);
		font-size: 0.9rem;
	}

	label {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--secondary-text);
		margin-bottom: 0.5rem;
	}

	input,
	select,
	textarea {
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: var(--radius-md);
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
		transition: border-color var(--transition-normal);
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	textarea {
		resize: vertical;
		font-family: var(--font-body);
		line-height: 1.5;
	}

	.checkbox-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--accent-teal);
	}

	.results {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-top: 2rem;
		border: var(--border-medium);
	}

	.breakdown {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.breakdown-row.total {
		font-weight: 600;
		font-size: 1.1rem;
		padding-top: 0.75rem;
		border-top: var(--border-medium);
		color: var(--accent-teal);
	}

	.breakdown-input {
		text-align: right;
		padding: 0.1rem 0.3rem;
		border: 2px solid var(--accent-teal);
		border-radius: 4px;
		font-size: 0.95rem;
		font-family: var(--font-body);
	}

	.breakdown-input:focus {
		outline: none;
		border-color: var(--accent-blue);
	}

	.copy-section {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: var(--border-light);
		text-align: center;
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 1rem;
		flex-wrap: wrap;
	}

	.action-btn {
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: var(--radius-md);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-normal);
		box-shadow: var(--shadow-subtle);
		font-family: var(--font-button);
	}

	.action-btn.btn-gradient {
		background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-red) 100%);
		color: white;
	}

	.action-btn.btn-gradient:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
	}

	/* Import button + section header */
	.section-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.import-btn {
		background: none;
		border: var(--border-medium);
		padding: 0.4rem 0.8rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--accent-blue);
		cursor: pointer;
		font-family: var(--font-button);
		transition: all var(--transition-normal);
	}

	.import-btn:hover {
		background: var(--accent-blue);
		color: white;
	}

	/* Logged Estimates */
	.logged-estimates-section {
		margin-top: 3rem;
	}

	.logged-estimate-card {
		background: white;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1rem;
		border: var(--border-medium);
		cursor: pointer;
		transition: box-shadow var(--transition-normal);
	}

	.logged-estimate-card:hover {
		box-shadow: var(--shadow-subtle);
	}

	.logged-estimate-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.logged-estimate-title {
		font-weight: 600;
		font-size: 1rem;
		color: var(--primary-text);
	}

	.logged-estimate-date {
		font-size: 0.85rem;
		color: var(--muted-text);
	}

	.logged-estimate-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--secondary-text);
	}

	.logged-estimate-delete {
		background: none;
		border: none;
		color: var(--muted-text);
		font-size: 1.2rem;
		cursor: pointer;
		transition: color 0.2s;
		padding: 0.25rem;
	}

	.logged-estimate-delete:hover {
		color: var(--accent-red);
	}

	@media (max-width: 768px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
