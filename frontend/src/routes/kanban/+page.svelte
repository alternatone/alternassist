<script lang="ts">
	import { projectsAPI, hoursAPI, cuesAPI } from '$lib/api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	// State
	let projects = $state<any[]>([]);
	let columns = $state({
		prospects: [] as any[],
		'in-process': [] as any[],
		'in-review': [] as any[],
		'approved-billed': [] as any[],
		archive: [] as any[]
	});
	let showProjectModal = $state(false);
	let currentProjectId = $state<number | null>(null);

	// Form state
	let formData = $state({
		title: '',
		client: '',
		contactEmail: '',
		status: '',
		notes: '',
		musicMinutes: 0,
		dialogueHours: 0,
		soundDesignHours: 0,
		mixHours: 0,
		revisionHours: 0,
		loggedMusic: 0,
		loggedDialogue: 0,
		loggedSoundDesign: 0,
		loggedMix: 0,
		loggedRevisions: 0
	});

	// Additional project data loaded for editing
	let kanbanData = $state<any>(null);
	let showHoursLogger = $state(false);
	let showScopeSection = $state(true);

	// Payment status display
	let paymentStatus = $state({ show: false, text: '', color: 'teal', bg: '#e7f5ff' });

	// Cue progress bar data
	let cueProgress = $state({ toWrite: 0, written: 0, revisions: 0, approved: 0, total: 0 });

	// Current project's kanban column (for determining button visibility)
	let currentProjectColumn = $state('');

	// Map DB status values to kanban column keys
	function statusToColumn(status: string): string {
		const mapping: Record<string, string> = {
			prospects: 'prospects',
			active: 'in-process',
			hold: 'in-review',
			completed: 'approved-billed'
		};
		return mapping[status] || 'prospects';
	}

	// Map kanban column keys back to DB status values
	function columnToStatus(column: string): string {
		const mapping: Record<string, string> = {
			prospects: 'prospects',
			'in-process': 'active',
			'in-review': 'active',
			'approved-billed': 'completed',
			archive: 'completed'
		};
		return mapping[column] || 'prospects';
	}

	onMount(() => {
		loadProjects();
		// Event delegation for drag-and-drop — single set of listeners handles all cards
		boardElement.addEventListener('dragstart', (e: Event) => {
			const de = e as DragEvent;
			const card = (de.target as HTMLElement).closest('.card') as HTMLElement;
			if (!card) return;
			draggedElement = card;
			card.classList.add('dragging');
			de.dataTransfer!.effectAllowed = 'move';
			de.dataTransfer!.setData('text/html', card.innerHTML);
		});
		boardElement.addEventListener('dragend', (e: Event) => {
			const card = ((e as DragEvent).target as HTMLElement).closest('.card') as HTMLElement;
			if (card) card.classList.remove('dragging');
		});
		boardElement.addEventListener('dragover', (e: Event) => {
			e.preventDefault();
			const de = e as DragEvent;
			de.dataTransfer!.dropEffect = 'move';
			const col = (de.target as HTMLElement).closest('.column') as HTMLElement;
			if (col) col.classList.add('drag-over');
		});
		boardElement.addEventListener('dragleave', (e: Event) => {
			const de = e as DragEvent;
			const col = (de.target as HTMLElement).closest('.column') as HTMLElement;
			if (col && !col.contains(de.relatedTarget as Node)) {
				col.classList.remove('drag-over');
			}
		});
		boardElement.addEventListener('drop', async (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			const de = e as DragEvent;
			const col = (de.target as HTMLElement).closest('.column') as HTMLElement;
			if (!col || !draggedElement) return;
			col.classList.remove('drag-over');
			const newColumnKey = col.dataset.column!;
			const projectId = parseInt(draggedElement.dataset.id!);
			const project = projects.find((p) => p.id === projectId);
			if (!project) return;
			const isCurrentlyArchived = project.archived === 1;
			const currentColumn = isCurrentlyArchived ? 'archive' : statusToColumn(project.status);
			if (currentColumn === newColumnKey) return;
			try {
				if (newColumnKey === 'archive') {
					await projectsAPI.archive(projectId);
				} else if (isCurrentlyArchived) {
					await projectsAPI.unarchive(projectId);
					await projectsAPI.update(projectId, { status: columnToStatus(newColumnKey) });
				} else {
					await projectsAPI.update(projectId, { status: columnToStatus(newColumnKey) });
				}
				await loadProjects();
			} catch (error) {
				console.error('Error updating project status:', error);
				await loadProjects();
			}
		});
	});

	async function loadProjects() {
		try {
			// Use with-scope endpoint for scope data (category badges)
			const allProjects = await projectsAPI.getWithScope();
			projects = allProjects;
			organizeIntoColumns();
		} catch (error) {
			console.error('Error loading projects:', error);
		}
	}

	function organizeIntoColumns() {
		columns = {
			prospects: projects.filter((p) => statusToColumn(p.status) === 'prospects'),
			'in-process': projects.filter((p) => statusToColumn(p.status) === 'in-process'),
			'in-review': projects.filter((p) => statusToColumn(p.status) === 'in-review'),
			'approved-billed': projects.filter(
				(p) => statusToColumn(p.status) === 'approved-billed' && !p.archived
			),
			archive: projects.filter((p) => p.archived === 1)
		};
	}

	// Native drag-and-drop via event delegation — exactly like legacy kanban
	let draggedElement: HTMLElement | null = null;
	let boardElement: HTMLElement;

	function getCategoryBadge(project: any): string {
		// with-scope endpoint returns scope fields flat on the project object
		const hasMusic = (project.music_minutes || 0) > 0;
		const hasPost =
			(project.dialogue_hours || 0) > 0 ||
			(project.sound_design_hours || 0) > 0 ||
			(project.mix_hours || 0) > 0 ||
			(project.revision_hours || 0) > 0;

		if (hasMusic && hasPost) {
			return 'music-post';
		} else if (hasMusic) {
			return 'music';
		} else if (hasPost) {
			return 'post';
		}
		return '';
	}

	function getCategoryLabel(project: any): string {
		const badge = getCategoryBadge(project);
		if (badge === 'music-post') return 'music + post';
		if (badge === 'music') return 'music';
		if (badge === 'post') return 'post';
		return '';
	}

	function openAddProjectModal() {
		currentProjectId = null;
		currentProjectColumn = '';
		formData = {
			title: '',
			client: '',
			contactEmail: '',
			status: '',
			notes: '',
			musicMinutes: 0,
			dialogueHours: 0,
			soundDesignHours: 0,
			mixHours: 0,
			revisionHours: 0,
			loggedMusic: 0,
			loggedDialogue: 0,
			loggedSoundDesign: 0,
			loggedMix: 0,
			loggedRevisions: 0
		};
		paymentStatus = { show: false, text: '', color: 'teal', bg: '#e7f5ff' };
		cueProgress = { toWrite: 0, written: 0, revisions: 0, approved: 0, total: 0 };
		showHoursLogger = false;
		showScopeSection = true;
		showProjectModal = true;
	}

	async function openEditProjectModal(projectId: number) {
		currentProjectId = projectId;
		const project = projects.find((p) => p.id === projectId);
		if (!project) return;

		const column = statusToColumn(project.status);
		currentProjectColumn = column;

		// Load kanban data
		try {
			const response = await fetch(`/api/projects/${projectId}/kanban-data`);
			kanbanData = response.ok ? await response.json() : {};
		} catch (error) {
			console.error('Error loading kanban data:', error);
			kanbanData = {};
		}

		const scope = kanbanData || {};
		const isInProcess = column === 'in-process';
		const isInReview = column === 'in-review';
		const isApprovedBilled = column === 'approved-billed';
		const isArchive = project.archived === 1;

		// Payment status display
		const statusText = project.status_text || '';
		if (
			statusText &&
			(statusText.includes('deposit') ||
				statusText.includes('invoiced') ||
				statusText.includes('received'))
		) {
			if (statusText.includes('received')) {
				paymentStatus = {
					show: true,
					text: statusText,
					color: 'var(--accent-green)',
					bg: '#d3f9d8'
				};
			} else if (statusText.includes('invoiced')) {
				paymentStatus = {
					show: true,
					text: statusText,
					color: 'var(--accent-orange)',
					bg: '#fff3bf'
				};
			} else {
				paymentStatus = {
					show: true,
					text: statusText,
					color: 'var(--accent-teal)',
					bg: '#e7f5ff'
				};
			}
		} else {
			paymentStatus = { show: false, text: '', color: 'teal', bg: '#e7f5ff' };
		}

		formData = {
			title: project.name || '',
			client: project.client_name || '',
			contactEmail: scope.contact_email || '',
			status: project.status_text || '',
			notes: project.notes || '',
			musicMinutes: scope.music_minutes || 0,
			dialogueHours: scope.dialogue_hours || 0,
			soundDesignHours: scope.sound_design_hours || 0,
			mixHours: scope.mix_hours || 0,
			revisionHours: scope.revision_hours || 0,
			loggedMusic: 0,
			loggedDialogue: kanbanData.logged_dialogue || 0,
			loggedSoundDesign: kanbanData.logged_sound_design || 0,
			loggedMix: kanbanData.logged_mix || 0,
			loggedRevisions: kanbanData.logged_revisions || 0
		};

		showHoursLogger = isInProcess || isInReview || isApprovedBilled || isArchive;
		showScopeSection = !showHoursLogger;

		// Load cue stats for music progress bar and auto-calc music hours
		if (showHoursLogger) {
			try {
				const stats = await cuesAPI.getStats(projectId);
				const toWrite = stats['to-write'] || 0;
				const written = stats.written || 0;
				const revs = stats.revisions || 0;
				const approved = stats.approved || 0;
				const total = toWrite + written + revs + approved;
				cueProgress = { toWrite, written, revisions: revs, approved, total };

				// Auto-calculate music hours from approved cue minutes
				const approvedMinutes = (stats as any).approved_minutes || 0;
				formData.loggedMusic = Math.floor(approvedMinutes);
			} catch (e) {
				console.error('Failed to load cue stats:', e);
				cueProgress = { toWrite: 0, written: 0, revisions: 0, approved: 0, total: 0 };
			}
		} else {
			cueProgress = { toWrite: 0, written: 0, revisions: 0, approved: 0, total: 0 };
		}

		showProjectModal = true;
	}

	function closeProjectModal() {
		showProjectModal = false;
		currentProjectId = null;
		currentProjectColumn = '';
		kanbanData = null;
	}

	async function saveProject() {
		if (!formData.title || !formData.client) {
			alert('Please fill in project title and client');
			return;
		}

		try {
			if (currentProjectId) {
				// Update existing project
				await projectsAPI.update(currentProjectId, {
					name: formData.title,
					client_name: formData.client,
					notes: formData.notes,
					status_text: formData.status
				});

				// Save scope or hours depending on project status
				if (showHoursLogger) {
					// Save logged hours
					await hoursAPI.upsertTotals(currentProjectId, {
						music: formData.loggedMusic,
						dialogue: formData.loggedDialogue,
						soundDesign: formData.loggedSoundDesign,
						mix: formData.loggedMix,
						revisions: formData.loggedRevisions
					});
				} else {
					// Save scope data
					await fetch('/api/estimates/scope', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							project_id: currentProjectId,
							contact_email: formData.contactEmail,
							music_minutes: formData.musicMinutes,
							dialogue_hours: formData.dialogueHours,
							sound_design_hours: formData.soundDesignHours,
							mix_hours: formData.mixHours,
							revision_hours: formData.revisionHours
						})
					});

					// Also update music_coverage in projects table
					await projectsAPI.update(currentProjectId, {
						music_coverage: formData.musicMinutes
					});
				}
			} else {
				// Create new project
				const newProject = await projectsAPI.create({
					name: formData.title,
					client_name: formData.client,
					contact_email: formData.contactEmail,
					notes: formData.notes,
					status: 'prospects',
					status_text: formData.status
				});

				// Save scope data if provided
				if (
					formData.musicMinutes ||
					formData.dialogueHours ||
					formData.soundDesignHours ||
					formData.mixHours ||
					formData.revisionHours
				) {
					await fetch('/api/estimates/scope', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							project_id: newProject.id,
							contact_email: formData.contactEmail,
							music_minutes: formData.musicMinutes,
							dialogue_hours: formData.dialogueHours,
							sound_design_hours: formData.soundDesignHours,
							mix_hours: formData.mixHours,
							revision_hours: formData.revisionHours
						})
					});

					// Also update music_coverage in projects table
					await projectsAPI.update(newProject.id, {
						music_coverage: formData.musicMinutes
					});
				}
			}

			await loadProjects();
			closeProjectModal();

			// Notify other components that projects have been updated
			window.dispatchEvent(new CustomEvent('projects-updated'));
		} catch (error) {
			console.error('Error saving project:', error);
			alert('Failed to save project. Please try again.');
		}
	}

	function openCueTracker() {
		if (!currentProjectId) return;
		localStorage.setItem('cue-tracker-selected-project', currentProjectId.toString());
		goto('/cues');
	}

	function sendProjectToInvoices() {
		if (!currentProjectId) return;
		const project = projects.find((p) => p.id === currentProjectId);
		if (!project) return;

		const loggedHours = {
			music: formData.loggedMusic || 0,
			dialogue: formData.loggedDialogue || 0,
			soundDesign: formData.loggedSoundDesign || 0,
			mix: formData.loggedMix || 0,
			revisions: formData.loggedRevisions || 0
		};

		const estimateData = kanbanData?.estimateData || {};

		const invoiceData = {
			id: Date.now().toString(),
			projectId: project.id,
			projectName: project.name,
			clientName: project.client_name,
			contactEmail: project.contact_email || formData.contactEmail,
			scopeData: {
				music_minutes: project.music_minutes || 0,
				dialogue_hours: project.dialogue_hours || 0,
				sound_design_hours: project.sound_design_hours || 0,
				mix_hours: project.mix_hours || 0,
				revision_hours: project.revision_hours || 0
			},
			loggedHours,
			estimateData,
			projectColumn: currentProjectColumn,
			createdAt: new Date().toISOString()
		};

		localStorage.setItem('invoices', JSON.stringify([invoiceData]));
		alert('Invoice created successfully! Navigating to Invoices page.');
		closeProjectModal();
		goto('/invoices');
	}

	async function togglePin(projectId: number) {
		try {
			const project = projects.find((p) => p.id === projectId);
			const newPinnedState = !project?.pinned;

			await projectsAPI.update(projectId, { pinned: newPinnedState ? 1 : 0 });
			await loadProjects();
		} catch (error) {
			console.error('Error toggling pin:', error);
		}
	}

	async function deleteProject(projectId: number) {
		if (!confirm('Delete this project?')) return;

		try {
			await projectsAPI.delete(projectId);
			await loadProjects();
			// Notify other components that projects have been updated
			window.dispatchEvent(new CustomEvent('projects-updated'));
		} catch (error) {
			console.error('Error deleting project:', error);
			alert('Failed to delete project');
		}
	}
</script>

<div class="board-container">
	<div class="header">
		<h1>Project Kanban Board</h1>
		<button class="add-project-btn" onclick={openAddProjectModal}>+ add project</button>
	</div>

	<div class="board" bind:this={boardElement}>
		<!-- Prospects Column -->
		<div class="column" data-column="prospects">
			<div class="column-header">
				<div class="column-title">Prospects</div>
				<div class="column-count">{columns.prospects.length} project{columns.prospects.length !== 1 ? 's' : ''}</div>
			</div>
			<div class="cards">
				{#each columns.prospects as project (project.id)}
					<div
						class="card"
						draggable="true"
						data-id={project.id}
						onclick={() => openEditProjectModal(project.id)}
					>
						<div class="card-title">
							<span>{project.name}</span>
							{#if getCategoryLabel(project)}
								<span class="card-category {getCategoryBadge(project)}">
									{getCategoryLabel(project)}
								</span>
							{/if}
						</div>
						{#if project.status_text}
							<div class="card-status">{project.status_text}</div>
						{/if}
						<div class="card-actions">
							<button
								class="card-btn pin"
								class:pinned={project.pinned}
								onclick={(e) => { e.stopPropagation(); togglePin(project.id); }}
								title={project.pinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 17v5"></path>
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
								</svg>
							</button>
							<button
								class="card-btn delete"
								onclick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
								title="Delete"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									<line x1="10" y1="11" x2="10" y2="17"></line>
									<line x1="14" y1="11" x2="14" y2="17"></line>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- In Production Column -->
		<div class="column" data-column="in-process">
			<div class="column-header">
				<div class="column-title">In Production</div>
				<div class="column-count">{columns['in-process'].length} project{columns['in-process'].length !== 1 ? 's' : ''}</div>
			</div>
			<div class="cards">
				{#each columns['in-process'] as project (project.id)}
					<div
						class="card"
						draggable="true"
						data-id={project.id}
						onclick={() => openEditProjectModal(project.id)}
					>
						<div class="card-title">
							<span>{project.name}</span>
							{#if getCategoryLabel(project)}
								<span class="card-category {getCategoryBadge(project)}">
									{getCategoryLabel(project)}
								</span>
							{/if}
						</div>
						{#if project.status_text}
							<div class="card-status">{project.status_text}</div>
						{/if}
						<div class="card-actions">
							<button
								class="card-btn pin"
								class:pinned={project.pinned}
								onclick={(e) => { e.stopPropagation(); togglePin(project.id); }}
								title={project.pinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 17v5"></path>
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
								</svg>
							</button>
							<button
								class="card-btn delete"
								onclick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
								title="Delete"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									<line x1="10" y1="11" x2="10" y2="17"></line>
									<line x1="14" y1="11" x2="14" y2="17"></line>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- In Review Column -->
		<div class="column" data-column="in-review">
			<div class="column-header">
				<div class="column-title">In Review</div>
				<div class="column-count">{columns['in-review'].length} project{columns['in-review'].length !== 1 ? 's' : ''}</div>
			</div>
			<div class="cards">
				{#each columns['in-review'] as project (project.id)}
					<div
						class="card"
						draggable="true"
						data-id={project.id}
						onclick={() => openEditProjectModal(project.id)}
					>
						<div class="card-title">
							<span>{project.name}</span>
							{#if getCategoryLabel(project)}
								<span class="card-category {getCategoryBadge(project)}">
									{getCategoryLabel(project)}
								</span>
							{/if}
						</div>
						{#if project.status_text}
							<div class="card-status">{project.status_text}</div>
						{/if}
						<div class="card-actions">
							<button
								class="card-btn pin"
								class:pinned={project.pinned}
								onclick={(e) => { e.stopPropagation(); togglePin(project.id); }}
								title={project.pinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 17v5"></path>
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
								</svg>
							</button>
							<button
								class="card-btn delete"
								onclick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
								title="Delete"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									<line x1="10" y1="11" x2="10" y2="17"></line>
									<line x1="14" y1="11" x2="14" y2="17"></line>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Approved & Billed Column -->
		<div class="column" data-column="approved-billed">
			<div class="column-header">
				<div class="column-title">Approved & Billed</div>
				<div class="column-count">{columns['approved-billed'].length} project{columns['approved-billed'].length !== 1 ? 's' : ''}</div>
			</div>
			<div class="cards">
				{#each columns['approved-billed'] as project (project.id)}
					<div
						class="card"
						draggable="true"
						data-id={project.id}
						onclick={() => openEditProjectModal(project.id)}
					>
						<div class="card-title">
							<span>{project.name}</span>
							{#if getCategoryLabel(project)}
								<span class="card-category {getCategoryBadge(project)}">
									{getCategoryLabel(project)}
								</span>
							{/if}
						</div>
						{#if project.status_text}
							<div class="card-status">{project.status_text}</div>
						{/if}
						<div class="card-actions">
							<button
								class="card-btn pin"
								class:pinned={project.pinned}
								onclick={(e) => { e.stopPropagation(); togglePin(project.id); }}
								title={project.pinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 17v5"></path>
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
								</svg>
							</button>
							<button
								class="card-btn delete"
								onclick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
								title="Delete"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									<line x1="10" y1="11" x2="10" y2="17"></line>
									<line x1="14" y1="11" x2="14" y2="17"></line>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Archive Column -->
		<div class="column archive" data-column="archive">
			<div class="column-header">
				<div class="column-title">Archive</div>
				<div class="column-count">{columns.archive.length} project{columns.archive.length !== 1 ? 's' : ''}</div>
			</div>
			<div class="cards">
				{#each columns.archive as project (project.id)}
					<div
						class="card"
						draggable="true"
						data-id={project.id}
						onclick={() => openEditProjectModal(project.id)}
					>
						<div class="card-title">
							<span>{project.name}</span>
							{#if getCategoryLabel(project)}
								<span class="card-category {getCategoryBadge(project)}">
									{getCategoryLabel(project)}
								</span>
							{/if}
						</div>
						{#if project.status_text}
							<div class="card-status">{project.status_text}</div>
						{/if}
						<div class="card-actions">
							<button
								class="card-btn pin"
								class:pinned={project.pinned}
								onclick={(e) => { e.stopPropagation(); togglePin(project.id); }}
								title={project.pinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 17v5"></path>
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
								</svg>
							</button>
							<button
								class="card-btn delete"
								onclick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
								title="Delete"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									<line x1="10" y1="11" x2="10" y2="17"></line>
									<line x1="14" y1="11" x2="14" y2="17"></line>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<!-- Project Modal -->
{#if showProjectModal}
	<div class="modal active" onclick={(e) => e.target === e.currentTarget && closeProjectModal()}>
		<div class="modal-content">
			<div class="modal-header">
				<h3 class="modal-title">{currentProjectId ? 'Project Info' : 'Add Project'}</h3>
			</div>

			<div class="form-group">
				<label for="projectTitle">Project Title</label>
				<input type="text" id="projectTitle" bind:value={formData.title} placeholder="Documentary Short - Ocean Cleanup" />
			</div>

			<div class="form-group">
				<label for="projectClient">Point of Contact Name</label>
				<input type="text" id="projectClient" bind:value={formData.client} placeholder="Point of contact name" />
			</div>

			<div class="form-group">
				<label for="projectContactEmail">Point of Contact Email</label>
				<input type="email" id="projectContactEmail" bind:value={formData.contactEmail} placeholder="contact@email.com" />
			</div>

			<!-- Payment Status Display -->
			{#if paymentStatus.show}
				<div class="payment-status-box" style="background: {paymentStatus.bg}; border-left-color: {paymentStatus.color};">
					<div class="payment-status-label" style="color: {paymentStatus.color};">Payment Status</div>
					<div class="payment-status-text">{paymentStatus.text}</div>
				</div>
			{/if}

			{#if showScopeSection}
				<div class="scope-section">
					<label>Scope Summary</label>
					<div class="scope-grid">
						<div class="scope-row">
							<label for="scopeMusic">Music:</label>
							<input type="text" id="scopeMusic" bind:value={formData.musicMinutes} placeholder="0 mins" />
						</div>
						<div class="scope-row">
							<label for="scopeDialogue">Dialogue:</label>
							<input type="text" id="scopeDialogue" bind:value={formData.dialogueHours} placeholder="0 hrs" />
						</div>
						<div class="scope-row">
							<label for="scopeSoundDesign">Sound Design:</label>
							<input type="text" id="scopeSoundDesign" bind:value={formData.soundDesignHours} placeholder="0 hrs" />
						</div>
						<div class="scope-row">
							<label for="scopeMix">Mix:</label>
							<input type="text" id="scopeMix" bind:value={formData.mixHours} placeholder="0 hrs" />
						</div>
						<div class="scope-row">
							<label for="scopeRevisions">Revisions:</label>
							<input type="text" id="scopeRevisions" bind:value={formData.revisionHours} placeholder="0 hrs" />
						</div>
					</div>
				</div>
			{/if}

			<div class="form-group">
				<label for="projectNotes">Creative Direction / Notes</label>
				<textarea id="projectNotes" bind:value={formData.notes} placeholder="Reference tracks, mood, style notes, client preferences..."></textarea>
			</div>

			{#if showHoursLogger}
				<div class="hours-logger-section">
					<div class="hours-logger-header">
						<span>Hours Logger</span>
						<button type="button" class="cue-tracker-link" onclick={openCueTracker}>Cue Tracker</button>
					</div>
					<div class="hours-grid">
						<div class="hours-row">
							<label>Music:</label>
							<input type="text" bind:value={formData.loggedMusic} readonly />
							<span>/</span>
							<span>{formData.musicMinutes} mins</span>
							{#if cueProgress.total > 0}
								<button type="button" class="cue-progress-bar" onclick={openCueTracker}>
									{#if cueProgress.toWrite > 0}
										<span class="progress-segment to-write" style="width: {(cueProgress.toWrite / cueProgress.total) * 100}%"></span>
									{/if}
									{#if cueProgress.written > 0}
										<span class="progress-segment written" style="width: {(cueProgress.written / cueProgress.total) * 100}%"></span>
									{/if}
									{#if cueProgress.revisions > 0}
										<span class="progress-segment revisions" style="width: {(cueProgress.revisions / cueProgress.total) * 100}%"></span>
									{/if}
									{#if cueProgress.approved > 0}
										<span class="progress-segment approved" style="width: {(cueProgress.approved / cueProgress.total) * 100}%"></span>
									{/if}
								</button>
							{/if}
						</div>
						<div class="hours-row">
							<label>Dialogue:</label>
							<input type="text" bind:value={formData.loggedDialogue} />
							<span>/</span>
							<span>{formData.dialogueHours} hrs</span>
						</div>
						<div class="hours-row">
							<label>Sound Design:</label>
							<input type="text" bind:value={formData.loggedSoundDesign} />
							<span>/</span>
							<span>{formData.soundDesignHours} hrs</span>
						</div>
						<div class="hours-row">
							<label>Mix:</label>
							<input type="text" bind:value={formData.loggedMix} />
							<span>/</span>
							<span>{formData.mixHours} hrs</span>
						</div>
						<div class="hours-row">
							<label>Revisions:</label>
							<input type="text" bind:value={formData.loggedRevisions} />
							<span>/</span>
							<span>{formData.revisionHours} hrs</span>
						</div>
					</div>
				</div>
			{/if}

			<div class="form-group">
				<label for="projectStatus">Status</label>
				<input type="text" id="projectStatus" bind:value={formData.status} placeholder="Estimate sent, In composition, etc." />
			</div>

			<div class="form-actions">
				<button class="btn btn-secondary" onclick={closeProjectModal}>cancel</button>
				<button class="btn btn-primary" onclick={saveProject}>save project</button>
				{#if currentProjectColumn === 'prospects' || currentProjectColumn === 'approved-billed'}
					<button class="btn btn-invoice" onclick={sendProjectToInvoices}>send to invoices</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow: auto !important;
	}

	.board-container {
		max-width: 1600px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		text-align: center;
		margin-bottom: 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.header h1 {
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 400;
		color: var(--primary-text);
	}

	.add-project-btn {
		background: var(--accent-teal);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		font-family: var(--font-body);
	}
	.add-project-btn:hover {
		background: #3a8bc7;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
	}

	.column {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		min-height: 500px;
	}

	.column.archive {
		grid-column: 1 / -1;
		min-height: auto;
	}
	.column.archive .column-header {
		margin-bottom: 2.25rem;
	}
	.column.archive .cards {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.column.archive .card {
		width: 250px;
		flex-shrink: 0;
	}

	.column-header {
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 3px solid;
	}
	.column[data-column='prospects'] .column-header {
		border-color: var(--accent-red);
	}
	.column[data-column='in-process'] .column-header {
		border-color: var(--accent-gold);
	}
	.column[data-column='in-review'] .column-header {
		border-color: var(--accent-yellow);
	}
	.column[data-column='approved-billed'] .column-header {
		border-color: var(--accent-green);
	}
	.column[data-column='archive'] .column-header {
		border-color: var(--accent-blue);
	}

	.column-title {
		font-size: 1rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.25rem;
	}
	.column[data-column='prospects'] .column-title {
		color: var(--accent-red);
	}
	.column[data-column='in-process'] .column-title {
		color: var(--accent-gold);
	}
	.column[data-column='in-review'] .column-title {
		color: var(--accent-yellow);
	}
	.column[data-column='approved-billed'] .column-title {
		color: var(--accent-green);
	}
	.column[data-column='archive'] .column-title {
		color: var(--accent-blue);
	}

	.column-count {
		font-size: 0.8rem;
		color: var(--muted-text);
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		background: white;
		border-radius: 8px;
		padding: 1rem;
		border: var(--border-medium);
		cursor: pointer;
		transition: box-shadow 0.2s, transform 0.2s;
	}
	.card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	:global(.card.dragging) {
		opacity: 0.5;
	}

	:global(.column.drag-over) {
		background: rgba(70, 159, 224, 0.05);
		border-color: var(--accent-teal);
	}

	.card-title {
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.card-status {
		font-size: 0.8rem;
		color: var(--muted-text);
		font-style: italic;
	}

	.card-category {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: lowercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		display: inline-block;
	}
	.card-category.music {
		background: rgba(232, 164, 93, 0.2);
		color: #b07830;
	}
	.card-category.post {
		background: rgba(74, 144, 200, 0.2);
		color: #3a72a0;
	}
	.card-category.music-post {
		background: rgba(91, 140, 110, 0.2);
		color: #4a7a5e;
	}

	.card-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: var(--border-light);
	}

	.card-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		font-size: 1rem;
		color: var(--muted-text);
		transition: color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card-btn:hover {
		color: var(--accent-teal);
	}
	.card-btn.delete:hover {
		color: var(--accent-red);
	}
	.card-btn.pin:hover {
		color: var(--accent-red);
	}
	.card-btn.pin.pinned {
		color: var(--accent-red);
	}

	/* Payment Status Box */
	.payment-status-box {
		margin-bottom: 1rem;
		padding: 0.75rem;
		border-left: 3px solid;
		border-radius: 4px;
	}
	.payment-status-label {
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	.payment-status-text {
		font-size: 0.9rem;
		color: var(--secondary-text);
	}

	/* Cue Progress Bar */
	.cue-progress-bar {
		margin-left: 1rem;
		flex: 1;
		max-width: 200px;
		display: flex;
		height: 20px;
		border-radius: 4px;
		overflow: hidden;
		background: #f0f0f0;
		cursor: pointer;
		border: none;
		padding: 0;
	}
	.progress-segment {
		display: inline-block;
		height: 100%;
	}
	.progress-segment.to-write {
		background: #ff6b6b;
	}
	.progress-segment.written {
		background: #ff922b;
	}
	.progress-segment.revisions {
		background: #ffd93d;
	}
	.progress-segment.approved {
		background: #51cf66;
	}

	/* Hours Logger Header */
	.hours-logger-header {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.hours-logger-header span,
	.hours-logger-header .cue-tracker-link {
		flex: 1;
		text-align: center;
	}
	.cue-tracker-link {
		max-width: 200px;
		cursor: pointer;
		color: var(--accent-teal) !important;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
	}
	.cue-tracker-link:hover {
		text-decoration: underline;
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
		overflow-y: auto;
		align-items: center;
		justify-content: center;
		padding: 2rem 0;
	}

	.modal-content {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		margin: auto;
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
	select,
	textarea {
		width: 100%;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	textarea {
		resize: vertical;
		min-height: 80px;
	}

	.scope-section {
		margin-bottom: 1rem;
	}

	.scope-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.scope-row {
		display: grid;
		grid-template-columns: 100px 1fr;
		align-items: center;
		gap: 0.5rem;
	}

	.scope-row label {
		font-size: 0.85rem;
		margin: 0;
		text-align: right;
	}

	.scope-row input {
		padding: 0.5rem;
	}

	.hours-logger-section {
		margin-bottom: 1rem;
	}

	.hours-grid {
		display: grid;
		gap: 0.75rem;
	}

	.hours-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.hours-row label {
		font-size: 0.85rem;
		margin: 0;
		width: 100px;
		text-align: right;
	}

	.hours-row input {
		width: 50px;
		padding: 0.5rem;
		text-align: left;
	}

	.hours-row span {
		font-size: 0.85rem;
		color: var(--muted-text);
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
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
	.btn-secondary {
		background: var(--subtle-text);
		color: white;
	}
	.btn-secondary:hover {
		background: var(--secondary-text);
	}
	.btn-invoice {
		background: var(--accent-blue);
		color: white;
	}
	.btn-invoice:hover {
		background: #0069b3;
	}

	@media (max-width: 1024px) {
		.board {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.board {
			grid-template-columns: 1fr;
		}
	}
</style>
