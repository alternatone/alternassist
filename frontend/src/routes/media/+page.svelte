<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { projectsAPI } from '$lib/api/projects';
	import { filesAPI } from '$lib/api/files';

	// State
	let projects = $state<any[]>([]);
	let currentFiles = $state<any[]>([]);
	let currentProject = $state<number | null>(null);
	let searchTerm = $state('');
	let sortColumn = $state('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');

	// UI state
	let showProjectList = $state(true);
	let uploadProgress = $state(0);
	let isUploading = $state(false);
	let uploadFileName = $state('');

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

	async function loadFiles(projectId: number) {
		try {
			const files = await filesAPI.getByProject(projectId);
			currentFiles = files.map((file: any) => ({
				id: file.id,
				name: file.original_name || file.filename,
				modified: file.uploaded_at,
				size: file.file_size,
				type: getFileType(file.mime_type),
				mimeType: file.mime_type
			}));
		} catch (error) {
			console.error('Error loading files:', error);
			currentFiles = [];
		}
	}

	function openProject(projectId: number) {
		currentProject = projectId;
		showProjectList = false;
		loadFiles(projectId);
	}

	function backToProjects() {
		currentProject = null;
		showProjectList = true;
	}

	async function handleFileUpload(e: Event) {
		if (!currentProject) return;

		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);
		if (files.length === 0) return;

		isUploading = true;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			uploadFileName = file.name;

			try {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('project_id', currentProject.toString());

				await filesAPI.upload(formData);

				uploadProgress = ((i + 1) / files.length) * 100;
			} catch (error) {
				console.error('Upload error:', error);
				alert(`Failed to upload ${file.name}`);
			}
		}

		// Reset
		setTimeout(() => {
			isUploading = false;
			uploadProgress = 0;
			uploadFileName = '';
			input.value = '';
			if (currentProject) loadFiles(currentProject);
		}, 500);
	}

	async function deleteFile(fileId: number, fileName: string) {
		if (!confirm(`Delete "${fileName}"?`)) return;

		try {
			await filesAPI.delete(fileId);
			if (currentProject) await loadFiles(currentProject);
		} catch (error) {
			console.error('Delete error:', error);
			alert('Failed to delete file');
		}
	}

	function downloadFile(fileId: number) {
		window.location.href = `/api/files/${fileId}/download`;
	}

	function playMedia(fileId: number) {
		if (!currentProject) return;
		goto(`/media/review?file=${fileId}&project=${currentProject}`);
	}

	function sortBy(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function getFileType(mimeType: string): string {
		if (!mimeType) return 'file';
		if (mimeType.startsWith('video/')) return 'video';
		if (mimeType.startsWith('audio/')) return 'audio';
		if (mimeType.startsWith('image/')) return 'image';
		if (mimeType.includes('pdf')) return 'pdf';
		return 'file';
	}

	function formatFileSize(bytes: number): string {
		if (!bytes || bytes === 0) return '0 B';
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - date.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// Filtered and sorted files
	const displayFiles = $derived.by(() => {
		let filtered = currentFiles;

		// Search filter
		if (searchTerm) {
			filtered = filtered.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
		}

		// Sort
		filtered.sort((a, b) => {
			let aVal: any, bVal: any;

			switch (sortColumn) {
				case 'name':
					aVal = a.name.toLowerCase();
					bVal = b.name.toLowerCase();
					break;
				case 'modified':
					aVal = new Date(a.modified);
					bVal = new Date(b.modified);
					break;
				case 'size':
					aVal = a.size || 0;
					bVal = b.size || 0;
					break;
				case 'type':
					aVal = a.type;
					bVal = b.type;
					break;
				default:
					return 0;
			}

			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});

		return filtered;
	});

	const totalSize = $derived(displayFiles.reduce((sum, f) => sum + (f.size || 0), 0));

	const currentProjectData = $derived(projects.find((p) => p.id === currentProject));
</script>

<svelte:head>
	<title>Media - Alternassist</title>
</svelte:head>

<div class="browser-container">
	{#if showProjectList}
		<!-- Project List -->
		<div class="browser-header">
			<h1>Media Projects</h1>
		</div>

		<div class="file-table-container">
			<table class="file-table">
				<thead>
					<tr>
						<th>Project Name</th>
						<th>Files</th>
						<th>Total Size</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if projects.length === 0}
						<tr>
							<td colspan="4" class="empty-state">No projects yet.</td>
						</tr>
					{:else}
						{#each projects as project}
							<tr class="project-row" onclick={() => openProject(project.id)}>
								<td>
									<div class="file-name">{project.name}</div>
								</td>
								<td>{project.file_count || 0} files</td>
								<td class="file-size">{formatFileSize(project.total_size || 0)}</td>
								<td>
									<button
										class="btn-action"
										onclick={(e) => {
											e.stopPropagation();
											openProject(project.id);
										}}
										title="Open"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
											<polyline points="15 3 21 3 21 9"></polyline>
											<line x1="10" y1="14" x2="21" y2="3"></line>
										</svg>
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<!-- File Browser -->
		<div class="browser-header">
			<div class="header-top">
				<button class="btn-primary" onclick={backToProjects}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="19" y1="12" x2="5" y2="12"></line>
						<polyline points="12 19 5 12 12 5"></polyline>
					</svg>
					back to projects
				</button>
				<h1>{currentProjectData?.name || 'Media Files'}</h1>
			</div>
		</div>

		<div class="browser-controls">
			<div class="search-box">
				<svg
					class="search-icon"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="11" cy="11" r="8"></circle>
					<path d="m21 21-4.35-4.35"></path>
				</svg>
				<input type="text" bind:value={searchTerm} placeholder="Search files..." />
			</div>
			<div class="upload-controls">
				<input
					type="file"
					id="fileInput"
					style="display: none"
					multiple
					onchange={handleFileUpload}
				/>
				<button class="btn-primary" onclick={() => document.getElementById('fileInput')?.click()}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="17 8 12 3 7 8"></polyline>
						<line x1="12" y1="3" x2="12" y2="15"></line>
					</svg>
					upload files
				</button>
			</div>
		</div>

		<!-- Upload Progress -->
		{#if isUploading}
			<div class="upload-progress">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {uploadProgress}%"></div>
				</div>
				<div class="progress-text">Uploading {uploadFileName}... ({uploadProgress.toFixed(0)}%)</div>
			</div>
		{/if}

		<div class="file-table-container">
			<table class="file-table">
				<thead>
					<tr>
						<th class="sortable" onclick={() => sortBy('name')}>Name</th>
						<th class="sortable" onclick={() => sortBy('modified')}>Date Modified</th>
						<th class="sortable" onclick={() => sortBy('size')}>Size</th>
						<th class="sortable" onclick={() => sortBy('type')}>Type</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if displayFiles.length === 0}
						<tr>
							<td colspan="5" class="empty-state">
								{searchTerm ? 'No files match your search.' : 'No files yet. Upload some files to get started.'}
							</td>
						</tr>
					{:else}
						{#each displayFiles as file}
							<tr>
								<td>
									<div class="file-name">{file.name}</div>
								</td>
								<td class="file-date">{formatDate(file.modified)}</td>
								<td class="file-size">{formatFileSize(file.size)}</td>
								<td>
									<span class="file-type-badge badge-{file.type}">
										{file.type}
									</span>
								</td>
								<td>
									<div class="file-actions">
										{#if file.type === 'video' || file.type === 'audio'}
											<button
												class="btn-action btn-play"
												onclick={() => playMedia(file.id)}
												title="Play"
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
													<path d="M8 5v14l11-7z" />
												</svg>
											</button>
										{/if}
										<button
											class="btn-action btn-download"
											onclick={() => downloadFile(file.id)}
											title="Download"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
												<polyline points="8 9 12 13 16 9"></polyline>
												<line x1="12" y1="3" x2="12" y2="13"></line>
											</svg>
										</button>
										<button
											class="btn-action btn-delete"
											onclick={() => deleteFile(file.id, file.name)}
											title="Delete"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="3 6 5 6 21 6"></polyline>
												<path
													d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
												></path>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
			<div class="stats-bar">
				<div class="stat-item">
					<span class="stat-value">{displayFiles.length}</span>
					<span>items</span>
				</div>
				<div class="stat-item">
					<span class="stat-value">{formatFileSize(totalSize)}</span>
					<span>total</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.browser-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	.browser-header {
		margin-bottom: 2rem;
	}

	.browser-header h1 {
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
		font-family: var(--font-display);
	}

	.header-top {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.browser-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.search-box {
		flex: 1;
		max-width: 400px;
		position: relative;
	}

	.search-box input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		border: var(--border-medium);
		border-radius: 8px;
		font-size: 0.9rem;
		font-family: var(--font-body);
		background: white;
	}

	.search-box input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--muted-text);
		pointer-events: none;
	}

	.upload-controls {
		display: flex;
		gap: 0.5rem;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: var(--accent-teal);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		font-family: var(--font-body);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary:hover {
		background: #3a8bc7;
	}

	.upload-progress {
		background: white;
		border: var(--border-light);
		border-radius: var(--radius-lg);
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.progress-bar {
		height: 6px;
		background: var(--bg-primary);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #ff6b6b 0%, #007acc 100%);
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 0.85rem;
		color: var(--subtle-text);
	}

	.file-table-container {
		background: white;
		border-radius: var(--radius-lg);
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		overflow: hidden;
	}

	.file-table {
		width: 100%;
		border-collapse: collapse;
	}

	.file-table thead {
		background: var(--bg-primary);
		border-bottom: var(--border-medium);
	}

	.file-table th {
		padding: 1rem 1.5rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--subtle-text);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-family: var(--font-body);
	}

	.file-table th.sortable {
		cursor: pointer;
		user-select: none;
		transition: color 0.2s;
	}

	.file-table th.sortable:hover {
		color: var(--accent-teal);
	}

	.file-table tbody tr {
		border-bottom: var(--border-light);
		transition: background 0.2s;
	}

	.file-table tbody tr:hover {
		background: var(--bg-primary);
	}

	.file-table tbody tr.project-row {
		cursor: pointer;
	}

	.file-table td {
		padding: 1rem 1.5rem;
		font-size: 0.9rem;
	}

	.file-name {
		color: var(--primary-text);
	}

	.file-size {
		color: var(--muted-text);
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.file-date {
		color: var(--subtle-text);
		font-size: 0.85rem;
	}

	.file-type-badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.badge-video {
		background: rgba(245, 87, 108, 0.1);
		color: #f5576c;
	}

	.badge-audio {
		background: rgba(0, 242, 254, 0.1);
		color: #00a8cc;
	}

	.badge-image {
		background: rgba(56, 249, 215, 0.1);
		color: #00b894;
	}

	.badge-pdf {
		background: rgba(255, 146, 43, 0.1);
		color: var(--accent-gold);
	}

	.badge-file {
		background: rgba(0, 0, 0, 0.05);
		color: var(--subtle-text);
	}

	.file-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-action {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--subtle-text);
		transition: color 0.2s;
		display: flex;
		align-items: center;
	}

	.btn-action:hover {
		color: var(--accent-teal);
	}

	.btn-play:hover {
		color: var(--accent-green);
	}

	.btn-download:hover {
		color: var(--accent-blue);
	}

	.btn-delete:hover {
		color: var(--accent-red);
	}

	.stats-bar {
		display: flex;
		gap: 2rem;
		padding: 1rem 1.5rem;
		background: var(--bg-primary);
		border-top: var(--border-light);
		font-size: 0.85rem;
		color: var(--subtle-text);
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-value {
		font-weight: 600;
		color: var(--primary-text);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted-text);
	}
</style>
