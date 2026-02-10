<script lang="ts">
	import { onMount } from 'svelte';

	// Electron detection
	let isElectron = $state(false);
	let electronAPI: any = $state(null);

	// State
	let currentComments = $state<any[]>([]);
	let isConnectedToPT = $state(false);
	let isOperationInProgress = $state(false);
	let currentOperation = $state<string | null>(null);
	let isStartupPhase = $state(true);
	let userExplicitlyDisconnected = $state(false);

	// File queue
	let fileQueue = $state<any[]>([]);
	let allCommentsFromFiles = $state<any[]>([]);

	// UI state
	let sessionStart = $state('00:00:00:00');
	let sessionName = $state('--');
	let connectionState = $state('disconnected');
	let markerProgress = $state(0);
	let markerProgressVisible = $state(false);
	let uploadStatus = $state('drag & drop .txt files here or click to import');

	// Toast queue (sequential display like legacy)
	let toasts = $state<any[]>([]);
	let toastQueue: any[] = [];
	let isToastActive = false;

	onMount(() => {
		// Detect Electron environment
		if (typeof window !== 'undefined' && (window as any).electronAPI) {
			isElectron = true;
			electronAPI = (window as any).electronAPI;
			initializeElectronApp();
		} else {
			isElectron = false;
		}
	});

	async function initializeElectronApp() {
		if (!electronAPI) return;

		// Setup menu handlers
		electronAPI.onMenuImportFile?.(() => {
			openFileDialog();
		});

		electronAPI.onMenuStartOver?.(() => {
			startOver();
		});

		electronAPI.onMenuAbout?.(() => {
			alert('NoteMarker v1.0.1\n\nConvert Frame.io comments to Pro Tools markers\n\nby Alternatone');
		});

		// Setup PTSL event listeners
		if (electronAPI.ptsl) {
			electronAPI.ptsl.onConnectionStateChanged?.((data: any) => {
				handleConnectionStateChange(data);
			});

			electronAPI.ptsl.onSessionInfoChanged?.((data: any) => {
				handleSessionInfoChange(data);
			});

			electronAPI.ptsl.onMarkerProgress?.((progress: any) => {
				updateMarkerProgress(progress);
			});

			// Load initial state
			try {
				const state = await electronAPI.ptsl.getConnectionState();
				isConnectedToPT = state.state === 'connected' && state.isConnected && state.isRegistered;
				updateConnectionStatus(state);

				if (state.sessionInfo) {
					sessionName = state.sessionInfo.name || '--';
				}

				// Attempt auto-connect
				if (!isConnectedToPT) {
					setTimeout(async () => {
						try {
							const result = await electronAPI.ptsl.retryConnection();
							if (result.success) {
								showToast('success', 'Connected to Pro Tools');
							}
						} catch (error) {
							// Silent failure on auto-connect
						}
					}, 500);
				}
			} catch (error) {
				console.error('Failed to load connection state:', error);
			} finally {
				setTimeout(() => {
					isStartupPhase = false;
				}, 1500);
			}
		}

		// Listen for exported comments from media review
		window.addEventListener('message', (event) => {
			if (event.data.type === 'exportToNotes' && event.data.comments) {
				addFileToQueue(
					{
						fileName: event.data.fileName || 'Media Review Comments',
						filePath: null
					},
					event.data.comments
				);
				showToast('success', `Imported ${event.data.comments.length} comments from media review`);
			}
		});
	}

	function handleConnectionStateChange(data: any) {
		const previousState = isConnectedToPT;
		isConnectedToPT = data.isConnected && data.isRegistered && data.state === 'connected';

		updateConnectionStatus(data);

		if (!isStartupPhase && previousState !== isConnectedToPT) {
			if (isConnectedToPT) {
				showToast('success', 'Successfully connected to Pro Tools');
			} else if (data.wasConnected) {
				showToast('warning', 'Disconnected from Pro Tools');
			}
		}
	}

	function handleSessionInfoChange(data: any) {
		if (data.sessionInfo) {
			sessionName = data.sessionInfo.name || 'No Session Open';
		} else {
			sessionName = 'No Session Open';
		}
	}

	function updateConnectionStatus(status: any) {
		connectionState = status.state || 'disconnected';
	}

	function updateMarkerProgress(progressData: any) {
		markerProgress = progressData.percent || 0;

		if (progressData.phase === 'creating' || progressData.phase === 'starting') {
			markerProgressVisible = true;
		}

		if (progressData.phase === 'completed' || progressData.phase === 'error') {
			setTimeout(() => {
				markerProgressVisible = false;
				currentOperation = null;
				isOperationInProgress = false;
			}, 2000);
		}
	}

	async function openFileDialog() {
		if (!electronAPI?.fileSystem) return;

		try {
			const result = await electronAPI.fileSystem.showOpenDialog({
				title: 'Import Frame.io TXT Files',
				filters: [
					{ name: 'Text Files', extensions: ['txt'] },
					{ name: 'All Files', extensions: ['*'] }
				],
				properties: ['openFile', 'multiSelections']
			});

			if (result.canceled || !result.filePaths) return;

			uploadStatus = `processing ${result.filePaths.length} file${result.filePaths.length !== 1 ? 's' : ''}...`;

			for (const filePath of result.filePaths) {
				await handleFilePathForQueue(filePath);
			}

			updateCombinedCommentsDisplay();
		} catch (error: any) {
			showToast('error', 'Failed to open file dialog: ' + error.message);
		}
	}

	async function handleFilePathForQueue(filePath: string) {
		if (!electronAPI?.fileSystem) return;

		try {
			const fileResult = await electronAPI.fileSystem.readFile(filePath);
			if (!fileResult.success) {
				showToast('error', `Failed to read ${filePath}`);
				return;
			}

			const parseResult = await electronAPI.fileSystem.parseFrameioTXT(
				fileResult.content,
				fileResult.fileName
			);
			if (!parseResult.success) {
				showToast('error', `Failed to parse ${fileResult.fileName}`);
				return;
			}

			addFileToQueue(
				{
					fileName: fileResult.fileName,
					filePath: filePath
				},
				parseResult.comments
			);
		} catch (error: any) {
			showToast('error', 'Failed to process file: ' + error.message);
		}
	}

	function addFileToQueue(fileInfo: any, comments: any[]) {
		const queueItem = {
			id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			fileName: fileInfo.fileName,
			filePath: fileInfo.filePath || null,
			comments: comments || [],
			addedAt: new Date().toISOString(),
			status: 'queued'
		};

		fileQueue.push(queueItem);

		if (comments && comments.length > 0) {
			allCommentsFromFiles.push(
				...comments.map((comment) => ({
					...comment,
					sourceFile: fileInfo.fileName,
					queueId: queueItem.id
				}))
			);
		}

		updateCombinedCommentsDisplay();
	}

	function removeFileFromQueue(queueId: string) {
		const fileIndex = fileQueue.findIndex((item) => item.id === queueId);
		if (fileIndex === -1) return;

		fileQueue.splice(fileIndex, 1);
		allCommentsFromFiles = allCommentsFromFiles.filter((comment) => comment.queueId !== queueId);
		updateCombinedCommentsDisplay();
	}

	function clearFileQueue() {
		fileQueue = [];
		allCommentsFromFiles = [];
		updateCombinedCommentsDisplay();
	}

	function updateCombinedCommentsDisplay() {
		if (fileQueue.length > 0) {
			currentComments = allCommentsFromFiles;
			const totalFiles = fileQueue.length;
			const totalComments = allCommentsFromFiles.length;
			uploadStatus = `${totalFiles} file${totalFiles !== 1 ? 's' : ''} queued: ${totalComments} comments ready`;
		} else {
			currentComments = [];
			uploadStatus = 'drag & drop .txt files here or click to import';
		}
	}

	async function handleConnectionButtonClick() {
		if (!electronAPI?.ptsl) return;

		if (isConnectedToPT) {
			// Disconnect
			try {
				userExplicitlyDisconnected = true;
				await electronAPI.ptsl.disconnect();
			} catch (error: any) {
				showToast('error', 'Failed to disconnect: ' + error.message);
			}
		} else {
			// Connect
			try {
				userExplicitlyDisconnected = false;
				const result = await electronAPI.ptsl.retryConnection();
				if (result.success) {
					showToast('success', 'Successfully connected to Pro Tools');
				} else {
					showToast('error', result.error || 'Could not connect to Pro Tools');
				}
			} catch (error: any) {
				showToast('error', 'Could not connect to Pro Tools');
			}
		}
	}

	async function runNoteMarker() {
		if (!electronAPI?.ptsl) return;

		if (!isConnectedToPT) {
			showToast('error', 'Not connected to Pro Tools. Please check your connection.');
			return;
		}

		if (!currentComments || currentComments.length === 0) {
			showToast('error', 'Please import a Frame.io TXT file first.');
			return;
		}

		try {
			currentOperation = 'validating';
			isOperationInProgress = true;

			const settings = {
				fps: '25',
				markerTrack: 1,
				sessionStart: sessionStart
			};

			// Validate session
			const sessionValidation = await electronAPI.ptsl.validateSessionSettings(settings);
			if (!sessionValidation.success || !sessionValidation.validation.valid) {
				showToast('error', sessionValidation.error || 'Session validation failed');
				return;
			}

			// Show warnings
			if (sessionValidation.validation.warnings.length > 0) {
				const continueAnyway = confirm(
					'Session Validation Warnings:\n\n' +
						sessionValidation.validation.warnings.join('\n') +
						'\n\nDo you want to continue creating markers anyway?'
				);
				if (!continueAnyway) return;
			}

			currentOperation = 'creating-markers';
			markerProgressVisible = true;

			// Create markers
			const result = await electronAPI.ptsl.createMarkers(currentComments, settings);

			if (result.success) {
				if (result.summary.failed === 0) {
					showToast(
						'success',
						`All ${result.summary.successful} markers created successfully in Pro Tools.`
					);
				} else {
					showToast(
						'warning',
						`${result.summary.successful} of ${result.summary.total} markers created. ${result.summary.failed} failed.`
					);
				}
			} else {
				showToast('error', result.error || 'Marker creation failed');
			}
		} catch (error: any) {
			showToast('error', 'Unexpected error: ' + error.message);
		} finally {
			currentOperation = null;
			isOperationInProgress = false;
		}
	}

	function startOver() {
		currentComments = [];
		clearFileQueue();
		uploadStatus = 'drag & drop .txt files here or click to import';
		sessionStart = '00:00:00:00';
		markerProgressVisible = false;
		markerProgress = 0;
		currentOperation = null;
		isOperationInProgress = false;
		showToast('info', 'Reset complete (Pro Tools connection preserved)');
	}

	function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
		const toast = {
			id: Date.now() + Math.random(),
			type,
			message,
			timestamp: Date.now()
		};
		toastQueue.push(toast);
		processToastQueue();
	}

	function processToastQueue() {
		if (isToastActive || toastQueue.length === 0) return;
		isToastActive = true;

		const toast = toastQueue.shift()!;
		toasts = [toast];
		const duration = toast.type === 'error' ? 8000 : toast.type === 'warning' ? 6000 : 4000;

		setTimeout(() => {
			toasts = [];
			isToastActive = false;
			processToastQueue();
		}, duration);
	}

	// Computed values
	const validCommentsCount = $derived(currentComments.filter((c) => c.timecode && c.timecode !== '00:00:00:00').length);
	const canRunMarkers = $derived(validCommentsCount > 0 && isConnectedToPT && !isOperationInProgress);
	const canUploadFiles = $derived(!isOperationInProgress || currentOperation !== 'creating-markers');
	const showQueueContainer = $derived(fileQueue.length >= 2);
	const connectionButtonText = $derived(
		isConnectedToPT ? 'Disconnect' : connectionState === 'connecting' ? 'Connecting...' : 'Connect'
	);
	const connectionButtonClass = $derived(isConnectedToPT ? 'connected' : '');
	const statusDotClass = $derived(
		connectionState === 'connected' ? 'connected' : connectionState === 'connecting' ? 'connecting' : 'disconnected'
	);
</script>

<svelte:head>
	<title>Notes - NoteMarker - Alternassist</title>
</svelte:head>

{#if !isElectron}
	<!-- Graceful degradation for web browsers -->
	<div class="electron-required">
		<h1>Desktop App Required</h1>
		<p>
			NoteMarker uses Pro Tools Scripting Library (PTSL) and is only available in the Alternassist
			desktop application.
		</p>
		<p>Please download and install the desktop app to use this feature.</p>
	</div>
{:else}
	<!-- Full NoteMarker interface (Electron only) -->
	<div class="container">
		<div class="notemarker-header">
			<h1 class="notemarker-title">NoteMarker</h1>
			<p class="notemarker-subtitle">Convert Frame.io comments to Pro Tools markers</p>
		</div>

		<!-- Connection Status + TC Offset -->
		<div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: stretch;">
			<!-- Connection Status -->
			<div class="status-bar" style="flex: 1; margin-bottom: 0;">
				<div class="status-indicator">
					<div class="status-left">
						<button
							class="connection-button {connectionButtonClass}"
							onclick={handleConnectionButtonClick}
							title="Connect to Pro Tools"
						>
							<span class="connection-text">{connectionButtonText}</span>
						</button>
						<div class="session-status">
							<div class="status-dot {statusDotClass}"></div>
							<span>session: <span class="session-name">{sessionName}</span></span>
						</div>
					</div>
				</div>
				{#if markerProgressVisible}
					<div class="marker-progress-bar">
						<div class="marker-progress-fill" style="width: {markerProgress}%"></div>
					</div>
				{/if}
			</div>

			<!-- TC Offset -->
			<div class="session-settings" style="flex: 1; margin-bottom: 0; justify-content: center;">
				<div class="settings-row" style="justify-content: center;">
					<div class="setting-group">
						<label class="setting-label">tc offset</label>
						<input
							type="text"
							class="session-start-input"
							bind:value={sessionStart}
							placeholder="00:00:00:00"
						/>
					</div>
				</div>
			</div>
		</div>

		<div class="main-content">
			<!-- Upload zone + Preview -->
			<div style="display: flex; gap: 1rem; align-items: stretch; min-height: 500px;">
				<!-- Left: Upload and queue -->
				<div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="upload-zone"
					class:disabled={!canUploadFiles}
					style="min-height: 250px;"
					ondragover={(e) => { e.preventDefault(); if (canUploadFiles) e.currentTarget.classList.add('dragover'); }}
					ondragleave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); }}
					ondrop={async (e) => {
						e.preventDefault();
						e.currentTarget.classList.remove('dragover');
						if (!canUploadFiles || !e.dataTransfer?.files) return;
						const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt'));
						if (files.length === 0) { showToast('warning', 'Please drop .txt files only'); return; }
						uploadStatus = `processing ${files.length} file${files.length !== 1 ? 's' : ''}...`;
						for (const file of files) {
							const text = await file.text();
							if (electronAPI?.fileSystem?.parseFrameioTXT) {
								const parseResult = await electronAPI.fileSystem.parseFrameioTXT(text, file.name);
								if (parseResult.success) {
									addFileToQueue({ fileName: file.name, filePath: null }, parseResult.comments);
								} else {
									showToast('error', `Failed to parse ${file.name}`);
								}
							}
						}
						updateCombinedCommentsDisplay();
					}}
				>
						<div class="upload-icon">📄</div>
						<p>{uploadStatus}</p>
						<button class="upload-btn" onclick={openFileDialog} disabled={!canUploadFiles}>
							choose files
						</button>
					</div>

					<!-- File Queue -->
					{#if showQueueContainer}
						<div class="file-queue-container">
							<div class="queue-header">
								<h4>Queued Files</h4>
								<div class="queue-actions">
									<button class="clear-queue-btn" onclick={clearFileQueue}>Clear All</button>
								</div>
							</div>
							<div class="queue-summary">
								{fileQueue.length} file{fileQueue.length !== 1 ? 's' : ''} queued ({allCommentsFromFiles.length} total
								comments)
							</div>
							<div class="file-queue-list">
								{#each fileQueue as file (file.id)}
									<div class="queue-item">
										<div class="queue-item-info">
											<span class="file-name">{file.fileName}</span>
											<span class="file-stats">{file.comments.length} comments</span>
										</div>
										<button
											class="remove-file-btn"
											onclick={() => removeFileFromQueue(file.id)}
											title="Remove file"
										>
											×
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if validCommentsCount > 0}
						<div class="validation-section">
							<div class="validation-summary">
								<div class="validation-item validation-valid">
									{validCommentsCount} marker{validCommentsCount !== 1 ? 's' : ''} ready
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Right: Preview -->
				<div style="flex: 1;">
					<div class="preview-section" style="min-height: 500px;">
						<div class="preview-header">
							<h3>
								{#if validCommentsCount === 0}
									no comments loaded
								{:else}
									{validCommentsCount} comment{validCommentsCount !== 1 ? 's' : ''} found
								{/if}
							</h3>
						</div>
						<div>
							{#if validCommentsCount === 0}
								<div style="text-align: center; color: #95a5a6; padding: 2rem;">
									import a file to see comments here
								</div>
							{:else}
								{#each currentComments.filter((c) => c.timecode && c.timecode !== '00:00:00:00') as comment}
									<div class="comment-item" class:reply={comment.isReply}>
										<div class="comment-timecode">{comment.timecode}</div>
										<div class="comment-text">{comment.text}</div>
										<div class="comment-author">
											{comment.author}{comment.isReply ? ' [REPLY]' : ''}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Controls -->
			<div class="controls" style="margin-top: auto; padding-top: 2rem;">
				<div class="control-row">
					<button class="btn" onclick={startOver} disabled={isOperationInProgress}>
						start over
					</button>
					<button class="btn btn-primary" onclick={runNoteMarker} disabled={!canRunMarkers}>
						{currentOperation === 'creating-markers' ? 'Creating Markers...' : 'create markers'}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Toast notifications -->
	{#if toasts.length > 0}
		<div class="toast-container">
			{#each toasts as toast (toast.id)}
				<div class="toast toast-{toast.type} toast-show">
					<div class="toast-icon">
						{#if toast.type === 'success'}✓{/if}
						{#if toast.type === 'error'}✕{/if}
						{#if toast.type === 'warning'}⚠{/if}
						{#if toast.type === 'info'}ⓘ{/if}
					</div>
					<div class="toast-content">
						<div class="toast-message">{toast.message}</div>
					</div>
					<button class="toast-close" onclick={() => (toasts = toasts.filter((t) => t.id !== toast.id))}>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	/* Electron required message */
	.electron-required {
		max-width: 600px;
		margin: 4rem auto;
		text-align: center;
		padding: 3rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-subtle);
	}

	.electron-required h1 {
		font-size: 2rem;
		margin-bottom: 1.5rem;
		color: var(--primary-text);
	}

	.electron-required p {
		font-size: 1.1rem;
		margin-bottom: 1rem;
		color: var(--secondary-text);
		line-height: 1.6;
	}

	/* NoteMarker header */
	.notemarker-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.notemarker-title {
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 600;
		background: linear-gradient(90deg, #007acc, #ff6b6b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 0.25rem;
	}

	.notemarker-subtitle {
		color: var(--secondary-text);
		font-size: 1rem;
	}

	/* Main container */
	.container {
		max-width: 100%;
		margin: 0 auto;
		padding: 1rem;
		height: calc(100vh - 6rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Status bar */
	.status-bar {
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		padding: 0.8rem 1.2rem;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border-light);
		box-shadow: var(--shadow-base);
		min-height: 60px;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		justify-content: center;
	}

	.connection-button {
		background: var(--accent-blue);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 0.5rem 1rem;
		font-family: var(--font-primary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 100px;
	}

	.connection-button:hover {
		filter: brightness(0.85);
		transform: translateY(-1px);
	}

	.connection-button.connected {
		background: var(--accent-red);
	}

	.session-status {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-error);
	}

	.status-dot.connected {
		background: var(--color-success);
	}

	.status-dot.connecting {
		background: var(--color-warning);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.session-name {
		color: var(--accent-blue);
	}

	.marker-progress-bar {
		width: 100%;
		height: 8px;
		background: #ecf0f1;
		border-radius: 4px;
		overflow: hidden;
		margin-top: 0.5rem;
	}

	.marker-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent-blue), var(--accent-red));
		transition: width 0.5s ease;
	}

	/* Session settings */
	.session-settings {
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		padding: 0.8rem 1.2rem;
		border: 1px solid var(--color-border-light);
		box-shadow: var(--shadow-base);
		display: flex;
		align-items: center;
		min-height: 60px;
	}

	.settings-row {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.setting-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.setting-label {
		font-size: 0.85rem;
		color: var(--secondary-text);
		font-weight: 500;
	}

	.session-start-input {
		font-family: var(--font-primary);
		font-size: 0.85rem;
		padding: 0.5rem 0.8rem;
		border: 1px solid var(--color-border-medium);
		border-radius: 6px;
		width: 120px;
		background: white;
		color: var(--primary-text);
	}

	/* Main content */
	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow: hidden;
	}

	/* Upload zone */
	.upload-zone {
		border: 2px dashed var(--color-border-medium);
		border-radius: var(--radius-xl);
		padding: 1.5rem;
		text-align: center;
		transition: all 0.3s;
		background: var(--bg-panel);
		display: flex;
		flex-direction: column;
		justify-content: center;
		box-shadow: var(--shadow-md);
	}

	.upload-zone:not(.disabled):hover {
		border-color: var(--accent-blue);
		background: #f8f9ff;
	}

	.upload-zone.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.upload-zone.dragover {
		border-color: var(--accent-blue);
		background: #f8f9ff;
	}

	.upload-icon {
		font-size: 2.5rem;
		margin-bottom: 1rem;
		opacity: 0.6;
	}

	.upload-btn {
		background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-red) 100%);
		border: none;
		padding: 0.8rem 1.5rem;
		border-radius: var(--radius-lg);
		color: white;
		font-family: var(--font-primary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.2s;
		margin-top: 1rem;
		max-width: 200px;
		margin-left: auto;
		margin-right: auto;
		box-shadow: var(--shadow-base);
	}

	.upload-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: var(--shadow-lg);
	}

	.upload-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* File queue */
	.file-queue-container {
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		padding: 1rem;
		border: 1px solid var(--color-border-light);
		box-shadow: var(--shadow-base);
	}

	.queue-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.8rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.queue-header h4 {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0;
	}

	.clear-queue-btn {
		background: var(--accent-red);
		color: white;
		border: none;
		padding: 0.3rem 0.8rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.clear-queue-btn:hover {
		filter: brightness(0.85);
	}

	.queue-summary {
		color: var(--secondary-text);
		font-size: 0.75rem;
		margin-bottom: 0.8rem;
		text-align: center;
	}

	.file-queue-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 150px;
		overflow-y: auto;
	}

	.queue-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: #f8f9fa;
		border-radius: 6px;
		padding: 0.6rem;
		border: 1px solid var(--color-border-light);
	}

	.queue-item-info {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-weight: 500;
		color: var(--primary-text);
		font-size: 0.85rem;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-stats {
		color: var(--secondary-text);
		font-size: 0.75rem;
	}

	.remove-file-btn {
		background: var(--accent-red);
		color: white;
		border: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 14px;
		font-weight: bold;
		cursor: pointer;
		transition: background 0.2s;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-file-btn:hover {
		filter: brightness(0.85);
	}

	/* Validation */
	.validation-section {
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		padding: 1rem;
		border: 1px solid var(--color-border-light);
		box-shadow: var(--shadow-base);
	}

	.validation-summary {
		display: flex;
		gap: 1rem;
	}

	.validation-item {
		flex: 1;
		padding: 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		text-align: center;
	}

	.validation-valid {
		background: #f0f9f3;
		border: 1px solid var(--color-success);
		color: #229954;
	}

	/* Preview */
	.preview-section {
		background: var(--bg-panel);
		border-radius: var(--radius-xl);
		padding: 1rem;
		overflow-y: auto;
		border: 1px solid var(--color-border-light);
		box-shadow: var(--shadow-md);
	}

	.preview-header {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.8rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.preview-header h3 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.comment-item {
		background: #f8f9fa;
		border-radius: 6px;
		padding: 0.8rem;
		margin-bottom: 0.8rem;
		border-left: 3px solid var(--accent-blue);
		font-size: 0.85rem;
	}

	.comment-item.reply {
		border-left-color: var(--accent-red);
		background: #fff8f0;
		position: relative;
	}

	.comment-item.reply::before {
		content: '↳';
		position: absolute;
		left: -15px;
		color: var(--accent-red);
		font-weight: bold;
	}

	.comment-timecode {
		font-family: var(--font-primary);
		color: var(--accent-blue);
		font-weight: bold;
		margin-bottom: 0.3rem;
	}

	.comment-text {
		color: var(--primary-text);
		margin-bottom: 0.3rem;
	}

	.comment-author {
		color: var(--secondary-text);
		font-size: 0.75rem;
	}

	/* Controls */
	.controls {
		flex-shrink: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border-light);
	}

	.control-row {
		display: flex;
		gap: 1rem;
	}

	.btn {
		background: var(--bg-panel);
		border: 1px solid var(--color-border-medium);
		padding: 0.6rem 1rem;
		border-radius: 6px;
		color: var(--primary-text);
		cursor: pointer;
		font-family: var(--font-primary);
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 0.2s;
		flex: 1;
	}

	.btn:hover:not(:disabled) {
		background: #f8f9fa;
		border-color: var(--color-border-strong);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-red) 100%);
		border: none;
		color: white;
		box-shadow: var(--shadow-base);
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: var(--shadow-lg);
	}

	.btn-primary:disabled {
		background: #bdc3c7;
		color: var(--secondary-text);
	}

	/* Toast notifications */
	.toast-container {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 10000;
		pointer-events: none;
	}

	.toast {
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
		border-left: 4px solid #3498db;
		margin-bottom: 12px;
		min-width: 320px;
		max-width: 480px;
		display: flex;
		align-items: center;
		padding: 16px 18px;
		transition: all 0.3s;
		pointer-events: all;
		position: relative;
	}

	.toast-show {
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from {
			transform: translateX(400px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.toast-success {
		border-left-color: var(--color-success);
	}

	.toast-error {
		border-left-color: var(--color-error);
	}

	.toast-warning {
		border-left-color: var(--color-warning);
	}

	.toast-info {
		border-left-color: #3498db;
	}

	.toast-icon {
		font-size: 20px;
		font-weight: bold;
		margin-right: 14px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-success .toast-icon {
		color: var(--color-success);
	}

	.toast-error .toast-icon {
		color: var(--color-error);
	}

	.toast-warning .toast-icon {
		color: var(--color-warning);
	}

	.toast-info .toast-icon {
		color: #3498db;
	}

	.toast-content {
		flex: 1;
		min-width: 0;
	}

	.toast-message {
		font-size: 13px;
		color: var(--secondary-text);
		line-height: 1.4;
		word-wrap: break-word;
	}

	.toast-close {
		position: absolute;
		top: 8px;
		right: 8px;
		background: none;
		border: none;
		font-size: 18px;
		color: var(--muted-text);
		cursor: pointer;
		padding: 4px;
		line-height: 1;
		transition: color 0.2s;
	}

	.toast-close:hover {
		color: var(--secondary-text);
	}
</style>
