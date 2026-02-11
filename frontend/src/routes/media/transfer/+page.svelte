<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { projectsAPI, type Project } from '$lib/api/projects';
	import { filesAPI } from '$lib/api/files';
	import { isElectron as isElectronFn } from '$lib/api/client';
	import ToastContainer from '$lib/components/media/ToastContainer.svelte';

	// Mode detection (8.1)
	let appMode = $state<'admin' | 'client'>('client');
	let isElectron = $state(false);

	// State
	let projects = $state<Project[]>([]);
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
	let uploadCurrent = $state(0);
	let uploadTotal = $state(0);
	let isSyncing = $state(false);

	// Modals
	let showNewProjectModal = $state(false);
	let showAssignFolderModal = $state(false);
	let assignFolderError = $state('');

	// New project form
	let newProjectName = $state('');
	let newProjectPassword = $state('');
	let newProjectError = $state('');

	// Toast
	let toast: ToastContainer;

	onMount(() => {
		// Detect Electron for admin mode (8.1)
		isElectron = isElectronFn();
		if (isElectron) {
			appMode = 'admin';
			loadProjects();
		} else {
			appMode = 'client';
			// Client mode: load files directly (no project selector)
			showProjectList = false;
			loadAllFiles();
		}
	});

	async function loadProjects() {
		try {
			projects = await projectsAPI.getAll();
		} catch (error) {
			console.error('Error loading projects:', error);
		}
	}

	async function loadAllFiles() {
		try {
			const files = await filesAPI.getAll();
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
		loadProjects();
	}

	// Upload with file count progress (8.22) and project-scoped endpoint (8.21)
	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);
		if (files.length === 0) return;

		if (!currentProject && appMode === 'admin') {
			alert('Please select a project first');
			return;
		}

		isUploading = true;
		uploadTotal = files.length;
		uploadCurrent = 0;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			uploadFileName = file.name;
			uploadCurrent = i + 1;

			try {
				const formData = new FormData();
				formData.append('file', file);

				if (currentProject) {
					// Use project-scoped upload endpoint (8.21)
					const response = await fetch(`/api/projects/${currentProject}/files/upload`, {
						method: 'POST',
						credentials: 'include',
						body: formData
					});
					if (!response.ok) {
						const error = await response.json().catch(() => ({ error: 'Upload failed' }));
						throw new Error(error.error || 'Upload failed');
					}
				} else {
					await filesAPI.upload(formData);
				}

				uploadProgress = ((i + 1) / files.length) * 100;
			} catch (error: any) {
				console.error('Upload error:', error);
				alert(`Failed to upload ${file.name}: ${error.message || 'Unknown error'}`);
			}
		}

		// Reset
		setTimeout(() => {
			isUploading = false;
			uploadProgress = 0;
			uploadFileName = '';
			uploadCurrent = 0;
			uploadTotal = 0;
			input.value = '';
			if (currentProject) loadProjectFiles(currentProject);
			else loadAllFiles();
		}, 500);
	}

	async function deleteFile(fileId: number, fileName: string) {
		if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

		try {
			await filesAPI.delete(fileId);
			if (currentProject) await loadProjectFiles(currentProject);
			else await loadAllFiles();
		} catch (error) {
			console.error('Delete error:', error);
			alert('Failed to delete file');
		}
	}

	// Project delete (8.6)
	async function deleteProject(projectId: number, projectName: string) {
		if (
			!confirm(
				`Are you sure you want to delete "${projectName}"?\n\nThis will delete all files in the project!`
			)
		)
			return;

		try {
			await projectsAPI.delete(projectId);
			await loadProjects();
		} catch (error: any) {
			alert(`Failed to delete project: ${error.message || 'Unknown error'}`);
		}
	}

	// Share link for project (8.7)
	async function generateShareLinkForProject(projectId: number) {
		try {
			const data = await projectsAPI.generateShareLink(projectId);
			const shareUrl = `${window.location.origin}/share/project/${projectId}?token=${data.token}`;

			try {
				await navigator.clipboard.writeText(shareUrl);
				alert(`Share link copied to clipboard!\n\n${shareUrl}`);
			} catch {
				alert(`Share link:\n\n${shareUrl}`);
			}
		} catch (error: any) {
			alert(`Failed to generate share link: ${error.message || 'Unknown error'}`);
		}
	}

	// Share link in file browser (8.12)
	async function generateShareLink() {
		if (!currentProject) return;
		await generateShareLinkForProject(currentProject);
	}

	function downloadFile(fileId: number) {
		window.location.href = `/api/files/${fileId}/download`;
	}

	// Play navigates to review page (8.20)
	function playMedia(fileId: number) {
		goto(`/media/review?file=${fileId}`);
	}

	function sortBy(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function getSortIndicator(column: string): string {
		if (sortColumn !== column) return '';
		return sortDirection === 'asc' ? ' ▲' : ' ▼';
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

	// Project creation with success feedback (8.10-8.11)
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

			// Reload projects and show success (8.11)
			await loadProjects();
			alert(`Project "${name}" created successfully!`);
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
		assignFolderError = '';
	}

	// Electron folder browsing (8.16)
	async function browseFolderForAssignment() {
		if (!isElectron) {
			alert('Folder browsing is only available in the desktop app');
			return;
		}

		try {
			const result = await (window as any).electronAPI.selectFolderDialog();

			if (result.success && result.folderPath) {
				await assignFolder(result.folderPath);
			} else if (result.error) {
				assignFolderError = result.error;
			}
		} catch (error) {
			console.error('Folder browse error:', error);
			assignFolderError = 'Failed to browse for folder';
		}
	}

	// Electron create folder (8.17)
	async function createNewFolderForProject() {
		if (!isElectron) {
			alert('Folder creation is only available in the desktop app');
			return;
		}

		const projectName = currentProjectData?.name || '';

		try {
			const result = await (window as any).electronAPI.createFolder(projectName);

			if (result.success && result.folderPath) {
				await assignFolder(result.folderPath);
			} else if (result.error) {
				assignFolderError = result.error;
			}
		} catch (error) {
			console.error('Folder creation error:', error);
			assignFolderError = 'Failed to create folder';
		}
	}

	// Folder assignment with results (8.18)
	async function assignFolder(folderPath: string) {
		if (!currentProject) return;

		try {
			const data = await projectsAPI.assignFolder(currentProject, folderPath);
			closeAssignFolderModal();
			alert(
				`Folder assigned successfully!\n\nAdded: ${data.added}\nUpdated: ${data.updated}\nDeleted: ${data.deleted}`
			);
			await loadProjectFiles(currentProject);
			// Refresh project data so sync button appears
			await loadProjects();
		} catch (error: any) {
			assignFolderError = error.message || 'Failed to assign folder';
		}
	}

	// Sync with loading state and results (8.13-8.14)
	async function syncProjectFolder() {
		if (!currentProject) return;

		try {
			isSyncing = true;
			const data = await projectsAPI.syncFolder(currentProject);
			alert(
				`Sync complete!\n\nAdded: ${data.added}\nUpdated: ${data.updated}\nDeleted: ${data.deleted}`
			);
			await loadProjectFiles(currentProject);
		} catch (error: any) {
			alert(`Sync failed: ${error.message || 'Unknown error'}`);
		} finally {
			isSyncing = false;
		}
	}

	// Filtered and sorted files (fix: don't mutate)
	const displayFiles = $derived.by(() => {
		let filtered = currentFiles;

		if (searchTerm) {
			filtered = filtered.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
		}

		return [...filtered].sort((a, b) => {
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
	});

	const totalSize = $derived(displayFiles.reduce((sum, f) => sum + (f.size || 0), 0));
	const currentProjectData = $derived(projects.find((p) => p.id === currentProject));

	// Folder path display (8.9) — strip /Volumes/FTP1/ prefix
	function formatFolderPath(project: Project): string {
		const path = project.media_folder_path || project.ftp_folder;
		if (!path) return '-';
		return path.replace('/Volumes/FTP1/', '');
	}

	// Check if project has folder assigned (8.19)
	function projectHasFolder(project: Project | undefined): boolean {
		if (!project) return false;
		return !!(project.media_folder_path || project.ftp_folder);
	}
</script>

<svelte:head>
	<title>Media Transfer - Alternassist</title>
</svelte:head>

<ToastContainer bind:this={toast} />

<div class="browser-container">
	{#if showProjectList && appMode === 'admin'}
		<!-- Project List (admin only, 8.1) -->
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
								<td>
									<!-- Project name is clickable link (8.8) -->
									<div class="file-name">
										<button
											class="project-name-link"
											onclick={() => openProject(project.id)}
										>
											{project.name}
										</button>
									</div>
								</td>
								<td>{project.file_count || 0} files</td>
								<td class="file-size">{formatFileSize(project.total_size || 0)}</td>
								<td>{formatFolderPath(project)}</td>
								<td>
									<div class="file-actions">
										<!-- Share link button (8.7) -->
										<button
											class="btn-action"
											onclick={() => generateShareLinkForProject(project.id)}
											title="Share link"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path
													d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
												></path>
												<path
													d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
												></path>
											</svg>
										</button>
										<!-- Delete button (8.6) -->
										<button
											class="btn-action btn-delete"
											onclick={() => deleteProject(project.id, project.name)}
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
		</div>
	{:else}
		<!-- File Browser -->
		<div class="browser-header">
			<div class="header-top">
				{#if appMode === 'admin'}
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
				{/if}
				<h1>{currentProjectData?.name || 'Media Files'}</h1>
			</div>
		</div>

		<!-- Admin Controls (only in admin mode, 8.4) -->
		{#if appMode === 'admin'}
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
				<!-- Sync button only when folder is assigned (8.19) -->
				{#if projectHasFolder(currentProjectData)}
					<button class="btn-action" onclick={syncProjectFolder} disabled={isSyncing}>
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
						{isSyncing ? 'syncing...' : 'sync folder'}
					</button>
				{/if}
				<!-- Share link button in file browser (8.12) -->
				<button class="btn-action" onclick={generateShareLink}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
						></path>
						<path
							d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
						></path>
					</svg>
					share link
				</button>
			</div>
		{/if}

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
				<button
					class="btn-primary"
					onclick={() => document.getElementById('fileInput')?.click()}
				>
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

		<!-- Upload Progress with file count (8.22) -->
		{#if isUploading}
			<div class="upload-progress">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {uploadProgress}%"></div>
				</div>
				<div class="progress-text">
					Uploading {uploadFileName}... ({uploadCurrent}/{uploadTotal})
				</div>
			</div>
		{/if}

		<div class="file-table-container">
			<table class="file-table">
				<thead>
					<tr>
						<th class="sortable" onclick={() => sortBy('name')}>Name{getSortIndicator('name')}</th>
						<th class="sortable" onclick={() => sortBy('modified')}>Date Modified{getSortIndicator('modified')}</th>
						<th class="sortable" onclick={() => sortBy('size')}>Size{getSortIndicator('size')}</th>
						<th class="sortable" onclick={() => sortBy('type')}>Type{getSortIndicator('type')}</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if displayFiles.length === 0}
						<tr>
							<td colspan="5" class="empty-state">
								{searchTerm
									? 'No files match your search.'
									: 'No files yet. Upload some files to get started.'}
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
												onclick={() => playMedia(file.id)}
												title="Play"
											>
												<svg
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="currentColor"
												>
													<path d="M8 5v14l11-7z" />
												</svg>
											</button>
										{/if}
										<button
											class="btn-action"
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
												<path
													d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
												></path>
												<polyline points="8 9 12 13 16 9"></polyline>
												<line x1="12" y1="3" x2="12" y2="13"></line>
											</svg>
										</button>
										<!-- Delete only in admin mode (8.5) -->
										{#if appMode === 'admin'}
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
										{/if}
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
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => { const t = e.target as HTMLElement; if (t.classList.contains('modal')) closeNewProjectModal(); }}>
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
						<input
							type="password"
							id="newProjectPassword"
							bind:value={newProjectPassword}
						/>
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
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => { const t = e.target as HTMLElement; if (t.classList.contains('modal')) closeAssignFolderModal(); }}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>Assign Folder to Project</h2>
				<button class="modal-close" onclick={closeAssignFolderModal}>&times;</button>
			</div>
			<div class="modal-body">
				<p style="margin-bottom: 1.5rem;">
					Choose a folder from /Volumes/FTP1 or create a new one:
				</p>
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
				{#if assignFolderError}
					<div class="error-message" style="margin-top: 1rem;">{assignFolderError}</div>
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

	/* Buttons use --font-primary per design system (8.28) */
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
		font-family: var(--font-primary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary:hover {
		background: #3a8bc7;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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
		font-family: var(--font-primary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-action:hover {
		background: var(--bg-primary);
		color: var(--accent-teal);
	}

	.btn-action:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-delete:hover {
		color: var(--accent-red) !important;
	}

	.project-name-link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: inherit;
		font-size: inherit;
		font-family: inherit;
		text-decoration: none;
		transition: color 0.2s;
	}

	.project-name-link:hover {
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

	.file-actions .btn-delete:hover {
		color: var(--accent-red) !important;
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
		max-width: 500px;
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
