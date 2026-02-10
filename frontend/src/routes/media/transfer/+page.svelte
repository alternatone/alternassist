<script lang="ts">
	import { onMount } from 'svelte';
	import { projectsAPI } from '$lib/api/projects';
	import { filesAPI } from '$lib/api/files';
	import { ftpAPI } from '$lib/api/ftp';

	// State
	let projects = $state<any[]>([]);
	let currentProject = $state<number | null>(null);
	let currentFiles = $state<any[]>([]);
	let searchTerm = $state('');
	let sortColumn = $state('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');

	// UI state
	let showProjectList = $state(true);
	let uploadProgress = $state(0);
	let isUploading = $state(false);
	let uploadFileName = $state('');

	// Modals
	let showNewProjectModal = $state(false);
	let showAssignFolderModal = $state(false);
	let showPlayerModal = $state(false);
	let playerSrc = $state('');
	let playerTitle = $state('');
	let playerType = $state<'video' | 'audio'>('video');

	// New project form
	let newProjectName = $state('');
	let newProjectPassword = $state('');
	let newProjectError = $state('');

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

	async function loadProjectFiles(projectId: number) {
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
		loadProjectFiles(projectId);
	}

	function backToProjects() {
		currentProject = null;
		showProjectList = true;
		currentFiles = [];
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
			if (currentProject) loadProjectFiles(currentProject);
		}, 500);
	}

	async function deleteFile(fileId: number, fileName: string) {
		if (!confirm(`Delete "${fileName}"?`)) return;

		try {
			await filesAPI.delete(fileId);
			if (currentProject) await loadProjectFiles(currentProject);
		} catch (error) {
			console.error('Delete error:', error);
			alert('Failed to delete file');
		}
	}

	function downloadFile(fileId: number) {
		window.location.href = `/api/files/${fileId}/download`;
	}

	function playMedia(fileId: number, fileName: string, mimeType: string) {
		const isVideo = mimeType.startsWith('video/');
		playerType = isVideo ? 'video' : 'audio';
		playerSrc = `/api/files/${fileId}/stream`;
		playerTitle = fileName;
		showPlayerModal = true;
	}

	function closePlayer() {
		showPlayerModal = false;
		playerSrc = '';
		playerTitle = '';
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

	async function handleCreateProject(e: Event) {
		e.preventDefault();
		newProjectError = '';

		const name = newProjectName.trim();
		if (!name) {
			newProjectError = 'Please enter a project name';
			return;
		}

		try {
			await projectsAPI.create({
				name,
				client_password: newProjectPassword || undefined,
				status: 'prospects'
			});

			// Reset form
			newProjectName = '';
			newProjectPassword = '';
			showNewProjectModal = false;

			// Reload projects
			await loadProjects();
		} catch (error: any) {
			console.error('Error creating project:', error);
			newProjectError = error.message || 'Failed to create project';
		}
	}

	function closeNewProjectModal() {
		showNewProjectModal = false;
		newProjectName = '';
		newProjectPassword = '';
		newProjectError = '';
	}

	function closeAssignFolderModal() {
		showAssignFolderModal = false;
	}

	async function browseFolderForAssignment() {
		// Electron-only functionality
		alert('This feature requires the desktop app');
	}

	async function createNewFolderForProject() {
		// Electron-only functionality
		alert('This feature requires the desktop app');
	}

	async function syncProjectFolder() {
		if (!currentProject) return;

		try {
			await ftpAPI.syncProject(currentProject);
			alert('Project folder synced successfully');
			await loadProjectFiles(currentProject);
		} catch (error) {
			console.error('Error syncing folder:', error);
			alert('Failed to sync folder');
		}
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
	<title>Media Transfer - Alternassist</title>
</svelte:head>

<div class="browser-container">
	{#if showProjectList}
		<!-- Project List -->
		<div class="browser-header">
			<h1>Media Projects</h1>
		</div>

		<div class="admin-actions">
			<button class="btn-primary" onclick={() => (showNewProjectModal = true)}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<line x1="5" y1="12" x2="19" y2="12"></line>
				</svg>
				new project
			</button>
		</div>

		<div class="file-table-container">
			<table class="file-table">
				<thead>
					<tr>
						<th>Project Name</th>
						<th>Files</th>
						<th>Total Size</th>
						<th>Folder</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if projects.length === 0}
						<tr>
							<td colspan="5" class="empty-state">Loading projects...</td>
						</tr>
					{:else}
						{#each projects as project}
							<tr>
								<td>{project.name}</td>
								<td>{project.file_count || 0} files</td>
								<td class="file-size">{formatFileSize(project.total_size || 0)}</td>
								<td>{project.ftp_folder || 'Not assigned'}</td>
								<td>
									<button class="btn-action" onclick={() => openProject(project.id)} title="Open">
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

		<div class="admin-controls">
			<button class="btn-action" onclick={() => (showAssignFolderModal = true)}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
					></path>
				</svg>
				assign folder
			</button>
			{#if currentProjectData?.ftp_folder}
				<button class="btn-action" onclick={syncProjectFolder}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="23 4 23 10 17 10"></polyline>
						<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
					</svg>
					sync folder
				</button>
			{/if}
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
								<td><div class="file-name">{file.name}</div></td>
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
												class="btn-action"
												onclick={() => playMedia(file.id, file.name, file.mimeType)}
												title="Play"
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
													<path d="M8 5v14l11-7z" />
												</svg>
											</button>
										{/if}
										<button class="btn-action" onclick={() => downloadFile(file.id)} title="Download">
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
											class="btn-action"
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

<!-- New Project Modal -->
{#if showNewProjectModal}
	<div class="modal" onclick={(e) => e.target.classList.contains('modal') && closeNewProjectModal()}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>Create New Project</h2>
				<button class="modal-close" onclick={closeNewProjectModal}>&times;</button>
			</div>
			<div class="modal-body">
				<form onsubmit={handleCreateProject}>
					<div class="form-group">
						<label for="newProjectName">Project Name</label>
						<input type="text" id="newProjectName" bind:value={newProjectName} required />
					</div>
					<div class="form-group">
						<label for="newProjectPassword">Password (optional)</label>
						<input type="password" id="newProjectPassword" bind:value={newProjectPassword} />
						<small>Leave blank if no password needed for client access</small>
					</div>
					{#if newProjectError}
						<div class="error-message">{newProjectError}</div>
					{/if}
					<button type="submit" class="btn-primary">create project</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Assign Folder Modal -->
{#if showAssignFolderModal}
	<div class="modal" onclick={(e) => e.target.classList.contains('modal') && closeAssignFolderModal()}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>Assign Folder to Project</h2>
				<button class="modal-close" onclick={closeAssignFolderModal}>&times;</button>
			</div>
			<div class="modal-body">
				<p style="margin-bottom: 1.5rem;">Choose a folder from /Volumes/FTP1 or create a new one:</p>
				<div style="display: flex; gap: 1rem; flex-direction: column;">
					<button class="btn-primary" onclick={browseFolderForAssignment}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
							></path>
						</svg>
						browse existing folder
					</button>
					<button class="btn-action" onclick={createNewFolderForProject}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<line x1="12" y1="5" x2="12" y2="19"></line>
							<line x1="5" y1="12" x2="19" y2="12"></line>
						</svg>
						create new folder
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Player Modal -->
{#if showPlayerModal}
	<div class="modal" onclick={(e) => e.target.classList.contains('modal') && closePlayer()}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>{playerTitle}</h2>
				<button class="modal-close" onclick={closePlayer}>&times;</button>
			</div>
			<div class="modal-body">
				{#if playerType === 'video'}
					<video src={playerSrc} controls style="width: 100%; max-height: 70vh;"></video>
				{:else}
					<audio src={playerSrc} controls style="width: 100%;"></audio>
				{/if}
			</div>
		</div>
	</div>
{/if}

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

	.admin-actions {
		margin-bottom: 2rem;
	}

	.admin-controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
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

	.btn-action {
		padding: 0.75rem 1.5rem;
		background: white;
		color: var(--secondary-text);
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		font-family: var(--font-body);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-action:hover {
		background: var(--bg-primary);
		color: var(--accent-teal);
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

	.file-actions .btn-action {
		padding: 0.25rem;
		border: none;
		background: none;
		color: var(--subtle-text);
	}

	.file-actions .btn-action:hover {
		background: none;
		color: var(--accent-teal);
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

	/* Modal styles */
	.modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.modal-content {
		background: white;
		border-radius: 12px;
		width: 100%;
		max-width: 600px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		padding: 1.5rem;
		border-bottom: var(--border-light);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-header h2 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 2rem;
		line-height: 1;
		cursor: pointer;
		color: var(--muted-text);
		transition: color 0.2s;
	}

	.modal-close:hover {
		color: var(--primary-text);
	}

	.modal-body {
		padding: 2rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--secondary-text);
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.form-group small {
		display: block;
		margin-top: 0.25rem;
		color: var(--muted-text);
		font-size: 0.85rem;
	}

	.error-message {
		background: #fff5f5;
		border: 1px solid #feb2b2;
		color: #c53030;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}
</style>
