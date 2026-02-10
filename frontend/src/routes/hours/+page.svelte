<script lang="ts">
	import { hoursAPI, projectsAPI, estimatesAPI } from '$lib/api';
	import { onMount } from 'svelte';

	// State
	let currentProject = $state<number | null>(null);
	let projects = $state<any[]>([]);
	let hoursEntries = $state<any[]>([]);
	let estimates = $state<any>(null);

	// Form state
	let formData = $state({
		date: new Date().toISOString().split('T')[0],
		hours: 0,
		category: 'music',
		description: ''
	});

	// Show add form
	let showAddForm = $state(false);

	// Categories
	const categories = [
		{ value: 'music', label: 'Music Composition', color: 'var(--accent-purple)' },
		{ value: 'dialogue', label: 'Dialogue Editing', color: 'var(--accent-blue)' },
		{ value: 'sound-design', label: 'Sound Design', color: 'var(--accent-teal)' },
		{ value: 'mix', label: 'Mixing', color: 'var(--accent-gold)' },
		{ value: 'revisions', label: 'Revisions', color: 'var(--accent-red)' }
	];

	// Totals by category
	const totals = $derived.by(() => {
		const byCategory: Record<string, number> = {
			music: 0,
			dialogue: 0,
			'sound-design': 0,
			mix: 0,
			revisions: 0
		};

		hoursEntries.forEach((entry) => {
			if (byCategory[entry.category] !== undefined) {
				byCategory[entry.category] += entry.hours;
			}
		});

		const grandTotal =
			byCategory.music +
			byCategory.dialogue +
			byCategory['sound-design'] +
			byCategory.mix +
			byCategory.revisions;

		return {
			byCategory,
			grandTotal
		};
	});

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		try {
			projects = await projectsAPI.getAll();
		} catch (error) {
			console.error('Error loading projects:', error);
		}
	}

	async function loadProjectHours() {
		if (!currentProject) {
			hoursEntries = [];
			estimates = null;
			return;
		}

		try {
			// Load hours entries
			hoursEntries = await hoursAPI.getByProject(currentProject);

			// Load estimates for comparison
			const projectEstimates = await estimatesAPI.getByProject(currentProject);
			if (projectEstimates.length > 0) {
				// Use most recent estimate
				const latest = projectEstimates[projectEstimates.length - 1];
				estimates = {
					dialogue: latest.dialogue_hours || 0,
					soundDesign: latest.sound_design_hours || 0,
					mix: latest.mix_hours || 0,
					revisions: latest.revision_hours || 0
				};
			}
		} catch (error) {
			console.error('Error loading hours:', error);
			hoursEntries = [];
			estimates = null;
		}
	}

	async function logHours(event: Event) {
		event.preventDefault();

		if (!currentProject) {
			alert('Please select a project first');
			return;
		}

		if (formData.hours <= 0) {
			alert('Please enter a valid number of hours');
			return;
		}

		try {
			await hoursAPI.create({
				project_id: currentProject,
				date: formData.date,
				hours: formData.hours,
				category: formData.category,
				description: formData.description
			});

			await loadProjectHours();

			// Reset form
			formData = {
				date: new Date().toISOString().split('T')[0],
				hours: 0,
				category: 'music',
				description: ''
			};
			showAddForm = false;
		} catch (error) {
			console.error('Error logging hours:', error);
			alert('Failed to log hours. Please try again.');
		}
	}

	async function deleteEntry(id: number) {
		if (!confirm('Delete this entry?')) return;

		try {
			await hoursAPI.delete(id);
			await loadProjectHours();
		} catch (error) {
			console.error('Error deleting entry:', error);
			alert('Failed to delete entry');
		}
	}

	function getCategoryColor(category: string): string {
		const cat = categories.find((c) => c.value === category);
		return cat ? cat.color : 'var(--muted-text)';
	}

	function getCategoryLabel(category: string): string {
		const cat = categories.find((c) => c.value === category);
		return cat ? cat.label : category;
	}

	function getProgressPercentage(logged: number, estimated: number): number {
		if (estimated === 0) return 0;
		return Math.min((logged / estimated) * 100, 100);
	}
</script>

<div class="hours-container">
	<div class="header">
		<h1>Hours Tracker</h1>
		<select
			class="project-select"
			bind:value={currentProject}
			onchange={() => loadProjectHours()}
		>
			<option value={null}>select project...</option>
			{#each projects as project}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</div>

	{#if currentProject}
		<div class="stats-section">
			<div class="stat-card">
				<div class="stat-label">Total Hours Logged</div>
				<div class="stat-value">{totals.grandTotal.toFixed(1)}</div>
			</div>

			{#each categories as cat}
				{@const logged = totals.byCategory[cat.value] || 0}
				{@const estimated = estimates ? estimates[cat.value === 'sound-design' ? 'soundDesign' : cat.value] || 0 : 0}
				<div class="stat-card">
					<div class="stat-label">{cat.label}</div>
					<div class="stat-value" style="color: {cat.color}">{logged.toFixed(1)}h</div>
					{#if estimated > 0}
						<div class="progress-bar-mini">
							<div
								class="progress-fill"
								style="width: {getProgressPercentage(logged, estimated)}%; background: {cat.color}"
							></div>
						</div>
						<div class="stat-subtitle">
							{logged.toFixed(1)} / {estimated.toFixed(1)} hours
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="actions">
			<button class="btn btn-primary" onclick={() => (showAddForm = !showAddForm)}>
				{showAddForm ? 'cancel' : '+ log hours'}
			</button>
		</div>

		{#if showAddForm}
			<div class="add-form-section">
				<form class="hours-form" onsubmit={logHours}>
					<div class="form-row">
						<div class="form-group">
							<label for="hoursDate">Date</label>
							<input type="date" id="hoursDate" bind:value={formData.date} required />
						</div>
						<div class="form-group">
							<label for="hoursCategory">Category</label>
							<select id="hoursCategory" bind:value={formData.category} required>
								{#each categories as cat}
									<option value={cat.value}>{cat.label}</option>
								{/each}
							</select>
						</div>
						<div class="form-group">
							<label for="hoursAmount">Hours</label>
							<input
								type="number"
								id="hoursAmount"
								bind:value={formData.hours}
								step="0.1"
								min="0"
								placeholder="0.0"
								required
							/>
						</div>
					</div>
					<div class="form-group">
						<label for="hoursDescription">Description (Optional)</label>
						<input
							type="text"
							id="hoursDescription"
							bind:value={formData.description}
							placeholder="What did you work on?"
						/>
					</div>
					<div class="form-actions">
						<button type="submit" class="btn btn-success">save entry</button>
					</div>
				</form>
			</div>
		{/if}

		<div class="hours-table-section">
			<h2>Hours Log</h2>
			{#if hoursEntries.length === 0}
				<div class="empty-state">
					<p>No hours logged yet. Add an entry to get started.</p>
				</div>
			{:else}
				<table class="hours-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Category</th>
							<th>Hours</th>
							<th>Description</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each hoursEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) as entry}
							<tr>
								<td>{new Date(entry.date).toLocaleDateString()}</td>
								<td>
									<span class="category-badge" style="border-left: 3px solid {getCategoryColor(entry.category)}">
										{getCategoryLabel(entry.category)}
									</span>
								</td>
								<td class="hours-cell">{entry.hours.toFixed(1)}h</td>
								<td>{entry.description || '-'}</td>
								<td>
									<button class="delete-btn" onclick={() => deleteEntry(entry.id)} title="Delete">
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
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{:else}
		<div class="empty-state" style="margin-top: 3rem;">
			<h3>No project selected</h3>
			<p>Select a project to view and log hours</p>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.hours-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.header h1 {
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
		font-family: var(--font-display);
	}

	.project-select {
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
		min-width: 250px;
	}

	.stats-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
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
		color: var(--accent-teal);
	}

	.stat-subtitle {
		font-size: 0.85rem;
		color: var(--subtle-text);
		margin-top: 0.25rem;
	}

	.progress-bar-mini {
		width: 100%;
		height: 4px;
		background: var(--bg-primary);
		border-radius: 2px;
		overflow: hidden;
		margin-top: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease;
	}

	.actions {
		margin-bottom: 1.5rem;
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

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}
	.btn-primary:hover {
		background: #3a8bc7;
	}

	.btn-success {
		background: var(--accent-green);
		color: white;
	}
	.btn-success:hover {
		background: #47c760;
	}

	.add-form-section {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		margin-bottom: 2rem;
	}

	.hours-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
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
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}

	.hours-table-section {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
	}

	.hours-table-section h2 {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 1.5rem;
	}

	.hours-table {
		width: 100%;
		border-collapse: collapse;
	}

	.hours-table th {
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

	.hours-table td {
		padding: 1rem;
		border-bottom: var(--border-light);
		font-size: 0.95rem;
		color: var(--secondary-text);
	}

	.hours-table tr:hover {
		background: var(--bg-primary);
	}

	.category-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.85rem;
		font-weight: 500;
		background: var(--bg-primary);
	}

	.hours-cell {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-teal);
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
		.form-row {
			grid-template-columns: 1fr;
		}
		.stats-section {
			grid-template-columns: 1fr;
		}
	}
</style>
