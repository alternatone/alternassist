<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { projectsAPI, type Project } from '$lib/api/projects';
	import { filesAPI, type MediaFile } from '$lib/api/files';
	import { ftpAPI, type FTPItem, type FTPBrowseResult } from '$lib/api/ftp';
	import ToastContainer from '$lib/components/media/ToastContainer.svelte';

	// Context: share link modal from layout
	const shareLinkModal = getContext<{
		openForProject: (id: number, name: string) => void;
		openForFile: (id: number, name: string) => void;
		openForFtp: (path: string, name: string) => void;
	}>('shareLinkModal');

	// ============== STATE ==============

	// Core caches
	let projectsCache = $state<Project[]>([]);
	let projectFiles = $state<Record<number, MediaFile[]>>({});
	let ftpContentsCache = $state<Record<string, FTPBrowseResult>>({});

	// Expand state (persisted to localStorage)
	let expandedProjects = $state<Set<number>>(new Set());
	let expandedFolders = $state<Set<string>>(new Set()); // "123-FROM AA"
	let expandedFtpFolders = $state<Set<string>>(new Set());

	// FTP toggle (persisted)
	let ftpBrowserEnabled = $state(true);

	// Selection
	let selectedFtpFiles = $state<Set<string>>(new Set());

	// Request tracking
	let projectAbortControllers: Record<number, AbortController> = {};

	// Active operations
	let activeUpload = $state<{
		show: boolean;
		fileCount: number;
		current: number;
		percentage: number;
		status: 'uploading' | 'complete' | 'error';
		message: string;
	} | null>(null);

	let activeDownload = $state<{
		show: boolean;
		fileName: string;
		percentage: number;
		loaded: number;
		total: number;
		controller: AbortController | null;
	} | null>(null);

	// Drag state
	let draggedFileData = $state<{ projectId: number; fileId: number; folder: string } | null>(null);

	// FTP Setup modal
	let ftpSetupModal = $state<{
		show: boolean;
		project: Project | null;
	}>({ show: false, project: null });

	// Public link modal
	let publicLinkModal = $state<{
		show: boolean;
		fileName: string;
		url: string;
		expiresAt: string;
	}>({ show: false, fileName: '', url: '', expiresAt: '' });

	// Toast
	let toastRef: ToastContainer;

	function toast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) {
		toastRef?.show(message, type, duration);
	}

	// ============== PERSISTENCE ==============

	function loadPersistedState() {
		try {
			const ep = localStorage.getItem('expandedProjects');
			if (ep) expandedProjects = new Set(JSON.parse(ep));
			const ef = localStorage.getItem('expandedFolders');
			if (ef) expandedFolders = new Set(JSON.parse(ef));
			const eff = localStorage.getItem('expandedFtpFolders');
			if (eff) expandedFtpFolders = new Set(JSON.parse(eff));
			const ftp = localStorage.getItem('ftpBrowserEnabled');
			if (ftp !== null) ftpBrowserEnabled = ftp !== 'false';
		} catch {
			// ignore parse errors
		}
	}

	$effect(() => {
		localStorage.setItem('expandedProjects', JSON.stringify([...expandedProjects]));
	});
	$effect(() => {
		localStorage.setItem('expandedFolders', JSON.stringify([...expandedFolders]));
	});
	$effect(() => {
		localStorage.setItem('expandedFtpFolders', JSON.stringify([...expandedFtpFolders]));
	});
	$effect(() => {
		localStorage.setItem('ftpBrowserEnabled', String(ftpBrowserEnabled));
	});

	// ============== TREE RENDERING ==============

	type TreeRow =
		| { type: 'project'; project: Project; key: string }
		| { type: 'folder'; projectId: number; folderName: string; files: MediaFile[]; key: string }
		| {
				type: 'file';
				projectId: number;
				file: MediaFile;
				folder: string;
				key: string;
		  }
		| {
				type: 'ftp-folder';
				name: string;
				data: FTPItem;
				path: string;
				indent: number;
				key: string;
		  }
		| {
				type: 'ftp-file';
				name: string;
				data: FTPItem;
				path: string;
				indent: number;
				key: string;
		  };

	const treeRows = $derived.by(() => {
		const rows: TreeRow[] = [];

		// Get FTP root folders if enabled
		let ftpRootFolders: FTPItem[] = [];
		if (ftpBrowserEnabled && ftpContentsCache['']) {
			const projectFolderNames = new Set(
				projectsCache.filter((p) => p.folder_path).map((p) => p.folder_path!)
			);
			ftpRootFolders = ftpContentsCache[''].items.filter(
				(item) => item.isDirectory && !projectFolderNames.has(item.name)
			);
		}

		// Combine projects + FTP root folders, sort alphabetically
		const allItems = [
			...ftpRootFolders.map((f) => ({
				sortKey: f.name.toLowerCase(),
				type: 'ftp' as const,
				data: f
			})),
			...projectsCache.map((p) => ({
				sortKey: p.name.toLowerCase(),
				type: 'project' as const,
				data: p
			}))
		].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

		for (const item of allItems) {
			if (item.type === 'project') {
				const project = item.data as Project;
				rows.push({ type: 'project', project, key: `project-${project.id}` });

				if (expandedProjects.has(project.id)) {
					const files = projectFiles[project.id] || [];
					const fromAA = files.filter((f) => f.folder === 'FROM AA');
					const toAA = files.filter((f) => f.folder === 'TO AA');

					// FROM AA folder
					rows.push({
						type: 'folder',
						projectId: project.id,
						folderName: 'FROM AA',
						files: fromAA,
						key: `folder-${project.id}-FROM AA`
					});
					if (expandedFolders.has(`${project.id}-FROM AA`)) {
						for (const file of fromAA) {
							rows.push({
								type: 'file',
								projectId: project.id,
								file,
								folder: 'FROM AA',
								key: `file-${file.id}`
							});
						}
					}

					// TO AA folder
					rows.push({
						type: 'folder',
						projectId: project.id,
						folderName: 'TO AA',
						files: toAA,
						key: `folder-${project.id}-TO AA`
					});
					if (expandedFolders.has(`${project.id}-TO AA`)) {
						for (const file of toAA) {
							rows.push({
								type: 'file',
								projectId: project.id,
								file,
								folder: 'TO AA',
								key: `file-${file.id}`
							});
						}
					}
				}
			} else {
				// FTP root folder
				const folder = item.data as FTPItem;
				addFtpFolderRows(rows, folder.name, folder, 0);
			}
		}

		return rows;
	});

	function addFtpFolderRows(rows: TreeRow[], folderPath: string, data: FTPItem, indent: number) {
		rows.push({
			type: 'ftp-folder',
			name: data.name,
			data,
			path: folderPath,
			indent,
			key: `ftp-folder-${folderPath}`
		});

		if (expandedFtpFolders.has(folderPath) && ftpContentsCache[folderPath]) {
			const contents = ftpContentsCache[folderPath];
			const folders = contents.items.filter((i) => i.isDirectory);
			const files = contents.items.filter((i) => !i.isDirectory);

			for (const subfolder of folders) {
				const subPath = folderPath ? `${folderPath}/${subfolder.name}` : subfolder.name;
				addFtpFolderRows(rows, subPath, subfolder, indent + 1);
			}

			for (const file of files) {
				const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
				rows.push({
					type: 'ftp-file',
					name: file.name,
					data: file,
					path: filePath,
					indent: indent + 1,
					key: `ftp-file-${filePath}`
				});
			}
		}
	}

	// ============== DATA LOADING ==============

	onMount(() => {
		loadPersistedState();
		loadProjects();
	});

	async function loadProjects() {
		try {
			projectsCache = await projectsAPI.getAll();

			// Load FTP root if enabled
			if (ftpBrowserEnabled && !ftpContentsCache['']) {
				try {
					ftpContentsCache[''] = await ftpAPI.browse('');
					ftpContentsCache = { ...ftpContentsCache };
				} catch {
					// FTP may not be available
				}
			}

			// Load files for expanded projects
			for (const projectId of expandedProjects) {
				if (!projectFiles[projectId]) {
					loadProjectFiles(projectId);
				}
			}

			// Load contents for expanded FTP folders
			for (const folderPath of expandedFtpFolders) {
				if (!ftpContentsCache[folderPath]) {
					loadFtpFolder(folderPath);
				}
			}
		} catch (error) {
			console.error('Error loading projects:', error);
		}
	}

	async function loadProjectFiles(projectId: number) {
		try {
			const controller = new AbortController();
			projectAbortControllers[projectId] = controller;

			const response = await fetch(`/api/files/project/${projectId}`, {
				credentials: 'include',
				signal: controller.signal
			});

			if (response.ok) {
				const files = await response.json();
				projectFiles[projectId] = files;
				projectFiles = { ...projectFiles };
			}

			delete projectAbortControllers[projectId];
		} catch (error: any) {
			if (error.name !== 'AbortError') {
				console.error('Error loading files:', error);
				projectFiles[projectId] = [];
				projectFiles = { ...projectFiles };
			}
		}
	}

	async function loadFtpFolder(folderPath: string) {
		try {
			const result = await ftpAPI.browse(folderPath);
			ftpContentsCache[folderPath] = result;
			ftpContentsCache = { ...ftpContentsCache };
		} catch (error) {
			console.error('Error loading FTP folder:', error);
			expandedFtpFolders.delete(folderPath);
			expandedFtpFolders = new Set(expandedFtpFolders);
		}
	}

	// ============== TOGGLE ACTIONS ==============

	async function toggleProject(projectId: number) {
		if (expandedProjects.has(projectId)) {
			expandedProjects.delete(projectId);
			if (projectAbortControllers[projectId]) {
				projectAbortControllers[projectId].abort();
				delete projectAbortControllers[projectId];
			}
		} else {
			expandedProjects.add(projectId);
			if (!projectFiles[projectId]) {
				await loadProjectFiles(projectId);
			}
		}
		expandedProjects = new Set(expandedProjects);
	}

	function toggleFolder(projectId: number, folderName: string) {
		const key = `${projectId}-${folderName}`;
		if (expandedFolders.has(key)) {
			expandedFolders.delete(key);
		} else {
			expandedFolders.add(key);
		}
		expandedFolders = new Set(expandedFolders);
	}

	async function toggleFtpFolder(folderPath: string) {
		if (expandedFtpFolders.has(folderPath)) {
			expandedFtpFolders.delete(folderPath);
		} else {
			expandedFtpFolders.add(folderPath);
			if (!ftpContentsCache[folderPath]) {
				await loadFtpFolder(folderPath);
			}
		}
		expandedFtpFolders = new Set(expandedFtpFolders);
	}

	// ============== PROJECT ACTIONS ==============

	async function deleteProject(projectId: number, projectName: string) {
		if (
			!confirm(
				`Are you sure you want to delete the project "${projectName}"?\n\nThis will delete all files and cannot be undone.`
			)
		)
			return;

		const projectIndex = projectsCache.findIndex((p) => p.id === projectId);
		const deletedProject = projectsCache[projectIndex];
		const savedFiles = projectFiles[projectId];

		try {
			toast(`Deleting "${projectName}"...`, 'info', 2000);

			// Optimistic remove
			projectsCache = projectsCache.filter((p) => p.id !== projectId);
			delete projectFiles[projectId];
			expandedProjects.delete(projectId);
			expandedProjects = new Set(expandedProjects);
			projectFiles = { ...projectFiles };

			await projectsAPI.delete(projectId);
			toast(`Project "${projectName}" deleted successfully`);
		} catch (error) {
			console.error('Error deleting project:', error);
			// Rollback
			projectsCache.splice(projectIndex, 0, deletedProject);
			projectsCache = [...projectsCache];
			if (savedFiles) {
				projectFiles[projectId] = savedFiles;
				projectFiles = { ...projectFiles };
			}
			toast(`Failed to delete project "${projectName}"`, 'error');
		}
	}

	function openShareForProject(projectId: number, projectName: string) {
		shareLinkModal?.openForProject(projectId, projectName);
	}

	function openFtpSetup(project: Project) {
		ftpSetupModal = { show: true, project };
	}

	function closeFtpSetup() {
		ftpSetupModal = { show: false, project: null };
	}

	async function copyClientPortalLink() {
		if (!ftpSetupModal.project) return;
		const baseUrl = window.location.origin;
		const url = `${baseUrl}/client/login?project=${ftpSetupModal.project.id}`;
		try {
			await navigator.clipboard.writeText(url);
			toast('Client portal link copied!');
		} catch {
			toast('Failed to copy link', 'error');
		}
	}

	async function regeneratePassword() {
		if (!ftpSetupModal.project) return;
		const newPassword = prompt('Enter new password for client access:');
		if (!newPassword) return;
		try {
			await projectsAPI.updatePassword(ftpSetupModal.project.id, newPassword);
			toast('Password updated successfully');
		} catch {
			toast('Failed to update password', 'error');
		}
	}

	// ============== FILE ACTIONS ==============

	async function deleteFile(projectId: number, fileId: number, fileName: string) {
		if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

		const files = projectFiles[projectId] || [];
		const fileIndex = files.findIndex((f) => f.id === fileId);
		const deletedFile = files[fileIndex];

		try {
			toast(`Deleting "${fileName}"...`, 'info', 2000);

			// Optimistic remove
			projectFiles[projectId] = files.filter((f) => f.id !== fileId);
			projectFiles = { ...projectFiles };

			await filesAPI.delete(fileId);
			toast(`File "${fileName}" deleted successfully`);
		} catch (error) {
			console.error('Error deleting file:', error);
			// Rollback
			if (deletedFile) {
				projectFiles[projectId] = [...files];
				projectFiles = { ...projectFiles };
			}
			toast(`Failed to delete file "${fileName}"`, 'error');
		}
	}

	function openShareForFile(fileId: number, fileName: string) {
		shareLinkModal?.openForFile(fileId, fileName);
	}

	async function generatePublicLink(projectId: number, fileId: number, fileName: string) {
		try {
			toast('Generating public link...', 'info', 2000);
			const files = projectFiles[projectId] || [];
			const file = files.find((f) => f.id === fileId);
			if (!file || !file.file_path) throw new Error('File not found');

			const response = await fetch('/api/downloads/generate', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file_path: file.file_path })
			});
			if (!response.ok) throw new Error('Failed to generate link');
			const { url, expires_at } = await response.json();

			publicLinkModal = { show: true, fileName, url, expiresAt: expires_at };
		} catch (error) {
			console.error('Error generating public link:', error);
			toast('Failed to generate public link', 'error');
		}
	}

	function closePublicLinkModal() {
		publicLinkModal = { show: false, fileName: '', url: '', expiresAt: '' };
	}

	async function copyPublicLink() {
		try {
			await navigator.clipboard.writeText(publicLinkModal.url);
			toast('Link copied to clipboard!');
		} catch {
			toast('Failed to copy link', 'error');
		}
	}

	function navigateToReview(fileId: number, projectId: number) {
		goto(`/media/review?file=${fileId}&project=${projectId}`);
	}

	function navigateToFtpReview(ftpPath: string) {
		goto(`/media/review?ftpFile=${encodeURIComponent(ftpPath)}`);
	}

	// ============== DOWNLOAD ==============

	async function downloadProjectFile(fileId: number, fileName: string) {
		activeDownload = {
			show: true,
			fileName,
			percentage: 0,
			loaded: 0,
			total: 0,
			controller: new AbortController()
		};

		try {
			const response = await fetch(`/api/files/public/${fileId}/download`, {
				signal: activeDownload.controller!.signal
			});
			if (!response.ok) throw new Error('Download failed');

			await streamDownload(response, fileName);
			toast('Download complete');
		} catch (error: any) {
			if (error.name === 'AbortError') {
				toast('Download cancelled', 'info');
			} else {
				console.error('Download error:', error);
				toast('Download failed', 'error');
			}
		} finally {
			activeDownload = null;
		}
	}

	async function downloadFtpFile(filePath: string, fileName: string) {
		activeDownload = {
			show: true,
			fileName,
			percentage: 0,
			loaded: 0,
			total: 0,
			controller: new AbortController()
		};

		try {
			const response = await fetch(ftpAPI.getDownloadUrl(filePath), {
				credentials: 'include',
				signal: activeDownload.controller!.signal
			});
			if (!response.ok) throw new Error('Download failed');

			await streamDownload(response, fileName);
			toast('Download complete');
		} catch (error: any) {
			if (error.name === 'AbortError') {
				toast('Download cancelled', 'info');
			} else {
				console.error('Download error:', error);
				toast('Download failed', 'error');
			}
		} finally {
			activeDownload = null;
		}
	}

	async function streamDownload(response: Response, fileName: string) {
		const contentLength = response.headers.get('Content-Length');
		const total = parseInt(contentLength || '0', 10);
		let loaded = 0;

		if (activeDownload) activeDownload.total = total;

		const reader = response.body!.getReader();
		const chunks: Uint8Array[] = [];

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			loaded += value.length;

			if (activeDownload) {
				activeDownload.loaded = loaded;
				activeDownload.percentage = total ? Math.round((loaded / total) * 100) : 0;
			}
		}

		const blob = new Blob(chunks);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function cancelDownload() {
		activeDownload?.controller?.abort();
	}

	// ============== UPLOAD ==============

	function uploadXhr(
		file: File,
		url: string,
		extraFields: Record<string, string>,
		onProgress?: (loaded: number) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const formData = new FormData();
			formData.append('file', file);
			for (const [k, v] of Object.entries(extraFields)) {
				formData.append(k, v);
			}

			const xhr = new XMLHttpRequest();
			xhr.withCredentials = true;

			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable && onProgress) onProgress(e.loaded);
			});

			xhr.addEventListener('load', () => {
				if (xhr.status === 200) {
					onProgress?.(file.size);
					resolve();
				} else {
					reject(new Error(`Upload failed: ${file.name} (${xhr.status})`));
				}
			});

			xhr.addEventListener('error', () => reject(new Error(`Network error: ${file.name}`)));
			xhr.open('POST', url, true);
			xhr.send(formData);
		});
	}

	async function uploadToProjectFolder(projectId: number, folder: string, files: File[]) {
		activeUpload = {
			show: true,
			fileCount: files.length,
			current: 0,
			percentage: 0,
			status: 'uploading',
			message: `starting upload of ${files.length} file${files.length > 1 ? 's' : ''}...`
		};

		try {
			const fileProgress = new Array(files.length).fill(0);
			const fileSizes = files.map((f) => f.size);
			const totalSize = fileSizes.reduce((a, b) => a + b, 0);

			const uploadPromises = files.map((file, index) =>
				uploadXhr(
					file,
					`/api/projects/${projectId}/upload`,
					{ folder, projectId: String(projectId) },
					(loaded) => {
						fileProgress[index] = loaded;
						const totalLoaded = fileProgress.reduce((a, b) => a + b, 0);
						const pct = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
						const completed = fileProgress.filter((p, i) => p >= fileSizes[i]).length;
						if (activeUpload) {
							activeUpload.percentage = pct;
							activeUpload.current = completed;
							activeUpload.message = `uploading ${completed} of ${files.length} file${files.length > 1 ? 's' : ''}...`;
						}
					}
				)
			);

			await Promise.all(uploadPromises);

			// Refresh files
			await loadProjectFiles(projectId);

			if (activeUpload) {
				activeUpload.status = 'complete';
				activeUpload.message = `successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}`;
			}
			setTimeout(() => (activeUpload = null), 2000);
		} catch (error) {
			console.error('Error uploading files:', error);
			if (activeUpload) {
				activeUpload.status = 'error';
				activeUpload.message = 'some files failed to upload. please try again.';
			}
			setTimeout(() => (activeUpload = null), 3000);
		}
	}

	async function uploadToFtpFolder(ftpPath: string, files: File[]) {
		activeUpload = {
			show: true,
			fileCount: files.length,
			current: 0,
			percentage: 0,
			status: 'uploading',
			message: `starting upload of ${files.length} file${files.length > 1 ? 's' : ''}...`
		};

		try {
			let completed = 0;
			const uploadPromises = files.map(async (file) => {
				await uploadXhr(file, '/api/ftp/upload', { path: ftpPath });
				completed++;
				if (activeUpload) {
					activeUpload.current = completed;
					activeUpload.percentage = Math.round((completed / files.length) * 100);
					activeUpload.message = `uploading ${completed} of ${files.length} file${files.length > 1 ? 's' : ''}...`;
				}
			});

			await Promise.all(uploadPromises);

			// Clear FTP cache and reload
			delete ftpContentsCache[ftpPath];
			ftpContentsCache = { ...ftpContentsCache };
			await loadFtpFolder(ftpPath);

			if (activeUpload) {
				activeUpload.status = 'complete';
				activeUpload.message = `successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}`;
			}
			setTimeout(() => (activeUpload = null), 2000);
		} catch (error) {
			console.error('Error uploading files:', error);
			if (activeUpload) {
				activeUpload.status = 'error';
				activeUpload.message = 'some files failed to upload. please try again.';
			}
			setTimeout(() => (activeUpload = null), 3000);
		}
	}

	// ============== FTP FILE ACTIONS ==============

	function openShareForFtp(ftpPath: string, fileName: string) {
		shareLinkModal?.openForFtp(ftpPath, fileName);
	}

	async function deleteFtpItem(itemPath: string, itemName: string, isFolder: boolean) {
		const itemType = isFolder ? 'folder' : 'file';
		const msg = isFolder
			? `Are you sure you want to delete the folder "${itemName}" and all its contents?\n\nThis cannot be undone.`
			: `Are you sure you want to delete "${itemName}"?\n\nThis cannot be undone.`;
		if (!confirm(msg)) return;

		try {
			toast(`Deleting ${itemType} "${itemName}"...`, 'info', 2000);
			await ftpAPI.deletePath(itemPath);

			// Clear parent cache
			const parentPath = itemPath.split('/').slice(0, -1).join('/');
			delete ftpContentsCache[parentPath];

			if (isFolder) {
				for (const key of Object.keys(ftpContentsCache)) {
					if (key.startsWith(itemPath)) delete ftpContentsCache[key];
				}
				expandedFtpFolders.delete(itemPath);
				expandedFtpFolders = new Set(expandedFtpFolders);
			}

			ftpContentsCache = { ...ftpContentsCache };

			// Reload to refresh
			await loadProjects();

			toast(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemName}" deleted successfully`);
		} catch (error: any) {
			console.error('Error deleting FTP item:', error);
			toast(`Failed to delete ${itemType}: ${error.message}`, 'error');
		}
	}

	// ============== SELECTION ==============

	function toggleFileSelection(filePath: string) {
		if (selectedFtpFiles.has(filePath)) {
			selectedFtpFiles.delete(filePath);
		} else {
			selectedFtpFiles.add(filePath);
		}
		selectedFtpFiles = new Set(selectedFtpFiles);
	}

	async function shareSelectedFiles() {
		if (selectedFtpFiles.size === 0) {
			toast('No files selected', 'error');
			return;
		}
		try {
			const filePaths = Array.from(selectedFtpFiles);
			const shareUrl = `${window.location.origin}/client/login?files=${encodeURIComponent(JSON.stringify(filePaths))}`;
			await navigator.clipboard.writeText(shareUrl);
			toast(`Share link copied for ${filePaths.length} file${filePaths.length !== 1 ? 's' : ''}`);
		} catch {
			toast('Failed to copy share link', 'error');
		}
	}

	function clearSelection() {
		selectedFtpFiles = new Set();
	}

	// ============== DRAG AND DROP ==============

	function handleFileDragStart(
		event: DragEvent,
		projectId: number,
		fileId: number,
		folder: string
	) {
		draggedFileData = { projectId, fileId, folder };
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.style.opacity = '0.5';
		}
		event.dataTransfer!.effectAllowed = 'move';
	}

	function handleFileDragEnd(event: DragEvent) {
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.style.opacity = '1';
		}
	}

	function handleFolderDragOver(event: DragEvent) {
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.classList.add('drag-over');
		}
	}

	function handleFolderDragLeave(event: DragEvent) {
		if (event.currentTarget instanceof HTMLElement) {
			if (!event.currentTarget.contains(event.relatedTarget as Node)) {
				event.currentTarget.classList.remove('drag-over');
			}
		}
	}

	async function handleFolderDrop(
		event: DragEvent,
		targetProjectId: number,
		targetFolder: string
	) {
		event.preventDefault();
		event.stopPropagation();
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.classList.remove('drag-over');
		}

		// External file drop → upload
		if (!draggedFileData && event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const files = Array.from(event.dataTransfer.files);
			await uploadToProjectFolder(targetProjectId, targetFolder, files);
			return;
		}

		if (!draggedFileData) return;

		const { projectId, fileId, folder: sourceFolder } = draggedFileData;

		if (projectId === targetProjectId && sourceFolder === targetFolder) {
			toast('File is already in this folder', 'info');
			draggedFileData = null;
			return;
		}

		try {
			toast('Moving file...', 'info', 2000);
			const response = await fetch(`/api/projects/${projectId}/files/${fileId}/move`, {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetProjectId, targetFolder })
			});
			if (!response.ok) throw new Error('Failed to move file');

			toast('File moved successfully');
			delete projectFiles[projectId];
			if (targetProjectId !== projectId) delete projectFiles[targetProjectId];
			projectFiles = { ...projectFiles };

			await loadProjectFiles(projectId);
			if (targetProjectId !== projectId) await loadProjectFiles(targetProjectId);
		} catch (error) {
			console.error('Error moving file:', error);
			toast('Failed to move file', 'error');
		}
		draggedFileData = null;
	}

	async function handleFtpFolderDrop(event: DragEvent, ftpPath: string) {
		event.preventDefault();
		event.stopPropagation();
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.classList.remove('drag-over');
		}

		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const files = Array.from(event.dataTransfer.files);
			await uploadToFtpFolder(ftpPath, files);
		}
	}

	// Global drag prevention
	function preventDefaultDrag(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	// ============== BACKUP ==============

	async function backupFTP() {
		if (
			!confirm(
				'This will backup the FTP drive to FTP BACKUP. This may take several minutes depending on the size of your data.\n\nContinue?'
			)
		)
			return;

		try {
			toast('Starting backup... This may take a while.', 'info', 5000);
			const result = await ftpAPI.backup();
			if (result.success) {
				toast('Backup completed successfully!', 'success', 5000);
			} else {
				throw new Error('Backup failed');
			}
		} catch (error: any) {
			console.error('Error running backup:', error);
			toast(`Backup failed: ${error.message}`, 'error', 5000);
		}
	}

	// ============== FTP BROWSER TOGGLE ==============

	async function toggleFtpBrowser() {
		ftpBrowserEnabled = !ftpBrowserEnabled;
		if (ftpBrowserEnabled && !ftpContentsCache['']) {
			try {
				ftpContentsCache[''] = await ftpAPI.browse('');
				ftpContentsCache = { ...ftpContentsCache };
			} catch {
				// FTP may not be available
			}
		}
	}

	// ============== HELPERS ==============

	function formatFileSize(bytes: number): string {
		if (!bytes || bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateString: string | undefined): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return (
			date.toLocaleDateString() +
			' ' +
			date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		);
	}

	function formatStatus(status: string | undefined): string {
		if (!status) return '';
		return status;
	}

	function isMediaFile(name: string): boolean {
		const ext = name.split('.').pop()?.toLowerCase() || '';
		return [
			'mp4',
			'mov',
			'avi',
			'mkv',
			'webm',
			'mp3',
			'wav',
			'aac',
			'm4a',
			'flac',
			'ogg'
		].includes(ext);
	}
</script>

<svelte:head>
	<title>Media - Alternassist</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="browser-container"
	ondragover={preventDefaultDrag}
	ondragenter={preventDefaultDrag}
	ondragleave={preventDefaultDrag}
	ondrop={preventDefaultDrag}
>
	<!-- Top Bar -->
	<div class="top-bar">
		<h1>Media</h1>
		<div class="top-actions">
			<label class="ftp-toggle">
				<input type="checkbox" checked={ftpBrowserEnabled} onchange={toggleFtpBrowser} />
				<span>FTP Browser</span>
			</label>
			<button class="btn-backup" onclick={backupFTP}>
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
				backup
			</button>
		</div>
	</div>

	<!-- Table -->
	<div class="file-table-container">
		<table class="file-table">
			<thead>
				<tr>
					<th style="width: 40%;">Name</th>
					<th>Status</th>
					<th>Files</th>
					<th>Size</th>
					<th>Date Uploaded</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if treeRows.length === 0}
					<tr>
						<td colspan="6" class="empty-state">No projects yet.</td>
					</tr>
				{:else}
					{#each treeRows as row (row.key)}
						{#if row.type === 'project'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<tr
								class="project-row"
								onclick={() => toggleProject(row.project.id)}
							>
								<td>
									<div class="tree-name">
										<span
											class="chevron"
											class:expanded={expandedProjects.has(row.project.id)}
											>&#9654;</span
										>
										<svg
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
											></path>
										</svg>
										{row.project.name}
									</div>
								</td>
								<td>{formatStatus(row.project.status)}</td>
								<td>{row.project.file_count || 0}</td>
								<td class="file-size">{formatFileSize(row.project.total_size || 0)}</td>
								<td class="file-date"
									>{row.project.created_at
										? formatDate(row.project.created_at)
										: ''}</td
								>
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<td onclick={(e) => e.stopPropagation()}>
									<div class="file-actions">
										<button
											class="btn-action"
											onclick={() => openFtpSetup(row.project)}
											title="FTP Setup"
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
													d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
												></path>
												<circle cx="12" cy="12" r="3"></circle>
											</svg>
										</button>
										<button
											class="btn-action"
											onclick={() =>
												openShareForProject(row.project.id, row.project.name)}
											title="Share"
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
										<button
											class="btn-action btn-delete"
											onclick={() =>
												deleteProject(row.project.id, row.project.name)}
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
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{:else if row.type === 'folder'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<tr
								class="folder-row"
								onclick={() => toggleFolder(row.projectId, row.folderName)}
								ondragover={handleFolderDragOver}
								ondragleave={handleFolderDragLeave}
								ondrop={(e) => handleFolderDrop(e, row.projectId, row.folderName)}
							>
								<td>
									<div class="tree-name" style="padding-left: 2rem;">
										<span
											class="chevron"
											class:expanded={expandedFolders.has(
												`${row.projectId}-${row.folderName}`
											)}>&#9654;</span
										>
										<svg
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
											></path>
										</svg>
										{row.folderName}
									</div>
								</td>
								<td></td>
								<td>{row.files.length}</td>
								<td class="file-size"
									>{formatFileSize(
										row.files.reduce((sum, f) => sum + (f.file_size || 0), 0)
									)}</td
								>
								<td></td>
								<td></td>
							</tr>
						{:else if row.type === 'file'}
							<tr
								class="file-row"
								draggable="true"
								ondragstart={(e) =>
									handleFileDragStart(e, row.projectId, row.file.id, row.folder)}
								ondragend={handleFileDragEnd}
							>
								<td>
									<div class="tree-name" style="padding-left: 4rem;">
										{#if isMediaFile(row.file.original_name)}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												class="media-link"
												onclick={() =>
													navigateToReview(row.file.id, row.projectId)}
											>
												{row.file.original_name}
											</span>
										{:else}
											{row.file.original_name}
										{/if}
									</div>
								</td>
								<td></td>
								<td></td>
								<td class="file-size">{formatFileSize(row.file.file_size)}</td>
								<td class="file-date">{formatDate(row.file.uploaded_at)}</td>
								<td>
									<div class="file-actions">
										<button
											class="btn-action"
											onclick={() =>
												generatePublicLink(
													row.projectId,
													row.file.id,
													row.file.original_name
												)}
											title="Generate Public Link"
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
													d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
												></path>
												<polyline points="15 3 21 3 21 9"></polyline>
												<line x1="10" y1="14" x2="21" y2="3"></line>
											</svg>
										</button>
										<button
											class="btn-action"
											onclick={() =>
												openShareForFile(
													row.file.id,
													row.file.original_name
												)}
											title="Copy Link"
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
										<button
											class="btn-action"
											onclick={() =>
												downloadProjectFile(
													row.file.id,
													row.file.original_name
												)}
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
												<polyline points="7 10 12 15 17 10"></polyline>
												<line x1="12" y1="15" x2="12" y2="3"></line>
											</svg>
										</button>
										<button
											class="btn-action btn-delete"
											onclick={() =>
												deleteFile(
													row.projectId,
													row.file.id,
													row.file.original_name
												)}
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
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{:else if row.type === 'ftp-folder'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<tr
								class="project-row ftp-folder-row"
								onclick={() => toggleFtpFolder(row.path)}
								ondragover={handleFolderDragOver}
								ondragleave={handleFolderDragLeave}
								ondrop={(e) => handleFtpFolderDrop(e, row.path)}
							>
								<td>
									<div
										class="tree-name"
										style="padding-left: {row.indent * 2}rem;"
									>
										<span
											class="chevron"
											class:expanded={expandedFtpFolders.has(row.path)}
											>&#9654;</span
										>
										<svg
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
											></path>
										</svg>
										<strong>{row.name}</strong>
										{#if row.data.projectName}
											<span class="project-tag"
												>({row.data.projectName})</span
											>
										{/if}
									</div>
								</td>
								<td></td>
								<td>{row.data.itemCount || 0}</td>
								<td class="file-size"
									>{formatFileSize(row.data.totalSize || 0)}</td
								>
								<td class="file-date">{formatDate(row.data.modified)}</td>
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<td onclick={(e) => e.stopPropagation()}>
									<div class="file-actions">
										<button
											class="btn-action"
											onclick={() => openShareForFtp(row.path, row.name)}
											title="Copy Link"
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
										<button
											class="btn-action btn-delete"
											onclick={() => deleteFtpItem(row.path, row.name, true)}
											title="Delete folder"
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
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{:else if row.type === 'ftp-file'}
							<tr
								class="file-row ftp-file-row"
								class:selected={selectedFtpFiles.has(row.path)}
							>
								<td>
									<div
										class="tree-name"
										style="padding-left: {(row.indent + 1) * 2}rem;"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<input
											type="checkbox"
											class="file-checkbox"
											checked={selectedFtpFiles.has(row.path)}
											onchange={() => toggleFileSelection(row.path)}
											onclick={(e) => e.stopPropagation()}
										/>
										{#if row.data.isMedia}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												class="media-link"
												onclick={() => navigateToFtpReview(row.path)}
											>
												{row.name}
											</span>
										{:else}
											{row.name}
										{/if}
									</div>
								</td>
								<td></td>
								<td></td>
								<td class="file-size">{formatFileSize(row.data.size || 0)}</td>
								<td class="file-date">{formatDate(row.data.modified)}</td>
								<td>
									<div class="file-actions">
										{#if row.data.isMedia}
											<button
												class="btn-action"
												onclick={() => navigateToFtpReview(row.path)}
												title="Play"
											>
												<svg
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<polygon points="5 3 19 12 5 21 5 3"
													></polygon>
												</svg>
											</button>
										{/if}
										<button
											class="btn-action"
											onclick={() => openShareForFtp(row.path, row.name)}
											title="Copy Link"
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
										<button
											class="btn-action"
											onclick={() => downloadFtpFile(row.path, row.name)}
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
												<polyline points="7 10 12 15 17 10"></polyline>
												<line x1="12" y1="15" x2="12" y2="3"></line>
											</svg>
										</button>
										<button
											class="btn-action btn-delete"
											onclick={() =>
												deleteFtpItem(row.path, row.name, false)}
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
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<!-- Upload Modal -->
{#if activeUpload?.show}
	<div class="modal-overlay">
		<div class="upload-modal">
			{#if activeUpload.status === 'uploading'}
				<div class="upload-modal-header">
					<div class="upload-modal-icon">
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
							<polyline points="17 8 12 3 7 8"></polyline>
							<line x1="12" y1="3" x2="12" y2="15"></line>
						</svg>
					</div>
					<div class="upload-modal-title">uploading files</div>
				</div>
				<div class="upload-modal-status">{activeUpload.message}</div>
				<div class="upload-progress-container">
					<div
						class="upload-progress-fill"
						style="width: {activeUpload.percentage}%"
					></div>
				</div>
				<div class="upload-progress-text">{activeUpload.percentage}%</div>
			{:else if activeUpload.status === 'complete'}
				<div class="upload-complete-icon">
					<svg
						width="36"
						height="36"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				</div>
				<div class="upload-modal-title" style="text-align: center; margin-bottom: 0.5rem;">
					upload complete!
				</div>
				<div class="upload-modal-status" style="text-align: center;">
					{activeUpload.message}
				</div>
			{:else if activeUpload.status === 'error'}
				<div class="upload-modal-header">
					<div class="upload-modal-icon error">
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="10"></circle>
							<line x1="12" y1="8" x2="12" y2="12"></line>
							<line x1="12" y1="16" x2="12.01" y2="16"></line>
						</svg>
					</div>
					<div class="upload-modal-title">upload failed</div>
				</div>
				<div class="upload-modal-status">{activeUpload.message}</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Download Overlay -->
{#if activeDownload?.show}
	<div class="modal-overlay dark">
		<div class="download-modal">
			<div class="download-header">
				<span class="download-title">Downloading...</span>
				<button class="download-cancel" onclick={cancelDownload}>&times;</button>
			</div>
			<div class="download-filename">{activeDownload.fileName}</div>
			<div class="download-bar-container">
				<div class="download-bar" style="width: {activeDownload.percentage}%"></div>
			</div>
			<div class="download-stats">
				<span>{activeDownload.percentage}%</span>
				<span
					>{formatFileSize(activeDownload.loaded)} / {formatFileSize(
						activeDownload.total
					)}</span
				>
			</div>
		</div>
	</div>
{/if}

<!-- FTP Setup Modal -->
{#if ftpSetupModal.show && ftpSetupModal.project}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={(e) => e.target === e.currentTarget && closeFtpSetup()}>
		<div class="ftp-setup-modal">
			<div class="modal-header">
				<h2>FTP Setup</h2>
				<button class="modal-close" onclick={closeFtpSetup}>&times;</button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label>Project Name</label>
					<input type="text" value={ftpSetupModal.project.name} readonly />
				</div>
				<div class="form-group">
					<label>Status</label>
					<div style="padding: 0.5rem 0;">
						{formatStatus(ftpSetupModal.project.status)}
					</div>
				</div>
				<div class="form-group">
					<label>Password</label>
					<div class="password-row">
						<input type="password" value="••••••••" readonly />
					</div>
				</div>
				<div class="form-group">
					<label>Files</label>
					<input
						type="text"
						value="{ftpSetupModal.project.file_count || 0} files"
						readonly
					/>
				</div>
				<div class="form-group">
					<label>Total Size</label>
					<input
						type="text"
						value={formatFileSize(ftpSetupModal.project.total_size || 0)}
						readonly
					/>
				</div>
				<div class="modal-actions">
					<button class="btn-primary" onclick={copyClientPortalLink}>
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
						Copy Client Portal Link
					</button>
					<button class="btn-secondary" onclick={regeneratePassword}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="23 4 23 10 17 10"></polyline>
							<polyline points="1 20 1 14 7 14"></polyline>
							<path
								d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
							></path>
						</svg>
						Regenerate Password
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Public Link Modal -->
{#if publicLinkModal.show}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-overlay"
		onclick={(e) => e.target === e.currentTarget && closePublicLinkModal()}
	>
		<div class="public-link-modal">
			<div class="modal-header">
				<h2>Public Download Link</h2>
				<button class="modal-close" onclick={closePublicLinkModal}>&times;</button>
			</div>
			<div class="modal-body">
				<p><strong>{publicLinkModal.fileName}</strong></p>
				<div class="url-display">{publicLinkModal.url}</div>
				{#if publicLinkModal.expiresAt}
					<p class="expires-text">
						Expires: {new Date(
							Number(publicLinkModal.expiresAt) * 1000
						).toLocaleString()}
					</p>
				{/if}
				<div class="modal-actions">
					<button class="btn-primary" onclick={copyPublicLink}>Copy Link</button>
					<button class="btn-secondary" onclick={closePublicLinkModal}>Close</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Selection Bar -->
{#if selectedFtpFiles.size > 0}
	<div class="selection-bar">
		<span class="selection-count">{selectedFtpFiles.size}</span>
		<span class="selection-label"
			>file{selectedFtpFiles.size !== 1 ? 's' : ''} selected</span
		>
		<button class="btn-share" onclick={shareSelectedFiles}>share selected</button>
		<button class="btn-clear" onclick={clearSelection}>clear</button>
	</div>
{/if}

<ToastContainer bind:this={toastRef} />

<style>
	:global(body) {
		overflow: auto !important;
	}

	.browser-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	/* Top Bar */
	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.top-bar h1 {
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
		font-family: var(--font-display);
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.ftp-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--subtle-text);
		cursor: pointer;
	}

	.btn-backup {
		background: var(--accent-teal);
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		font-family: var(--font-primary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.btn-backup:hover {
		background: #3a8bc7;
	}

	/* Table */
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

	.file-table tbody tr {
		border-bottom: var(--border-light);
		transition: background 0.2s;
	}

	.file-table td {
		padding: 0.75rem 1.5rem;
		font-size: 0.9rem;
	}

	/* Row types */
	.project-row {
		cursor: pointer;
		user-select: none;
	}

	.project-row:hover {
		background: #fafafa !important;
	}

	.folder-row {
		background: #f9f9f9 !important;
		cursor: pointer;
		user-select: none;
	}

	.folder-row:hover {
		background: #f0f0f0 !important;
	}

	:global(.folder-row.drag-over),
	:global(.ftp-folder-row.drag-over) {
		background: #e3f2fd !important;
		border-left: 3px solid var(--accent-teal);
	}

	.file-row:hover {
		background: var(--bg-primary);
	}

	.file-row.selected {
		background: rgba(70, 159, 224, 0.05);
	}

	/* Tree elements */
	.tree-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		color: var(--primary-text);
	}

	.chevron {
		display: inline-block;
		transition: transform 0.2s;
		font-size: 0.7rem;
		color: var(--subtle-text);
	}

	.chevron.expanded {
		transform: rotate(90deg);
	}

	.project-tag {
		color: var(--accent-teal);
		margin-left: 0.5rem;
		font-size: 0.85em;
		font-weight: normal;
	}

	.media-link {
		color: var(--accent-teal);
		cursor: pointer;
		text-decoration: none;
	}

	.media-link:hover {
		text-decoration: underline;
	}

	.file-checkbox {
		cursor: pointer;
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

	/* Actions */
	.file-actions {
		display: flex;
		gap: 0.25rem;
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

	.btn-action.btn-delete:hover {
		color: var(--accent-red);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted-text);
	}

	/* Modal overlay */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 10001;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-overlay.dark {
		background: rgba(0, 0, 0, 0.7);
	}

	/* Upload modal */
	.upload-modal {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		min-width: 400px;
		max-width: 500px;
	}

	.upload-modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.upload-modal-icon {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(70, 159, 224, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-teal);
	}

	.upload-modal-icon.error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.upload-modal-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.upload-modal-status {
		font-size: 0.9rem;
		color: var(--muted-text);
		margin-bottom: 1rem;
	}

	.upload-progress-container {
		width: 100%;
		height: 8px;
		background: #f0f0f0;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.upload-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent-teal) 0%, var(--accent-blue) 100%);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.upload-progress-text {
		font-size: 0.85rem;
		color: var(--subtle-text);
		text-align: center;
	}

	.upload-complete-icon {
		width: 60px;
		height: 60px;
		margin: 1rem auto;
		border-radius: 50%;
		background: rgba(16, 185, 129, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #10b981;
	}

	/* Download modal */
	.download-modal {
		background: white;
		border-radius: 8px;
		padding: 1.5rem;
		min-width: 350px;
		max-width: 450px;
	}

	.download-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.download-title {
		font-weight: 600;
		font-size: 1rem;
	}

	.download-cancel {
		background: none;
		border: none;
		color: #888;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.download-filename {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1rem;
		word-break: break-all;
	}

	.download-bar-container {
		background: #f0f0f0;
		border-radius: 4px;
		height: 8px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.download-bar {
		background: var(--accent-teal);
		height: 100%;
		transition: width 0.1s;
	}

	.download-stats {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		color: #888;
	}

	/* FTP Setup Modal */
	.ftp-setup-modal,
	.public-link-modal {
		background: white;
		border-radius: 12px;
		width: 100%;
		max-width: 600px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		padding: 1.5rem;
		border-bottom: 1px solid #f0f0f0;
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
		color: #888;
	}

	.modal-close:hover {
		color: #1a1a1a;
	}

	.modal-body {
		padding: 2rem;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--secondary-text);
		font-size: 0.9rem;
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		font-family: var(--font-body);
		font-size: 0.95rem;
		background: #fafafa;
	}

	.password-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.password-row input {
		flex: 1;
		font-family: monospace;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: var(--accent-teal);
		color: white;
		border: none;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.btn-primary:hover {
		background: var(--accent-blue);
	}

	.btn-secondary {
		padding: 0.75rem 1.5rem;
		background: white;
		color: #666;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: var(--bg-primary);
	}

	.url-display {
		background: var(--bg-primary);
		padding: 1rem;
		border-radius: 8px;
		margin: 1rem 0;
		word-break: break-all;
		font-family: var(--font-mono);
		font-size: 0.9rem;
	}

	.expires-text {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1rem;
	}

	/* Selection Bar */
	.selection-bar {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: white;
		padding: 12px 24px;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		display: flex;
		align-items: center;
		gap: 16px;
		z-index: 1000;
		font-family: var(--font-primary);
	}

	.selection-count {
		font-weight: 500;
	}

	.selection-label {
		color: var(--subtle-text);
	}

	.btn-share {
		background: var(--accent-teal);
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		font-family: var(--font-primary);
	}

	.btn-clear {
		background: #f0f0f0;
		color: var(--primary-text);
		border: none;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--font-primary);
	}
</style>
