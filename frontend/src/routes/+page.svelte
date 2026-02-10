<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { projectsAPI } from '$lib/api/projects';
	import { estimatesAPI } from '$lib/api/estimates';
	import { cuesAPI } from '$lib/api/cues';
	import { hoursAPI } from '$lib/api/hours';

	// State
	let projects = $state<any[]>([]);
	let cuesByProject = $state<Record<string, any[]>>({});
	let hoursLogByProject = $state<Record<string, Record<string, number>>>({});

	onMount(async () => {
		await loadDashboard();
	});

	async function loadDashboard() {
		try {
			// Load projects
			const allProjects = await projectsAPI.getAll();

			// Load scope data for all projects
			const scopePromises = allProjects.map(async (p) => {
				try {
					const scopeData = await estimatesAPI.getScopeByProject(p.id);
					return { projectId: p.id, scope: scopeData };
				} catch (e) {
					return { projectId: p.id, scope: null };
				}
			});

			const scopesData = await Promise.all(scopePromises);
			const scopeMap: Record<string, any> = {};
			scopesData.forEach(({ projectId, scope }) => {
				scopeMap[projectId] = scope;
			});

			// Transform projects
			projects = allProjects
				.filter((p) => p.pinned)
				.map((p) => {
					const scopeData = scopeMap[p.id] || {};
					const scope = {
						music_minutes: p.music_coverage || scopeData.music_minutes || 0,
						dialogue_hours: scopeData.dialogue_hours || 0,
						sound_design_hours: scopeData.sound_design_hours || 0,
						mix_hours: scopeData.mix_hours || 0,
						revision_hours: scopeData.revision_hours || 0
					};

					// Check if notes contains JSON scope data
					let displayNotes = '';
					try {
						const parsed = JSON.parse(p.notes);
						if (
							!(
								parsed.musicMinutes !== undefined ||
								parsed.dialogueHours !== undefined ||
								parsed.soundDesignHours !== undefined ||
								parsed.mixHours !== undefined
							)
						) {
							displayNotes = p.notes;
						}
					} catch (e) {
						displayNotes = p.notes || '';
					}

					return {
						id: p.id.toString(),
						title: p.name,
						client: p.client_name || '',
						notes: displayNotes,
						scopeData: scope,
						status: p.status || '',
						pinned: Boolean(p.pinned)
					};
				});

			// Load cues for all projects
			const allCues = await cuesAPI.getAll();
			const cuesMap: Record<string, any[]> = {};
			allCues.forEach((cue) => {
				if (!cuesMap[cue.project_id]) {
					cuesMap[cue.project_id] = [];
				}
				cuesMap[cue.project_id].push(cue);
			});
			cuesByProject = cuesMap;

			// Load hours log for all projects
			const allHours = await hoursAPI.getAll();
			const hoursMap: Record<string, Record<string, number>> = {};
			allHours.forEach((log) => {
				if (!hoursMap[log.project_id]) {
					hoursMap[log.project_id] = {};
				}
				const category = log.category || 'uncategorized';
				if (!hoursMap[log.project_id][category]) {
					hoursMap[log.project_id][category] = 0;
				}
				hoursMap[log.project_id][category] += parseFloat(log.hours) || 0;
			});
			hoursLogByProject = hoursMap;
		} catch (error) {
			console.error('Error loading dashboard:', error);
		}
	}

	function getCueStats(projectId: string) {
		const projectCues = cuesByProject[projectId] || [];
		const toWrite = projectCues.filter((c) => c.status === 'to-write').length;
		const written = projectCues.filter((c) => c.status === 'written').length;
		const revisions = projectCues.filter((c) => c.status === 'revisions').length;
		const approved = projectCues.filter((c) => c.status === 'approved').length;
		const totalCues = projectCues.length;

		return { toWrite, written, revisions, approved, totalCues };
	}

	function getHoursLogged(projectId: string) {
		const loggedHours = hoursLogByProject[projectId] || {};
		return {
			dialogue: loggedHours['dialogue'] || 0,
			soundDesign: loggedHours['sound-design'] || 0,
			mix: loggedHours['mix'] || 0,
			revisions: loggedHours['revisions'] || 0
		};
	}
</script>

<svelte:head>
	<title>Dashboard - Alternassist</title>
</svelte:head>

<div class="dashboard-container">
	{#if projects.length === 0}
		<div class="empty-dashboard">
			<h2>Nothing to see here</h2>
			<p>Pin a project to get started.</p>
		</div>
	{:else}
		<div class="dashboard-overview">
			{#each projects as project}
				{@const cueStats = getCueStats(project.id)}
				{@const hoursLogged = getHoursLogged(project.id)}
				{@const scope = project.scopeData || {}}

				<div class="overview-card" onclick={() => goto('/kanban')}>
					<h3 class="overview-title">{project.title}</h3>

					{#if project.notes}
						<div class="creative-direction">
							<div class="section-label">Creative Direction</div>
							<div class="creative-notes">{project.notes}</div>
						</div>
					{/if}

					{#if project.status && (project.status.includes('deposit') || project.status.includes('invoiced') || project.status.includes('received'))}
						<div
							class="payment-status"
							style="background: {project.status.includes('received')
								? '#d3f9d8'
								: project.status.includes('invoiced')
									? '#fff3bf'
									: '#e7f5ff'}; border-left-color: {project.status.includes('received')
								? 'var(--accent-green)'
								: project.status.includes('invoiced')
									? 'var(--accent-gold)'
									: 'var(--accent-teal)'};"
						>
							<div
								class="section-label"
								style="color: {project.status.includes('received')
									? 'var(--accent-green)'
									: project.status.includes('invoiced')
										? 'var(--accent-gold)'
										: 'var(--accent-teal)'};"
							>
								Payment Status
							</div>
							<div class="payment-text">{project.status}</div>
						</div>
					{/if}

					{#if cueStats.totalCues > 0}
						<div class="cue-status-section">
							<div class="section-label">Music Cue Status</div>
							<div class="cue-progress-bar">
								{#if cueStats.toWrite > 0}
									<div
										class="cue-segment to-write"
										style="width: {(cueStats.toWrite / cueStats.totalCues) * 100}%"
									>
										{cueStats.toWrite}
									</div>
								{/if}
								{#if cueStats.written > 0}
									<div
										class="cue-segment written"
										style="width: {(cueStats.written / cueStats.totalCues) * 100}%"
									>
										{cueStats.written}
									</div>
								{/if}
								{#if cueStats.revisions > 0}
									<div
										class="cue-segment revisions"
										style="width: {(cueStats.revisions / cueStats.totalCues) * 100}%"
									>
										{cueStats.revisions}
									</div>
								{/if}
								{#if cueStats.approved > 0}
									<div
										class="cue-segment approved"
										style="width: {(cueStats.approved / cueStats.totalCues) * 100}%"
									>
										{cueStats.approved}
									</div>
								{/if}
							</div>
						</div>
					{/if}

					{#if scope.dialogue_hours > 0 || scope.sound_design_hours > 0 || scope.mix_hours > 0 || scope.revision_hours > 0}
						<div class="hour-tracking-section">
							<div class="section-label">Hour Tracking</div>

							{#if scope.dialogue_hours > 0}
								<div class="hour-item">
									<div class="hour-header">
										<span>Dialogue</span>
										<span>{hoursLogged.dialogue.toFixed(1)} / {scope.dialogue_hours}h</span>
									</div>
									<div class="hour-progress-bar">
										<div
											class="hour-progress-fill"
											style="width: {Math.min(100, (hoursLogged.dialogue / scope.dialogue_hours) * 100)}%"
										></div>
									</div>
								</div>
							{/if}

							{#if scope.sound_design_hours > 0}
								<div class="hour-item">
									<div class="hour-header">
										<span>Sound Design</span>
										<span>{hoursLogged.soundDesign.toFixed(1)} / {scope.sound_design_hours}h</span>
									</div>
									<div class="hour-progress-bar">
										<div
											class="hour-progress-fill"
											style="width: {Math.min(100, (hoursLogged.soundDesign / scope.sound_design_hours) * 100)}%"
										></div>
									</div>
								</div>
							{/if}

							{#if scope.mix_hours > 0}
								<div class="hour-item">
									<div class="hour-header">
										<span>Mix</span>
										<span>{hoursLogged.mix.toFixed(1)} / {scope.mix_hours}h</span>
									</div>
									<div class="hour-progress-bar">
										<div
											class="hour-progress-fill"
											style="width: {Math.min(100, (hoursLogged.mix / scope.mix_hours) * 100)}%"
										></div>
									</div>
								</div>
							{/if}

							{#if scope.revision_hours > 0}
								<div class="hour-item">
									<div class="hour-header">
										<span>Revisions</span>
										<span>{hoursLogged.revisions.toFixed(1)} / {scope.revision_hours}h</span>
									</div>
									<div class="hour-progress-bar">
										<div
											class="hour-progress-fill"
											style="width: {Math.min(100, (hoursLogged.revisions / scope.revision_hours) * 100)}%"
										></div>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.dashboard-container {
		max-width: 1400px;
		margin: 0 auto;
	}

	.dashboard-overview {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.overview-card {
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		cursor: pointer;
		transition: transform 0.2s;
		display: flex;
		flex-direction: column;
		aspect-ratio: 3 / 2;
	}

	.overview-card:hover {
		transform: translateY(-2px);
	}

	.overview-title {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
	}

	.creative-direction {
		padding: 0.75rem;
		background: #f8f9fa;
		border-radius: 6px;
		margin-bottom: 0.75rem;
	}

	.section-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--subtle-text);
		margin-bottom: 0.35rem;
	}

	.creative-notes {
		font-size: 0.85rem;
		color: var(--secondary-text);
		line-height: 1.5;
		font-style: italic;
		overflow-wrap: break-word;
	}

	.payment-status {
		padding: 0.5rem;
		border-radius: 4px;
		border-left: 3px solid;
		margin-bottom: 0.75rem;
	}

	.payment-text {
		font-size: 0.85rem;
		color: var(--secondary-text);
	}

	.cue-status-section {
		margin-bottom: 0.75rem;
	}

	.cue-progress-bar {
		height: 20px;
		background: #f0f0f0;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
	}

	.cue-segment {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.cue-segment.to-write {
		background: #ff6b6b;
	}

	.cue-segment.written {
		background: #ff922b;
	}

	.cue-segment.revisions {
		background: #ffd93d;
		color: #1a1a1a;
	}

	.cue-segment.approved {
		background: #51cf66;
	}

	.hour-tracking-section {
		margin-bottom: 0.75rem;
	}

	.hour-item {
		margin-bottom: 0.35rem;
	}

	.hour-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--muted-text);
		margin-bottom: 0.15rem;
	}

	.hour-progress-bar {
		height: 6px;
		background: #f0f0f0;
		border-radius: 3px;
		overflow: hidden;
	}

	.hour-progress-fill {
		height: 100%;
		background: #469fe0;
	}

	.empty-dashboard {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--muted-text);
	}

	.empty-dashboard h2 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		color: var(--subtle-text);
	}

	.empty-dashboard p {
		font-size: 1rem;
	}
</style>
