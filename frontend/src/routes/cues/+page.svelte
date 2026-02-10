<script lang="ts">
	import { cuesAPI, projectsAPI } from '$lib/api';
	import { onMount } from 'svelte';

	// State
	let currentProject = $state<number | null>(null);
	let currentCueId = $state<number | null>(null);
	let pendingThemeCueId = $state<number | null>(null);
	let cues = $state<Record<number, any[]>>({});
	let projects = $state<any[]>([]);
	let debounceTimers = $state<Record<string, any>>({});

	// Modal state
	let showCueModal = $state(false);
	let showThemeModal = $state(false);

	// Form state
	let formData = $state({
		number: '',
		title: '',
		startTime: '00:00:00',
		endTime: '00:00:00',
		theme: '',
		status: 'to-write',
		version: '',
		notes: ''
	});
	let newThemeName = $state('');

	// Stats
	const stats = $derived.by(() => {
		const projectCues = currentProject ? cues[currentProject] || [] : [];

		const normalizeStatus = (status: string) => {
			if (status === 'sketch') return 'to-write';
			if (status === 'recording') return 'written';
			if (status === 'mixing') return 'revisions';
			if (status === 'complete') return 'approved';
			return status;
		};

		const toWrite = projectCues.filter((c) => normalizeStatus(c.status) === 'to-write').length;
		const written = projectCues.filter((c) => normalizeStatus(c.status) === 'written').length;
		const revisions = projectCues.filter((c) => normalizeStatus(c.status) === 'revisions').length;
		const approved = projectCues.filter((c) => normalizeStatus(c.status) === 'approved').length;

		// Calculate minutes to write
		const toWriteCues = projectCues.filter((c) => normalizeStatus(c.status) === 'to-write');
		const minutesToWriteSeconds = toWriteCues.reduce((sum, cue) => {
			const duration = calculateDuration(cue.startTime, cue.endTime);
			return sum + duration;
		}, 0);
		const minutesToWrite = Math.ceil(minutesToWriteSeconds / 60);

		return {
			totalCues: projectCues.length,
			toWrite,
			written,
			revisions,
			approved,
			minutesToWrite,
			toWritePct: projectCues.length > 0 ? (toWrite / projectCues.length) * 100 : 0,
			writtenPct: projectCues.length > 0 ? (written / projectCues.length) * 100 : 0,
			revisionsPct: projectCues.length > 0 ? (revisions / projectCues.length) * 100 : 0,
			approvedPct: projectCues.length > 0 ? (approved / projectCues.length) * 100 : 0
		};
	});

	// Themes
	const existingThemes = $derived.by(() => {
		if (!currentProject) return [];
		const projectCues = cues[currentProject] || [];
		return [...new Set(projectCues.map((c) => c.theme || c.usage).filter((t) => t))];
	});

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		try {
			projects = await projectsAPI.getWithMusic();
		} catch (error) {
			console.error('Error loading projects:', error);
		}
	}

	async function loadProjectCues() {
		if (!currentProject) {
			cues = {};
			return;
		}

		// Lazy load cues if not already cached
		if (!cues[currentProject]) {
			try {
				const projectCues = await cuesAPI.getByProject(currentProject);
				cues[currentProject] = projectCues.map((cue: any) => ({
					id: cue.id,
					number: cue.cue_number,
					title: cue.title,
					startTime: cue.start_time || '00:00:00',
					endTime: cue.end_time || '00:00:00',
					theme: cue.theme || '',
					status: cue.status,
					version: cue.version || '',
					notes: cue.notes || '',
					duration: cue.duration
				}));
			} catch (error) {
				console.error('Error loading cues:', error);
				cues[currentProject] = [];
			}
		}
	}

	function timeToSeconds(timeStr: string): number {
		if (!timeStr) return 0;
		const parts = timeStr.split(':').map((p) => parseInt(p) || 0);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		} else if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		return 0;
	}

	function calculateDuration(start: string, end: string): number {
		return timeToSeconds(end) - timeToSeconds(start);
	}

	function formatDuration(seconds: number): string {
		const totalMins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${totalMins}:${secs.toString().padStart(2, '0')}`;
	}

	function debounce(key: string, func: Function, wait: number) {
		clearTimeout(debounceTimers[key]);
		debounceTimers[key] = setTimeout(func, wait);
	}

	async function updateCueField(cueId: number, fieldName: string, newValue: string) {
		if (!currentProject) return;

		const cue = cues[currentProject].find((c) => c.id === cueId);
		if (!cue) return;

		// Update local copy immediately
		cue[fieldName] = newValue;

		// If start or end time changed, recalculate duration
		if (fieldName === 'startTime' || fieldName === 'endTime') {
			const durationSeconds = calculateDuration(cue.startTime, cue.endTime);
			cue.duration = formatDuration(durationSeconds);
		}

		// Debounce API calls
		const debounceKey = `cue-${cueId}-${fieldName}`;
		debounce(
			debounceKey,
			async () => {
				const apiData = {
					cue_number: cue.number,
					title: cue.title,
					status: cue.status,
					duration: cue.duration,
					notes: cue.notes,
					start_time: cue.startTime,
					end_time: cue.endTime,
					theme: cue.theme,
					version: cue.version
				};

				try {
					await cuesAPI.update(cueId, apiData);
				} catch (error) {
					console.error('Error updating cue:', error);
					alert('Failed to update cue. Please try again.');
				}
			},
			500
		);
	}

	function openAddCueModal() {
		if (!currentProject) {
			alert('Please select a project first');
			return;
		}

		currentCueId = null;
		formData = {
			number: generateNextCueNumber(),
			title: '',
			startTime: '00:00:00',
			endTime: '00:00:00',
			theme: '',
			status: 'to-write',
			version: '',
			notes: ''
		};
		showCueModal = true;
	}

	function generateNextCueNumber(): string {
		const projectCues = currentProject ? cues[currentProject] || [] : [];
		if (projectCues.length === 0) return '1m1';

		const numbers = projectCues.map((cue) => {
			const match = cue.number.match(/^(\d+)m(\d+)$/i);
			if (match) {
				return { reel: parseInt(match[1]), cue: parseInt(match[2]) };
			}
			return { reel: 1, cue: 0 };
		});

		const highest = numbers.reduce(
			(max, num) => {
				if (num.reel > max.reel) return num;
				if (num.reel === max.reel && num.cue > max.cue) return num;
				return max;
			},
			{ reel: 1, cue: 0 }
		);

		return `${highest.reel}m${highest.cue + 1}`;
	}

	function closeCueModal() {
		showCueModal = false;
		currentCueId = null;
	}

	async function saveCue() {
		if (!formData.number || !formData.title) {
			alert('Please fill in cue number and title');
			return;
		}

		if (!currentProject) return;

		try {
			const duration = calculateDuration(formData.startTime, formData.endTime);

			if (currentCueId) {
				// Update existing cue
				await cuesAPI.update(currentCueId, {
					cue_number: formData.number,
					title: formData.title,
					status: formData.status,
					duration: formatDuration(duration),
					notes: formData.notes,
					start_time: formData.startTime,
					end_time: formData.endTime,
					theme: formData.theme,
					version: formData.version
				});

				const cueIndex = cues[currentProject].findIndex((c) => c.id === currentCueId);
				cues[currentProject][cueIndex] = {
					id: currentCueId,
					number: formData.number,
					title: formData.title,
					startTime: formData.startTime,
					endTime: formData.endTime,
					theme: formData.theme,
					status: formData.status,
					version: formData.version,
					notes: formData.notes,
					duration: formatDuration(duration)
				};
			} else {
				// Create new cue
				const newCue = await cuesAPI.create({
					project_id: currentProject,
					cue_number: formData.number,
					title: formData.title,
					status: formData.status,
					duration: formatDuration(duration),
					notes: formData.notes,
					start_time: formData.startTime,
					end_time: formData.endTime,
					theme: formData.theme,
					version: formData.version
				});

				cues[currentProject].push({
					id: newCue.id,
					number: formData.number,
					title: formData.title,
					startTime: formData.startTime,
					endTime: formData.endTime,
					theme: formData.theme,
					status: formData.status,
					version: formData.version,
					notes: formData.notes,
					duration: formatDuration(duration)
				});
			}

			closeCueModal();
		} catch (error) {
			console.error('Error saving cue:', error);
			alert('Failed to save cue');
		}
	}

	function editCue(cueId: number) {
		if (!currentProject) return;

		const cue = cues[currentProject].find((c) => c.id === cueId);
		if (!cue) return;

		currentCueId = cueId;
		formData = {
			number: cue.number || '',
			title: cue.title || '',
			startTime: cue.startTime || '00:00:00',
			endTime: cue.endTime || '00:00:00',
			theme: cue.theme || '',
			status: cue.status || 'to-write',
			version: cue.version || '',
			notes: cue.notes || ''
		};
		showCueModal = true;
	}

	async function deleteCue(cueId: number) {
		if (!confirm('Delete this cue?')) return;

		try {
			await cuesAPI.delete(cueId);
			if (currentProject) {
				cues[currentProject] = cues[currentProject].filter((c) => c.id !== cueId);
			}
		} catch (error) {
			console.error('Error deleting cue:', error);
			alert('Failed to delete cue');
		}
	}

	function handleThemeChange(cueId: number, value: string) {
		if (value === '__ADD_NEW__') {
			pendingThemeCueId = cueId;
			showThemeModal = true;
		} else {
			updateCueField(cueId, 'theme', value);
		}
	}

	function handleModalThemeChange(value: string) {
		if (value === '__ADD_NEW__') {
			pendingThemeCueId = null;
			showThemeModal = true;
			formData.theme = '';
		}
	}

	async function saveNewTheme() {
		if (!newThemeName.trim()) return;

		if (pendingThemeCueId && currentProject) {
			await updateCueField(pendingThemeCueId, 'theme', newThemeName);
		} else {
			formData.theme = newThemeName;
		}

		showThemeModal = false;
		newThemeName = '';
		pendingThemeCueId = null;
	}

	function exportCueSheet() {
		if (!currentProject || !cues[currentProject] || cues[currentProject].length === 0) {
			alert('No cues to export');
			return;
		}

		const project = projects.find((p) => p.id === currentProject);
		const projectTitle = project ? project.name : 'Project';

		let csv =
			'Cue Number,Title,Start Time,End Time,Duration,Usage Type,Status,Current Version,Notes\n';
		cues[currentProject].forEach((cue) => {
			const duration = calculateDuration(cue.startTime, cue.endTime);
			const usageType = cue.usage || cue.theme || '';
			csv += `"${cue.number}","${cue.title}","${cue.startTime}","${cue.endTime}","${formatDuration(duration)}","${usageType}","${cue.status}","${cue.version || ''}","${cue.notes || ''}"\n`;
		});

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${projectTitle}_cue_sheet.csv`;
		a.click();
	}

	// Spotting notes import
	let spottingNotesInput: HTMLInputElement;

	function handleSpottingNotesImport(event: Event) {
		if (!currentProject) {
			alert('Please select a project first');
			(event.target as HTMLInputElement).value = '';
			return;
		}

		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = function (e) {
			const content = e.target?.result as string;

			if (content.includes('SESSION NAME:') || content.includes('TRACK LISTING')) {
				parseProToolsCues(content);
			} else {
				parseLogicProCues(content);
			}

			(event.target as HTMLInputElement).value = '';
		};
		reader.readAsText(file);
	}

	async function parseProToolsCues(content: string) {
		if (!currentProject) return;
		const lines = content.split('\n');
		const cueMap = new Map<string, { start: string; end: string; title: string }>();

		lines.forEach((line) => {
			const parts = line.trim().split('\t');
			if (parts.length >= 7) {
				const clipName = parts[2] ? parts[2].trim() : '';
				const startTime = parts[3] ? parts[3].trim() : '';
				const endTime = parts[4] ? parts[4].trim() : '';

				if (startTime.match(/\d{2}:\d{2}:\d{2}:\d{2}/) && endTime.match(/\d{2}:\d{2}:\d{2}:\d{2}/)) {
					const start = startTime.substring(0, 8);
					const end = endTime.substring(0, 8);

					let title = clipName
						.replace(/\.(wav|aif|aiff|mp3|L|R).*$/i, '')
						.replace(/_\d{2}(-\d{2})?$/, '')
						.replace(/[._-]+/g, ' ')
						.trim();

					if (!cueMap.has(start) && title) {
						cueMap.set(start, { start, end, title });
					}
				}
			}
		});

		let importedCount = 0;
		const cuesArray = Array.from(cueMap.values());

		if (!cues[currentProject]) cues[currentProject] = [];

		for (let i = 0; i < cuesArray.length; i++) {
			const cue = cuesArray[i];
			const cueNumber = `1m${i + 1}`;
			try {
				const newCue = await cuesAPI.create({
					project_id: currentProject,
					cue_number: cueNumber,
					title: cue.title,
					start_time: cue.start,
					end_time: cue.end,
					status: 'to-write',
					duration: formatDuration(calculateDuration(cue.start, cue.end))
				});
				cues[currentProject].push({
					id: newCue.id,
					number: cueNumber,
					title: cue.title,
					startTime: cue.start,
					endTime: cue.end,
					theme: '',
					status: 'to-write',
					version: '',
					notes: '',
					duration: formatDuration(calculateDuration(cue.start, cue.end))
				});
				importedCount++;
			} catch (error) {
				console.error('Error creating imported cue:', error);
			}
		}

		alert(`Successfully imported ${importedCount} cues from Pro Tools!`);
	}

	async function parseLogicProCues(content: string) {
		if (!currentProject) return;
		const lines = content.split('\n');
		const sessionData = { bpm: 120, timeSig: [4, 4], fps: 23.98, projectStart: '01:00:00:00' };

		lines.forEach((line) => {
			const trimmed = line.trim();
			if (trimmed.includes('BPM:')) {
				const match = trimmed.match(/(\d+\.?\d*)/);
				if (match) sessionData.bpm = parseFloat(match[1]);
			}
			if (trimmed.includes('Time Signature:')) {
				const match = trimmed.match(/(\d+)\/(\d+)/);
				if (match) sessionData.timeSig = [parseInt(match[1]), parseInt(match[2])];
			}
			if (trimmed.includes('FPS:')) {
				const match = trimmed.match(/(\d+\.?\d*)/);
				if (match) sessionData.fps = parseFloat(match[1]);
			}
			if (trimmed.includes('Project Start:')) {
				const match = trimmed.match(/(\d{2}:\d{2}:\d{2}:\d{2})/);
				if (match) sessionData.projectStart = match[1];
			}
		});

		const cueLines: string[] = [];
		let inCueBlock = false;
		lines.forEach((line) => {
			const trimmed = line.trim();
			if (trimmed === '```' || trimmed.includes('Start Position')) {
				inCueBlock = !inCueBlock;
				return;
			}
			if (inCueBlock && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-') && trimmed.includes('|')) {
				cueLines.push(trimmed);
			}
		});

		if (!cues[currentProject]) cues[currentProject] = [];
		let importedCount = 0;

		for (let i = 0; i < cueLines.length; i++) {
			const parts = cueLines[i].split('|').map((p) => p.trim());
			if (parts.length >= 2) {
				const timecode = convertLogicCue(parts[0], parts[1], sessionData.bpm, sessionData.timeSig);
				if (timecode) {
					const cueNumber = `1m${i + 1}`;
					const title = parts[2] || '';
					try {
						const newCue = await cuesAPI.create({
							project_id: currentProject,
							cue_number: cueNumber,
							title,
							start_time: timecode.start,
							end_time: timecode.end,
							status: 'to-write',
							duration: formatDuration(calculateDuration(timecode.start, timecode.end))
						});
						cues[currentProject].push({
							id: newCue.id,
							number: cueNumber,
							title,
							startTime: timecode.start,
							endTime: timecode.end,
							theme: '',
							status: 'to-write',
							version: '',
							notes: '',
							duration: formatDuration(calculateDuration(timecode.start, timecode.end))
						});
						importedCount++;
					} catch (error) {
						console.error('Error creating imported cue:', error);
					}
				}
			}
		}

		alert(`Successfully imported ${importedCount} cues!`);
	}

	function convertLogicCue(startPos: string, lengthPos: string, bpm: number, timeSig: number[]): { start: string; end: string } | null {
		try {
			const startParts = startPos.split(/\s+/).map(Number);
			const lengthParts = lengthPos.split(/\s+/).map(Number);
			if (startParts.length !== 4 || lengthParts.length !== 4) return null;

			const [sb, sbe, sd, st] = startParts;
			const [lb, lbe, ld, lt] = lengthParts;

			const halfNotesPerBar = timeSig[0] / (timeSig[1] / 2);
			const secondsPerBar = (60 / bpm) * halfNotesPerBar;
			const secondsPerBeat = secondsPerBar / 4;

			const posToSeconds = (bar: number, beat: number, div: number, tick: number) => {
				return ((bar - 1) * secondsPerBar) +
					((beat - 1) * secondsPerBeat) +
					((div - 1) * secondsPerBeat / 4) +
					((tick - 1) * secondsPerBeat / 960);
			};

			const start = posToSeconds(sb, sbe, sd, st);
			const length = posToSeconds(lb + 1, lbe + 1, ld + 1, lt + 1) - posToSeconds(1, 1, 1, 1);
			const end = start + length;

			const offsetSeconds = 3600;
			const finalStart = start + offsetSeconds;
			const finalEnd = end + offsetSeconds;

			const toTC = (sec: number) => {
				const hh = Math.floor(sec / 3600);
				const mm = Math.floor((sec % 3600) / 60);
				const ss = Math.floor(sec % 60);
				return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
			};

			return { start: toTC(finalStart), end: toTC(finalEnd) };
		} catch (e) {
			console.error('Error converting cue:', e);
			return null;
		}
	}

	const projectCues = $derived(currentProject ? cues[currentProject] || [] : []);
</script>

<div class="tracker-container">
	<div class="header">
		<div class="header-left">
			<h1>Cue Tracker</h1>
			<select
				class="project-select"
				bind:value={currentProject}
				onchange={() => loadProjectCues()}
			>
			<option value={null}>select project...</option>
			{#each projects as project}
				<option value={project.id}>
					{project.name} ({project.scope_summary?.music_minutes || 0} mins)
				</option>
			{/each}
		</select>
		</div>
	</div>

	<div class="stats-bar">
		<div class="stat">
			<div class="stat-label">Total Cues</div>
			<div class="stat-value">{stats.totalCues}</div>
		</div>
		<div class="stat">
			<div class="stat-label">Cues to Write</div>
			<div class="stat-value">{stats.toWrite}</div>
		</div>
		<div class="stat">
			<div class="stat-label">Minutes to Write</div>
			<div class="stat-value">{stats.minutesToWrite}</div>
		</div>
		<div class="stat">
			<div class="stat-label">Approved</div>
			<div class="stat-value">{stats.approved}</div>
		</div>
	</div>

	<div class="actions">
		<button class="btn btn-gradient" onclick={openAddCueModal}>+ add cue</button>
		<input type="file" accept=".txt" style="display: none;" bind:this={spottingNotesInput} onchange={handleSpottingNotesImport} />
		<button class="btn btn-secondary" onclick={() => spottingNotesInput.click()}>import spotting notes</button>
		<button class="btn btn-secondary" onclick={exportCueSheet}>export cue sheet</button>
	</div>

	<div class="progress-bar-container">
		<div class="progress-bar">
			{#if stats.toWrite > 0}
				<div class="progress-segment progress-to-write" style="width: {stats.toWritePct}%">
					{stats.toWrite}
				</div>
			{/if}
			{#if stats.written > 0}
				<div class="progress-segment progress-written" style="width: {stats.writtenPct}%">
					{stats.written}
				</div>
			{/if}
			{#if stats.revisions > 0}
				<div class="progress-segment progress-revisions" style="width: {stats.revisionsPct}%">
					{stats.revisions}
				</div>
			{/if}
			{#if stats.approved > 0}
				<div class="progress-segment progress-approved" style="width: {stats.approvedPct}%">
					{stats.approved}
				</div>
			{/if}
		</div>
	</div>

	<div class="cue-table-container">
		<table class="cue-table">
			<thead>
				<tr>
					<th>Cue #</th>
					<th>Title</th>
					<th>Start</th>
					<th>End</th>
					<th>Duration</th>
					<th>Theme</th>
					<th>Status</th>
					<th>Current Version</th>
					<th>Notes</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if !currentProject}
					<tr>
						<td colspan="10">
							<div class="empty-state">
								<p>Select a project to view cues</p>
							</div>
						</td>
					</tr>
				{:else if projectCues.length === 0}
					<tr>
						<td colspan="10">
							<div class="empty-state">
								<p>No cues yet. Add a cue to get started.</p>
							</div>
						</td>
					</tr>
				{:else}
					{#each projectCues as cue (cue.id)}
						{@const duration = calculateDuration(cue.startTime, cue.endTime)}
						{@const displayStatus = cue.status === 'sketch' ? 'to-write' : cue.status === 'recording' ? 'written' : cue.status === 'mixing' ? 'revisions' : cue.status === 'complete' ? 'approved' : cue.status}
						<tr>
							<td>
								<input
									type="text"
									class="inline-theme-input cue-number"
									value={cue.number || ''}
									onblur={(e) => updateCueField(cue.id, 'number', e.currentTarget.value)}
									placeholder="1m1"
								/>
							</td>
							<td>
								<input
									type="text"
									class="inline-theme-input"
									value={cue.title || ''}
									onblur={(e) => updateCueField(cue.id, 'title', e.currentTarget.value)}
									placeholder="Cue title"
								/>
							</td>
							<td>
								<input
									type="text"
									class="inline-theme-input cue-timing"
									value={cue.startTime || ''}
									onblur={(e) => updateCueField(cue.id, 'startTime', e.currentTarget.value)}
									placeholder="00:00:00"
								/>
							</td>
							<td>
								<input
									type="text"
									class="inline-theme-input cue-timing"
									value={cue.endTime || ''}
									onblur={(e) => updateCueField(cue.id, 'endTime', e.currentTarget.value)}
									placeholder="00:00:00"
								/>
							</td>
							<td><span class="cue-timing">{formatDuration(duration)}</span></td>
							<td>
								<select
									class="inline-theme-input"
									value={cue.theme || ''}
									onchange={(e) => handleThemeChange(cue.id, e.currentTarget.value)}
								>
									<option value="">select theme...</option>
									{#each existingThemes as theme}
										<option value={theme}>{theme}</option>
									{/each}
									<option value="__ADD_NEW__">+ add new theme...</option>
								</select>
							</td>
							<td>
								<select
									class="inline-theme-input status-{displayStatus}"
									value={displayStatus}
									onchange={(e) => updateCueField(cue.id, 'status', e.currentTarget.value)}
								>
									<option value="to-write">To Write</option>
									<option value="written">Written</option>
									<option value="revisions">Revisions</option>
									<option value="approved">Approved</option>
								</select>
							</td>
							<td>
								<input
									type="text"
									class="inline-theme-input"
									value={cue.version || ''}
									onblur={(e) => updateCueField(cue.id, 'version', e.currentTarget.value)}
									placeholder="v1"
								/>
							</td>
							<td>
								<input
									type="text"
									class="inline-theme-input"
									value={cue.notes || ''}
									onblur={(e) => updateCueField(cue.id, 'notes', e.currentTarget.value)}
									placeholder="Notes"
								/>
							</td>
							<td>
								<div class="action-cell">
									<button class="icon-btn" onclick={() => editCue(cue.id)} title="Edit">
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
											<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
											<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
										</svg>
									</button>
									<button class="icon-btn delete" onclick={() => deleteCue(cue.id)} title="Delete">
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
				{/if}
			</tbody>
		</table>
	</div>
</div>

<!-- Cue Modal -->
{#if showCueModal}
	<div class="modal active" onclick={(e) => e.target === e.currentTarget && closeCueModal()}>
		<div class="modal-content">
			<div class="modal-header">
				<h3 class="modal-title">{currentCueId ? 'Edit Cue' : 'Add Cue'}</h3>
			</div>
			<div class="form-grid">
				<div class="form-group">
					<label for="cueNumber">Cue Number</label>
					<input type="text" id="cueNumber" bind:value={formData.number} placeholder="1M1" />
				</div>
				<div class="form-group">
					<label for="cueTitle">Cue Title</label>
					<input type="text" id="cueTitle" bind:value={formData.title} placeholder="Main Theme" />
				</div>
				<div class="form-group">
					<label for="startTime">Start Time (HH:MM:SS)</label>
					<input type="text" id="startTime" bind:value={formData.startTime} placeholder="00:00:00" />
				</div>
				<div class="form-group">
					<label for="endTime">End Time (HH:MM:SS)</label>
					<input type="text" id="endTime" bind:value={formData.endTime} placeholder="00:00:00" />
				</div>
				<div class="form-group">
					<label for="cueTheme">Theme</label>
					<select
						id="cueTheme"
						bind:value={formData.theme}
						onchange={(e) => handleModalThemeChange(e.currentTarget.value)}
					>
						<option value="">select theme...</option>
						{#each existingThemes as theme}
							<option value={theme}>{theme}</option>
						{/each}
						<option value="__ADD_NEW__">+ add new theme...</option>
					</select>
				</div>
				<div class="form-group">
					<label for="cueStatus">Status</label>
					<select id="cueStatus" bind:value={formData.status}>
						<option value="to-write">To Write</option>
						<option value="written">Written</option>
						<option value="revisions">Revisions</option>
						<option value="approved">Approved</option>
					</select>
				</div>
				<div class="form-group">
					<label for="cueVersion">Current Version</label>
					<input type="text" id="cueVersion" bind:value={formData.version} placeholder="v1" />
				</div>
				<div class="form-group full-width">
					<label for="cueNotes">Notes</label>
					<textarea
						id="cueNotes"
						bind:value={formData.notes}
						placeholder="Instrumentation, mood, client feedback..."
					></textarea>
				</div>
			</div>
			<div class="form-actions">
				<button class="btn btn-secondary" onclick={closeCueModal}>cancel</button>
				<button class="btn btn-primary" onclick={saveCue}>save cue</button>
			</div>
		</div>
	</div>
{/if}

<!-- Theme Modal -->
{#if showThemeModal}
	<div class="modal active" onclick={(e) => e.target === e.currentTarget && (showThemeModal = false)}>
		<div class="modal-content" style="max-width: 400px;">
			<div class="modal-header">
				<h3 class="modal-title">add new theme</h3>
			</div>
			<div class="form-group">
				<label for="newThemeName">theme name</label>
				<input type="text" id="newThemeName" bind:value={newThemeName} placeholder="Enter theme name" />
			</div>
			<div class="form-actions">
				<button class="btn btn-secondary" onclick={() => (showThemeModal = false)}>cancel</button>
				<button class="btn btn-primary" onclick={saveNewTheme}>add theme</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow: auto !important;
	}

	.tracker-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		margin-bottom: 2rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-left h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.project-select {
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
		width: 200px;
	}

	.stats-bar {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1rem;
		border: var(--border-light);
		text-align: center;
	}

	.stat-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted-text);
		margin-bottom: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
		font-family: var(--font-display);
		color: var(--accent-teal);
	}

	.actions {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.progress-bar-container {
		margin-bottom: 2rem;
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1rem;
		border: var(--border-light);
	}

	.progress-bar {
		display: flex;
		height: 30px;
		border-radius: 6px;
		overflow: hidden;
		background: #f0f0f0;
	}

	.progress-segment {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
		color: white;
		transition: width 0.3s ease;
	}

	.progress-to-write {
		background: var(--accent-red);
	}
	.progress-written {
		background: var(--accent-gold);
	}
	.progress-revisions {
		background: #ffd93d;
		color: var(--primary-text);
	}
	.progress-approved {
		background: var(--accent-green);
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

	.btn-secondary {
		background: var(--subtle-text);
		color: white;
	}
	.btn-secondary:hover {
		background: var(--secondary-text);
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

	.cue-table-container {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
	}

	.cue-table {
		width: 100%;
		border-collapse: collapse;
	}

	.cue-table th {
		background: var(--bg-primary);
		padding: 0.75rem 0.5rem;
		text-align: left;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--subtle-text);
		border-bottom: 2px solid var(--border-medium);
		position: sticky;
		top: 0;
	}

	.cue-table td {
		padding: 0.75rem 0.5rem;
		border-bottom: var(--border-light);
		font-size: 0.9rem;
		color: var(--secondary-text);
		text-align: left;
	}

	.cue-table tr:hover {
		background: var(--bg-primary);
	}

	.cue-table th:first-child,
	.cue-table td:first-child {
		width: 80px;
		max-width: 80px;
	}
	.cue-table th:nth-child(3),
	.cue-table td:nth-child(3) {
		width: 100px;
		max-width: 100px;
	}
	.cue-table th:nth-child(4),
	.cue-table td:nth-child(4) {
		width: 100px;
		max-width: 100px;
	}
	.cue-table th:nth-child(5),
	.cue-table td:nth-child(5) {
		width: 90px;
		max-width: 90px;
	}
	.cue-table th:nth-child(6),
	.cue-table td:nth-child(6) {
		width: 150px;
		max-width: 150px;
	}

	.cue-number {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-teal);
	}

	.cue-timing {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.inline-theme-input {
		width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		font-size: 0.85rem;
		font-family: var(--font-body);
		transition: all 0.2s;
		color: var(--subtle-text);
	}

	.inline-theme-input:hover {
		background: var(--bg-primary);
		border-color: var(--border-light);
	}

	.inline-theme-input:focus {
		outline: none;
		border-color: var(--accent-teal);
		background: white;
	}

	select.inline-theme-input {
		cursor: pointer;
		font-weight: 600;
	}

	select.inline-theme-input.status-to-write {
		color: var(--accent-red);
	}
	select.inline-theme-input.status-written {
		color: var(--accent-gold);
	}
	select.inline-theme-input.status-revisions {
		color: #ffd93d;
	}
	select.inline-theme-input.status-approved {
		color: var(--accent-green);
	}

	input[list].inline-theme-input {
		font-weight: 600;
		color: var(--accent-teal);
		cursor: pointer;
	}

	.action-cell {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		font-size: 1rem;
		color: var(--subtle-text);
		transition: color 0.2s;
	}

	.icon-btn:hover {
		color: var(--accent-teal);
	}

	.icon-btn.delete:hover {
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
		max-width: 600px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal-header {
		margin-bottom: 1.5rem;
	}

	.modal-title {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
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
		height: 80px;
	}

	#cueNumber {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-teal);
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

	@media (max-width: 768px) {
		.stats-bar {
			grid-template-columns: 1fr 1fr;
		}
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
