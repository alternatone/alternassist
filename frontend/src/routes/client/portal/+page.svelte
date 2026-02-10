<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { clientPortalAPI } from '$lib/api/clientPortal';
	import { filesAPI } from '$lib/api/files';
	import * as tus from 'tus-js-client';

	// State
	let currentProject = $state<any>(null);
	let files = $state<any[]>([]);
	let uploadProgress = $state<any[]>([]);
	let passwordVisible = $state(false);
	let dragOver = $state(false);

	// URL parameters for direct file downloads
	let fileParam = $derived($page.url.searchParams.get('file'));
	let filesParam = $derived($page.url.searchParams.get('files'));

	onMount(async () => {
		await loadCurrentProject();
	});

	async function loadCurrentProject() {
		try {
			// Only returns project for authenticated session
			currentProject = await clientPortalAPI.getCurrent();

			// Load files
			await loadFiles();

			// Handle direct file downloads if parameters exist
			if (fileParam || filesParam) {
				await handleFileDownload();
			}
		} catch (error: any) {
			// Not logged in - redirect to client login
			console.error('Failed to load project:', error);
			goto('/client/login');
		}
	}

	async function loadFiles() {
		try {
			const response = await filesAPI.getByProject(currentProject.id);
			files = response;
		} catch (error) {
			console.error('Failed to load files:', error);
			files = [];
		}
	}

	async function handleLogout() {
		try {
			await clientPortalAPI.logout();
			goto('/client/login');
		} catch (error) {
			console.error('Logout error:', error);
		}
	}

	function togglePassword() {
		// Password is hashed and cannot be displayed
		alert(
			'Password is stored securely and cannot be displayed. Use "regenerate password" to create a new one.'
		);
	}

	function copyShareLink() {
		const link = `${window.location.origin}/client?project=${currentProject.id}`;
		navigator.clipboard.writeText(link);
		showNotification('Share link copied to clipboard!', 'success');
	}

	function regeneratePassword() {
		if (confirm('Generate a new password for this project? The old password will no longer work.')) {
			showNotification('Password regeneration coming in next phase', 'info');
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function getFileTypeBadge(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
		const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a'];
		const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
		const docExts = ['pdf', 'doc', 'docx', 'txt'];

		if (videoExts.includes(ext)) return 'video';
		if (audioExts.includes(ext)) return 'audio';
		if (imageExts.includes(ext)) return 'image';
		if (docExts.includes(ext)) return 'document';
		return 'document';
	}

	function triggerFileUpload() {
		if (!currentProject) {
			alert('Please wait for project to load');
			return;
		}
		const input = document.getElementById('fileInput') as HTMLInputElement;
		input?.click();
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragOver = false;

		if (!currentProject) {
			alert('Please wait for project to load');
			return;
		}

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			await uploadFiles(Array.from(files));
		}
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			await uploadFiles(Array.from(files));
		}
		// Reset input
		input.value = '';
	}

	async function uploadFiles(filesToUpload: File[]) {
		if (filesToUpload.length === 0) return;

		for (const file of filesToUpload) {
			await uploadFile(file);
		}
	}

	async function uploadFile(file: File) {
		const progressId = `progress-${Date.now()}-${Math.random()}`;
		const progressItem = {
			id: progressId,
			filename: file.name,
			percent: 0
		};
		uploadProgress.push(progressItem);

		// Tus resumable upload
		const upload = new tus.Upload(file, {
			endpoint: '/api/upload/tus',
			metadata: {
				filename: file.name,
				filetype: file.type,
				project_id: currentProject.id.toString()
			},
			chunkSize: 5 * 1024 * 1024, // 5MB chunks
			retryDelays: [0, 1000, 3000, 5000],
			onError: (error) => {
				console.error('Upload failed:', error);
				showNotification(`Upload failed: ${file.name}`, 'error');
				uploadProgress = uploadProgress.filter((p) => p.id !== progressId);
			},
			onProgress: (bytesUploaded, bytesTotal) => {
				const percent = Math.round((bytesUploaded / bytesTotal) * 100);
				const item = uploadProgress.find((p) => p.id === progressId);
				if (item) {
					item.percent = percent;
				}
			},
			onSuccess: () => {
				showNotification(`Uploaded ${file.name}`, 'success');
				uploadProgress = uploadProgress.filter((p) => p.id !== progressId);
				loadFiles(); // Reload file list
			}
		});

		upload.start();
	}

	async function handleFileDownload() {
		if (fileParam) {
			// Single file download
			try {
				const downloadUrl = `/api/ftp/download?path=${encodeURIComponent(fileParam)}`;
				const filename = fileParam.split('/').pop();

				const response = await fetch(downloadUrl, {
					credentials: 'include'
				});

				if (!response.ok) throw new Error('Download failed');

				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename || 'download';
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(a);

				showNotification(`Downloaded "${filename}"`, 'success');
			} catch (error) {
				console.error('File download error:', error);
				showNotification('Failed to download file', 'error');
			}
		} else if (filesParam) {
			// Multiple files download
			try {
				const filePaths = JSON.parse(decodeURIComponent(filesParam));

				for (const filePath of filePaths) {
					const downloadUrl = `/api/ftp/download?path=${encodeURIComponent(filePath)}`;
					const filename = filePath.split('/').pop();

					const response = await fetch(downloadUrl, {
						credentials: 'include'
					});

					if (!response.ok) continue;

					const blob = await response.blob();
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = filename || 'download';
					document.body.appendChild(a);
					a.click();
					window.URL.revokeObjectURL(url);
					document.body.removeChild(a);

					// Small delay between downloads
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				showNotification(`Downloaded ${filePaths.length} files`, 'success');
			} catch (error) {
				console.error('Multiple files download error:', error);
				showNotification('Failed to download some files', 'error');
			}
		}
	}

	function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
		const toast = document.createElement('div');
		toast.style.cssText = `
			position: fixed;
			bottom: 20px;
			right: 20px;
			padding: 12px 20px;
			background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
			color: white;
			border-radius: 6px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			font-size: 14px;
			z-index: 10000;
			animation: slideIn 0.3s ease-out;
		`;
		toast.textContent = message;
		document.body.appendChild(toast);

		setTimeout(() => {
			toast.style.animation = 'slideOut 0.3s ease-out';
			setTimeout(() => toast.remove(), 300);
		}, 3000);
	}

	async function downloadFile(file: any) {
		try {
			const filePath = file.ftp_path || file.path || file.name || file.filename;
			const downloadUrl = `/api/ftp/download?path=${encodeURIComponent(filePath)}`;
			const filename = filePath.split('/').pop() || file.name || file.filename;

			const response = await fetch(downloadUrl, {
				credentials: 'include'
			});

			if (!response.ok) throw new Error('Download failed');

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

			showNotification(`Downloaded "${filename}"`, 'success');
		} catch (error) {
			console.error('File download error:', error);
			showNotification('Failed to download file', 'error');
		}
	}

	// Computed values
	const fileCount = $derived(currentProject?.file_count || files.length || 0);
	const totalSize = $derived(formatFileSize(currentProject?.total_size || 0));
	const hasFolder = $derived(currentProject?.media_folder_path ? '✓' : '✗');
</script>

<svelte:head>
	<title>{currentProject?.name || 'My Files'} - Client Portal</title>
</svelte:head>

{#if !currentProject}
	<div class="loading">Loading...</div>
{:else}
	<div class="admin-container">
		<div class="header">
			<h1>{currentProject.name}</h1>
			<button class="btn btn-secondary btn-small" onclick={handleLogout}>logout</button>
		</div>

		<div class="main-content">
			<!-- Sidebar with project info -->
			<div class="sidebar">
				<h2>Project Info</h2>
				<div class="project-info">
					<div class="info-row">
						<span class="info-label">Status</span>
						<span class="info-value">{currentProject.status || 'N/A'}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Client</span>
						<span class="info-value">{currentProject.client_name || 'N/A'}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Password</span>
						<div class="password-row">
							<span class="info-value password-hidden">••••••••</span>
							<button class="btn btn-secondary btn-small" onclick={togglePassword}>show</button>
						</div>
					</div>
				</div>

				<div class="stats">
					<div class="stat-card">
						<div class="stat-label">Files</div>
						<div class="stat-value">{fileCount}</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Total Size</div>
						<div class="stat-value">{totalSize}</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Folder</div>
						<div class="stat-value">{hasFolder}</div>
					</div>
				</div>

				<div class="actions">
					<button class="btn btn-primary" onclick={copyShareLink}>copy share link</button>
					<button class="btn btn-secondary" onclick={regeneratePassword}>regenerate password</button>
				</div>
			</div>

			<!-- File browser -->
			<div class="file-browser">
				<div class="browser-header">
					<h2>Files</h2>
					<button class="btn btn-primary" onclick={triggerFileUpload}>+ upload files</button>
				</div>

				<div
					class="upload-zone"
					class:drag-over={dragOver}
					onclick={triggerFileUpload}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					role="button"
					tabindex="0"
				>
					<div class="upload-icon">⬆</div>
					<p>Drop files here or click to upload</p>
					<p style="font-size: 0.85rem; color: var(--muted-text); margin-top: 0.5rem;">
						Supports files up to 64GB
					</p>
				</div>

				<input
					type="file"
					id="fileInput"
					multiple
					style="display: none;"
					onchange={handleFileSelect}
				/>

				{#if uploadProgress.length > 0}
					<div class="upload-progress">
						{#each uploadProgress as progress (progress.id)}
							<div class="progress-item">
								<div class="progress-header">
									<span>{progress.filename}</span>
									<span>{progress.percent}%</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {progress.percent}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if files.length > 0}
					<table class="file-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Type</th>
								<th>Size</th>
								<th>Modified</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each files as file}
								<tr>
									<td class="file-name">{file.name || file.filename}</td>
									<td>
										<span class="file-type-badge badge-{getFileTypeBadge(file.name || file.filename)}">
											{getFileTypeBadge(file.name || file.filename)}
										</span>
									</td>
									<td>{formatFileSize(file.size || 0)}</td>
									<td>{new Date(file.modified || file.created_at).toLocaleDateString()}</td>
									<td>
										<button class="btn btn-small btn-secondary" onclick={() => downloadFile(file)}>download</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if uploadProgress.length === 0}
					<div class="empty-state">
						<p>No files uploaded yet</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		font-size: 1.2rem;
		color: var(--secondary-text);
	}

	.admin-container {
		max-width: 1600px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-small {
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
	}

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}

	.btn-primary:hover {
		background: var(--accent-blue);
	}

	.btn-secondary {
		background: #f5f5f5;
		color: var(--secondary-text);
	}

	.btn-secondary:hover {
		background: #e8e8e8;
	}

	.main-content {
		display: grid;
		grid-template-columns: 350px 1fr;
		gap: 2rem;
	}

	.sidebar {
		background: white;
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		box-shadow: var(--shadow-subtle);
		height: fit-content;
	}

	.sidebar h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: var(--primary-text);
	}

	.project-info {
		margin-bottom: 1.5rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 0;
		border-bottom: var(--border-light);
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-label {
		font-size: 0.85rem;
		color: var(--subtle-text);
		font-weight: 500;
	}

	.info-value {
		font-size: 0.9rem;
		color: var(--secondary-text);
		font-weight: 500;
	}

	.password-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.password-hidden {
		font-family: monospace;
		letter-spacing: 0.2em;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat-card {
		background: #f8f8f8;
		padding: 0.75rem;
		border-radius: 8px;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--subtle-text);
		margin-bottom: 0.25rem;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.file-browser {
		background: white;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-subtle);
		overflow: hidden;
	}

	.browser-header {
		padding: 1.5rem;
		border-bottom: var(--border-light);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.browser-header h2 {
		font-size: 1.2rem;
		font-weight: 600;
	}

	.upload-zone {
		border: 2px dashed #ddd;
		border-radius: var(--radius-lg);
		padding: 3rem;
		text-align: center;
		background: #fafafa;
		cursor: pointer;
		transition: all 0.2s;
		margin: 1.5rem;
	}

	.upload-zone:hover {
		border-color: var(--accent-teal);
		background: #f5f9fc;
	}

	.upload-zone.drag-over {
		border-color: var(--accent-teal);
		background: var(--accent-teal);
		color: white;
	}

	.upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.upload-progress {
		margin: 1.5rem;
	}

	.progress-item {
		background: #fafafa;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.progress-bar {
		height: 6px;
		background: #e0e0e0;
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent-teal);
		transition: width 0.3s;
	}

	.file-table {
		width: 100%;
		border-collapse: collapse;
	}

	.file-table th {
		text-align: left;
		padding: 1rem 1.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--subtle-text);
		border-bottom: var(--border-medium);
		background: #fafafa;
	}

	.file-table td {
		padding: 1rem 1.5rem;
		border-bottom: var(--border-light);
		font-size: 0.9rem;
	}

	.file-table tr:hover {
		background: #fafafa;
	}

	.file-name {
		font-weight: 500;
		color: var(--secondary-text);
	}

	.file-type-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-video {
		background: #e3f2fd;
		color: #1976d2;
	}
	.badge-audio {
		background: #f3e5f5;
		color: #7b1fa2;
	}
	.badge-image {
		background: #e8f5e9;
		color: #388e3c;
	}
	.badge-document {
		background: #fff3e0;
		color: #f57c00;
	}

	.empty-state {
		padding: 4rem 2rem;
		text-align: center;
		color: var(--muted-text);
	}

	@keyframes slideIn {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes slideOut {
		from {
			transform: translateY(0);
			opacity: 1;
		}
		to {
			transform: translateY(20px);
			opacity: 0;
		}
	}
</style>
