<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// URL parameters
	let currentFileId = $derived($page.url.searchParams.get('file'));
	let projectId = $derived($page.url.searchParams.get('project'));
	let ftpFilePath = $derived($page.url.searchParams.get('ftpFile'));
	let shareFileId = $derived($page.url.searchParams.get('fileId'));

	// State
	let comments = $state<any[]>([]);
	let currentVideoFile = $state<string | null>(null);
	let activeCommentId = $state<string | null>(null);
	let replyingToId = $state<string | null>(null);
	let wasPlayingBeforeComment = $state(false);
	let commentTimecode = $state(0);
	let currentDownloadUrl = $state<string | null>(null);
	let currentFileName = $state<string | null>(null);
	let isSubmittingComment = $state(false);

	// Form inputs
	let authorName = $state('');
	let commentText = $state('');

	// Player state
	let videoPlayer: HTMLVideoElement | null = $state(null);
	let audioPlayer: HTMLAudioElement | null = $state(null);
	let activePlayer: HTMLVideoElement | HTMLAudioElement | null = $state(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(100);
	let progress = $state(0);
	let showPlaceholder = $state(true);
	let showAudioVisualizer = $state(false);

	// Computed
	const formattedTime = $derived(formatTime(currentTime));
	const formattedDuration = $derived(formatTime(duration));
	const totalCommentsCount = $derived(comments.length);
	const openCommentsCount = $derived(comments.filter(c => (c.status || 'open') === 'open').length);
	const topLevelComments = $derived(comments.filter(c => !c.reply_to_id));

	onMount(async () => {
		// Load saved author from localStorage
		const savedAuthor = localStorage.getItem('video-review-author');
		if (savedAuthor) {
			authorName = savedAuthor;
		}

		// Load file based on parameters
		if (ftpFilePath) {
			loadFtpFile(ftpFilePath);
		} else if (shareFileId) {
			await loadPublicFile(shareFileId);
		} else if (currentFileId && projectId) {
			await Promise.all([loadFileFromBackend(), loadCommentsFromBackend()]);
		}
	});

	function formatTime(seconds: number): string {
		if (isNaN(seconds) || seconds < 0) return '00:00:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function parseTime(timeString: string): number {
		const parts = timeString.split(':').map((p) => parseInt(p) || 0);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		return 0;
	}

	async function loadFileFromBackend() {
		try {
			const filesResponse = await fetch(`/api/projects/${projectId}/files`);
			if (!filesResponse.ok) {
				alert('Failed to load file');
				return;
			}

			const files = await filesResponse.json();
			const file = files.find((f: any) => f.id == currentFileId);

			if (!file) {
				alert('File not found');
				window.location.href = '/';
				return;
			}

			const isAudio = file.mime_type && file.mime_type.startsWith('audio/');

			if (isAudio) {
				activePlayer = audioPlayer;
				showAudioVisualizer = true;
				if (videoPlayer) videoPlayer.src = '';
			} else {
				activePlayer = videoPlayer;
				showAudioVisualizer = false;
				if (audioPlayer) audioPlayer.src = '';
			}

			const streamUrl = `/api/files/${projectId}/${currentFileId}/stream`;
			if (activePlayer) {
				activePlayer.src = streamUrl;
			}

			currentVideoFile = file.original_name;
			currentFileName = file.original_name;
			document.title = file.original_name + ' - Alternassist';

			showPlaceholder = false;

			if (activePlayer) {
				activePlayer.load();
			}
		} catch (error) {
			console.error('Error loading file:', error);
			alert('Failed to load file');
		}
	}

	function loadFtpFile(filePath: string) {
		try {
			const fileName = filePath.split('/').pop() || '';
			const ext = fileName.split('.').pop()?.toLowerCase() || '';
			const audioExtensions = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'];
			const isAudio = audioExtensions.includes(ext);

			if (isAudio) {
				activePlayer = audioPlayer;
				showAudioVisualizer = true;
				if (videoPlayer) videoPlayer.src = '';
			} else {
				activePlayer = videoPlayer;
				showAudioVisualizer = false;
				if (audioPlayer) audioPlayer.src = '';
			}

			const streamUrl = `/api/ftp/public/stream?path=${encodeURIComponent(filePath)}`;
			if (activePlayer) {
				activePlayer.src = streamUrl;
			}

			currentDownloadUrl = `/api/ftp/public/download?path=${encodeURIComponent(filePath)}`;
			currentFileName = fileName;
			currentVideoFile = fileName;
			document.title = fileName + ' - Alternassist';

			showPlaceholder = false;

			if (activePlayer) {
				activePlayer.load();
			}

			comments = [];
		} catch (error) {
			console.error('Error loading FTP file:', error);
			alert('Failed to load FTP file');
		}
	}

	async function loadPublicFile(fileId: string) {
		try {
			const response = await fetch(`/api/files/public/${fileId}`);
			if (!response.ok) {
				throw new Error('Failed to load file metadata');
			}

			const file = await response.json();
			const isAudio = file.mime_type.startsWith('audio/');

			if (isAudio) {
				activePlayer = audioPlayer;
				showAudioVisualizer = true;
				if (videoPlayer) videoPlayer.src = '';
			} else {
				activePlayer = videoPlayer;
				showAudioVisualizer = false;
				if (audioPlayer) audioPlayer.src = '';
			}

			const streamUrl = `/api/files/public/${fileId}/stream`;
			if (activePlayer) {
				activePlayer.src = streamUrl;
			}

			currentDownloadUrl = streamUrl;
			currentFileName = file.original_name;
			currentVideoFile = file.original_name;
			document.title = file.original_name + ' - Alternassist';

			showPlaceholder = false;

			if (activePlayer) {
				activePlayer.load();
			}

			if (projectId) {
				await loadCommentsFromBackend();
			} else {
				comments = [];
			}
		} catch (error) {
			console.error('Error loading public file:', error);
			alert('Failed to load file');
		}
	}

	async function loadCommentsFromBackend() {
		try {
			if (projectId && currentFileId) {
				const response = await fetch(`/api/files/${projectId}/${currentFileId}/comments`);
				if (response.ok) {
					comments = await response.json();
					clearCommentsLocalStorage();
				} else {
					comments = loadCommentsFromLocalStorage();
				}
			} else {
				comments = loadCommentsFromLocalStorage();
			}
		} catch (error) {
			console.error('Error loading comments:', error);
			comments = loadCommentsFromLocalStorage();
		}
	}

	function getCommentsStorageKey(): string | null {
		return currentFileId || shareFileId ? `video-review-comments-${currentFileId || shareFileId}` : null;
	}

	function saveCommentsToLocalStorage() {
		const key = getCommentsStorageKey();
		if (key && comments.length > 0) {
			localStorage.setItem(key, JSON.stringify(comments));
		}
	}

	function loadCommentsFromLocalStorage(): any[] {
		const key = getCommentsStorageKey();
		if (key) {
			const saved = localStorage.getItem(key);
			if (saved) {
				try {
					return JSON.parse(saved);
				} catch (e) {
					console.error('Error parsing saved comments:', e);
				}
			}
		}
		return [];
	}

	function clearCommentsLocalStorage() {
		const key = getCommentsStorageKey();
		if (key) {
			localStorage.removeItem(key);
		}
	}

	function handlePlayPause() {
		if (!activePlayer) return;
		if (activePlayer.paused) {
			activePlayer.play();
		} else {
			activePlayer.pause();
		}
	}

	function handleStartOver() {
		if (activePlayer) {
			activePlayer.currentTime = 0;
		}
	}

	function handleRewind10() {
		if (activePlayer) {
			activePlayer.currentTime = Math.max(0, activePlayer.currentTime - 10);
		}
	}

	function handleForward10() {
		if (activePlayer) {
			activePlayer.currentTime = Math.min(duration, activePlayer.currentTime + 10);
		}
	}

	function handleProgressClick(e: MouseEvent) {
		if (!activePlayer) return;
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		activePlayer.currentTime = percent * duration;
	}

	function handleVolumeChange(e: Event) {
		if (!activePlayer) return;
		const target = e.target as HTMLInputElement;
		activePlayer.volume = parseInt(target.value) / 100;
	}

	function handleFullscreen() {
		const videoPanel = document.querySelector('.video-panel');
		if (!document.fullscreenElement && videoPanel) {
			videoPanel.requestFullscreen().catch((err) => console.error('Error entering fullscreen:', err));
		} else if (document.fullscreenElement) {
			document.exitFullscreen();
		}
	}

	function handleDownload() {
		if (!currentDownloadUrl || !currentFileName) {
			alert('No file available for download');
			return;
		}

		const a = document.createElement('a');
		a.href = currentDownloadUrl;
		a.download = currentFileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function handleCommentInputFocus() {
		if (!activePlayer) return;
		if (!activePlayer.paused) {
			wasPlayingBeforeComment = true;
			commentTimecode = activePlayer.currentTime;
			activePlayer.pause();
		} else {
			wasPlayingBeforeComment = false;
			commentTimecode = activePlayer.currentTime;
		}
	}

	async function addComment() {
		if (isSubmittingComment) return;

		const author = authorName.trim();
		const text = commentText.trim();

		if (!author) {
			alert('Please enter your name');
			return;
		}

		if (!text) {
			alert('Please enter a comment');
			return;
		}

		isSubmittingComment = true;

		const timecodeValue = formatTime(commentTimecode);

		const comment = {
			id: Date.now().toString(),
			author,
			timecode: timecodeValue,
			timeSeconds: commentTimecode,
			text,
			status: 'open',
			createdAt: new Date().toISOString()
		};

		// Save author
		if (author) {
			localStorage.setItem('video-review-author', author);
		}

		// Save to backend if we have a file ID
		if (currentFileId) {
			const savedComment = await saveCommentToBackend(comment);
			if (savedComment) {
				comment.id = savedComment.id;
				comment.createdAt = savedComment.createdAt;
			}
		}

		comments.push(comment);
		comments.sort((a, b) => a.timeSeconds - b.timeSeconds);

		// Clear input
		commentText = '';

		isSubmittingComment = false;

		// Resume video if it was playing
		if (wasPlayingBeforeComment && activePlayer) {
			activePlayer.play();
		}
	}

	async function saveCommentToBackend(comment: any) {
		try {
			if (!projectId || !currentFileId) {
				console.warn('Missing projectId or fileId, saving to localStorage only');
				saveCommentsToLocalStorage();
				return null;
			}

			const response = await fetch(`/api/files/${projectId}/${currentFileId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					author_name: comment.author,
					timecode: comment.timecode,
					comment_text: comment.text
				})
			});

			if (response.ok) {
				const savedComment = await response.json();
				clearCommentsLocalStorage();
				return savedComment;
			} else {
				console.warn('Server save failed, backing up to localStorage');
				saveCommentsToLocalStorage();
			}
		} catch (error) {
			console.error('Error saving comment:', error);
			saveCommentsToLocalStorage();
		}
		return null;
	}

	async function toggleResolve(commentId: string) {
		const comment = comments.find((c) => String(c.id) === String(commentId));
		if (!comment) return;

		const currentStatus = comment.status || 'open';
		const newStatus = currentStatus === 'open' ? 'resolved' : 'open';

		comment.status = newStatus;
		comments = [...comments];

		try {
			const response = await fetch(`/api/files/comments/${commentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus })
			});

			if (!response.ok) throw new Error('Failed to update status');
		} catch (error) {
			console.error('Error updating comment status:', error);
			comment.status = comment.status === 'open' ? 'resolved' : 'open';
			comments = [...comments];
			alert('Failed to update comment status');
		}
	}

	async function deleteComment(commentId: string) {
		if (!confirm('Delete this comment?')) return;

		const deletedIndex = comments.findIndex((c) => String(c.id) === String(commentId));
		const deletedComment = comments[deletedIndex];
		comments.splice(deletedIndex, 1);
		comments = [...comments];

		try {
			const deleteUrl = `/api/files/${projectId}/comments/${commentId}`;
			const response = await fetch(deleteUrl, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete comment');
			}
		} catch (error) {
			console.error('Error deleting comment:', error);
			comments.splice(deletedIndex, 0, deletedComment);
			comments = [...comments];
			alert('Failed to delete comment');
		}
	}

	function jumpToTimecode(timeSeconds: number, commentId?: string) {
		if (activePlayer) {
			activePlayer.currentTime = timeSeconds;
			if (commentId) {
				activeCommentId = commentId;
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!activePlayer) return;

		const target = e.target as HTMLElement;
		const isInput = target.matches('input, textarea');

		if (e.code === 'Space' && !isInput) {
			e.preventDefault();
			handlePlayPause();
		}

		if (e.code === 'ArrowLeft' && !isInput) {
			e.preventDefault();
			if (activePlayer) {
				activePlayer.currentTime = Math.max(0, activePlayer.currentTime - 5);
			}
		}

		if (e.code === 'ArrowRight' && !isInput) {
			e.preventDefault();
			if (activePlayer) {
				activePlayer.currentTime = Math.min(duration, activePlayer.currentTime + 5);
			}
		}

		if (e.code === 'KeyM' && !isInput) {
			e.preventDefault();
			const input = document.getElementById('commentInput') as HTMLTextAreaElement;
			input?.focus();
		}
	}

	function navigateBack() {
		if (videoPlayer) {
			videoPlayer.pause();
			videoPlayer.src = '';
			videoPlayer.load();
		}
		if (audioPlayer) {
			audioPlayer.pause();
			audioPlayer.src = '';
			audioPlayer.load();
		}

		if (window.history.length > 1) {
			window.history.back();
		} else {
			alert('This file was accessed via a direct share link. Close this tab to exit.');
		}
	}
</script>

<svelte:head>
	<title>{currentVideoFile || 'Video Review'}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app-container">
	<!-- Video Panel -->
	<div class="video-panel">
		<div class="video-header">
			<button class="back-btn" onclick={navigateBack}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
				back to files
			</button>
			<span class="video-filename">{currentVideoFile || ''}</span>
		</div>

		<div class="video-container">
			{#if showPlaceholder}
				<div class="video-placeholder">
					<svg width="200" height="200" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
						<defs>
							<linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color:#4A90E2;stop-opacity:1" />
								<stop offset="100%" style="stop-color:#E74C3C;stop-opacity:1" />
							</linearGradient>
						</defs>
						<text
							x="256"
							y="256"
							font-family="'Bricolage Grotesque', system-ui, -apple-system, sans-serif"
							font-size="180"
							font-weight="700"
							fill="url(#textGradient)"
							text-anchor="middle"
							dominant-baseline="middle"
							letter-spacing="6">Aa</text
						>
					</svg>
				</div>
			{/if}

			{#if showAudioVisualizer}
				<div class="audio-visualizer">
					<div class="audio-icon">
						<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
							<path
								d="M9 18V5l12-2v13M9 18c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm12-2c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z"
							/>
						</svg>
					</div>
					<div class="audio-bars">
						<div class="audio-bar"></div>
						<div class="audio-bar"></div>
						<div class="audio-bar"></div>
						<div class="audio-bar"></div>
						<div class="audio-bar"></div>
					</div>
				</div>
			{/if}

			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoPlayer}
				bind:currentTime
				bind:duration
				onplay={() => (isPlaying = true)}
				onpause={() => (isPlaying = false)}
				ontimeupdate={() => {
					if (duration > 0) {
						progress = (currentTime / duration) * 100;
					}
				}}
			>
				Your browser does not support the video tag.
			</video>

			<!-- svelte-ignore a11y_media_has_caption -->
			<audio
				bind:this={audioPlayer}
				bind:currentTime
				bind:duration
				onplay={() => (isPlaying = true)}
				onpause={() => (isPlaying = false)}
				ontimeupdate={() => {
					if (duration > 0) {
						progress = (currentTime / duration) * 100;
					}
				}}
			>
				Your browser does not support the audio tag.
			</audio>
		</div>

		<div class="video-controls">
			<div class="controls-row">
				<button class="control-btn" onclick={handleStartOver} title="Start over">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
						<rect x="4" y="4" width="2" height="16" />
						<path d="M18 6l-8 6 8 6z" />
					</svg>
				</button>
				<button class="control-btn" onclick={handleRewind10} title="Rewind 10 seconds">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
						<path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"></path>
						<text x="12" y="16" font-size="8" fill="white" text-anchor="middle" font-weight="bold"
							>10</text
						>
					</svg>
				</button>
				<button class="play-btn" onclick={handlePlayPause}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
						{#if isPlaying}
							<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
						{:else}
							<path d="M8 5v14l11-7z" />
						{/if}
					</svg>
				</button>
				<button class="control-btn" onclick={handleForward10} title="Forward 10 seconds">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
						<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"></path>
						<text x="12" y="16" font-size="8" fill="white" text-anchor="middle" font-weight="bold"
							>10</text
						>
					</svg>
				</button>
				<span class="timecode">{formattedTime} / {formattedDuration}</span>
				<div class="progress-container" onclick={handleProgressClick} role="progressbar" tabindex="0">
					<div class="progress-bar" style="width: {progress}%">
						<div class="progress-handle"></div>
					</div>
					<div class="comment-markers">
						{#each comments as comment}
							{@const percent = duration > 0 ? (comment.timeSeconds / duration) * 100 : 0}
							<div
								class="comment-marker"
								style="left: {percent}%"
								onclick={(e) => {
									e.stopPropagation();
									jumpToTimecode(comment.timeSeconds, comment.id);
								}}
								role="button"
								tabindex="0"
							></div>
						{/each}
					</div>
				</div>
				<div class="volume-control">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
						<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07"></path>
					</svg>
					<input
						type="range"
						class="volume-slider"
						min="0"
						max="100"
						bind:value={volume}
						oninput={handleVolumeChange}
					/>
				</div>
				<button class="fullscreen-btn" onclick={handleFullscreen} title="Fullscreen">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path
							d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
						></path>
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Comments Panel -->
	<div class="comments-panel">
		<div class="comments-header">
			<div class="comments-header-row">
				<h2>Comments</h2>
				<button class="export-to-notes-btn" onclick={handleDownload}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						style="margin-right: 0.5rem;"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="7 10 12 15 17 10"></polyline>
						<line x1="12" y1="15" x2="12" y2="3"></line>
					</svg>
					download
				</button>
			</div>
			<div class="comments-stats">
				<div class="stat-item">
					<span class="stat-badge">{totalCommentsCount}</span>
					<span>total</span>
				</div>
				<div class="stat-item">
					<span class="stat-badge">{openCommentsCount}</span>
					<span>open</span>
				</div>
			</div>
		</div>

		<div class="comments-list">
			{#if topLevelComments.length === 0}
				<div class="empty-state">
					<p>No comments yet. Add a comment at the current timecode.</p>
				</div>
			{:else}
				{#each topLevelComments as comment}
					{@const replies = comments.filter((c) => String(c.reply_to_id) === String(comment.id))}
					{@const date = new Date(comment.createdAt)}
					{@const dateStr =
						date.toLocaleDateString() +
						' ' +
						date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

					<div
						class="comment-card"
						class:active={activeCommentId === comment.id}
						data-id={comment.id}
						onclick={() => jumpToTimecode(comment.timeSeconds, comment.id)}
					>
						<div class="comment-header">
							{#if comment.timecode}
								<span
									class="comment-timecode clickable"
									onclick={(e) => {
										e.stopPropagation();
										jumpToTimecode(comment.timeSeconds);
									}}>{comment.timecode}</span
								>
							{/if}
							<span class="comment-status status-{comment.status || 'open'}"
								>{comment.status || 'open'}</span
							>
						</div>
						<div class="comment-author">{comment.author}</div>
						<div class="comment-text">{comment.text}</div>
						<div class="comment-meta">
							<span>{dateStr}</span>
							<div class="comment-actions">
								<button
									class="icon-btn reply-btn"
									title="Reply"
									onclick={(e) => {
										e.stopPropagation();
										replyingToId = replyingToId === comment.id ? null : comment.id;
									}}
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="9 17 4 12 9 7"></polyline>
										<path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
									</svg>
								</button>
								<button
									class="icon-btn resolve-btn"
									title={(comment.status || 'open') === 'open' ? 'Resolve' : 'Reopen'}
									onclick={(e) => {
										e.stopPropagation();
										toggleResolve(comment.id);
									}}
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
										<polyline points="22 4 12 14.01 9 11.01"></polyline>
									</svg>
								</button>
								<button
									class="icon-btn delete"
									title="Delete"
									onclick={(e) => {
										e.stopPropagation();
										deleteComment(comment.id);
									}}
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
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
										<line x1="10" y1="11" x2="10" y2="17"></line>
										<line x1="14" y1="11" x2="14" y2="17"></line>
									</svg>
								</button>
							</div>
						</div>

						{#if String(replyingToId) === String(comment.id)}
							<div class="reply-form">
								<input
									type="text"
									class="reply-input"
									placeholder="Write a reply..."
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											// Handle reply submit
										}
										if (e.key === 'Escape') {
											replyingToId = null;
										}
									}}
								/>
								<div class="reply-actions">
									<button class="btn-cancel-reply" onclick={() => (replyingToId = null)}
										>Cancel</button
									>
									<button class="btn-submit-reply">Reply</button>
								</div>
							</div>
						{/if}

						{#if replies.length > 0}
							<div class="replies">
								{#each replies as reply}
									{@const replyDate = new Date(reply.createdAt)}
									{@const replyDateStr =
										replyDate.toLocaleDateString() +
										' ' +
										replyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

									<div class="comment-card reply" data-id={reply.id}>
										<div class="comment-author">{reply.author}</div>
										<div class="comment-text">{reply.text}</div>
										<div class="comment-meta">
											<span>{replyDateStr}</span>
											<div class="comment-actions">
												<button
													class="icon-btn delete"
													title="Delete"
													onclick={(e) => {
														e.stopPropagation();
														deleteComment(reply.id);
													}}
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
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<div class="add-comment-section">
			<div class="add-comment-form">
				<input
					type="text"
					class="comment-input"
					placeholder="your name"
					bind:value={authorName}
				/>
				<textarea
					id="commentInput"
					class="comment-input"
					placeholder="add a comment..."
					bind:value={commentText}
					onfocus={handleCommentInputFocus}
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							addComment();
						}
					}}
				></textarea>
				<button class="btn btn-primary" onclick={addComment} disabled={isSubmittingComment}>
					add comment
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		overflow: hidden !important;
	}

	.app-container {
		display: grid;
		grid-template-columns: 1fr 400px;
		min-height: 100vh;
		height: 100vh;
		gap: 0;
	}

	.video-panel {
		display: flex;
		flex-direction: column;
		background: #000;
		position: relative;
	}

	.video-header {
		padding: 1rem 1.5rem;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		gap: 1rem;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.video-panel:hover .video-header {
		opacity: 1;
		pointer-events: auto;
	}

	.back-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.video-filename {
		color: white;
		flex: 1;
		font-size: 0.85rem;
	}

	.video-container {
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		position: relative;
		overflow: hidden;
	}

	.video-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		background: var(--bg-secondary);
		width: 100%;
		height: 100%;
		position: absolute;
		z-index: 0;
	}

	video,
	audio {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: none;
	}

	video[src]:not([src='']),
	audio[src]:not([src='']) {
		display: block;
	}

	.audio-visualizer {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
		height: 100%;
		background: #000;
	}

	.audio-icon {
		opacity: 0.3;
	}

	.audio-bars {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		height: 60px;
	}

	.audio-bar {
		width: 6px;
		background: linear-gradient(to top, #469fe0, #007acc);
		border-radius: 3px;
		opacity: 0.4;
	}

	.audio-bar:nth-child(1) {
		height: 30%;
	}
	.audio-bar:nth-child(2) {
		height: 50%;
	}
	.audio-bar:nth-child(3) {
		height: 70%;
	}
	.audio-bar:nth-child(4) {
		height: 45%;
	}
	.audio-bar:nth-child(5) {
		height: 35%;
	}

	.video-controls {
		background: rgba(0, 0, 0, 0.7);
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 20;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.video-panel:hover .video-controls {
		opacity: 1;
		pointer-events: auto;
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.control-btn {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.play-btn {
		background: var(--accent-teal);
		border: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.play-btn:hover {
		background: #3a8bc7;
	}

	.timecode {
		font-family: var(--font-primary);
		color: white;
		font-size: 0.9rem;
		min-width: 140px;
	}

	.progress-container {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		cursor: pointer;
		position: relative;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #ff6b6b 0%, #007acc 100%);
		border-radius: 3px;
		position: relative;
	}

	.progress-handle {
		position: absolute;
		right: -6px;
		top: 50%;
		transform: translateY(-50%);
		width: 12px;
		height: 12px;
		background: white;
		border-radius: 50%;
		cursor: grab;
	}

	.progress-handle:active {
		cursor: grabbing;
	}

	.comment-markers {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.comment-marker {
		position: absolute;
		width: 3px;
		height: 100%;
		background: var(--accent-orange);
		cursor: pointer;
		pointer-events: all;
	}

	.comment-marker:hover {
		background: var(--accent-red);
		width: 4px;
	}

	.volume-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.volume-slider {
		width: 80px;
	}

	.fullscreen-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.fullscreen-btn:hover {
		color: var(--accent-teal);
	}

	.comments-panel {
		background: var(--bg-secondary);
		display: flex;
		flex-direction: column;
		border-left: var(--border-medium);
		height: 100vh;
		overflow: hidden;
	}

	.comments-header {
		padding: 1.5rem;
		border-bottom: var(--border-medium);
	}

	.comments-header h2 {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
	}

	.comments-header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.export-to-notes-btn {
		padding: 0.5rem 1rem;
		background: var(--accent-teal);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
		display: flex;
		align-items: center;
	}

	.export-to-notes-btn:hover {
		background: #3a8bc7;
	}

	.comments-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.85rem;
		color: var(--subtle-text);
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.stat-badge {
		background: var(--accent-teal);
		color: white;
		padding: 0.1rem 0.4rem;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.comments-list {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.comment-card {
		background: var(--bg-primary);
		border: var(--border-light);
		border-radius: var(--radius-lg);
		padding: 1rem;
		margin-bottom: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.comment-card:hover {
		box-shadow: var(--shadow-subtle);
		transform: translateY(-2px);
	}

	.comment-card.active {
		border-color: var(--accent-teal);
		box-shadow: 0 0 0 2px rgba(70, 159, 224, 0.1);
	}

	.comment-card.reply {
		margin-left: 1.5rem;
		margin-top: 0.75rem;
		margin-bottom: 0.5rem;
		padding: 0.75rem;
		border-left: 2px solid var(--accent-teal);
		background: rgba(70, 159, 224, 0.03);
	}

	.comment-card.reply:hover {
		transform: none;
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.comment-timecode {
		font-family: var(--font-primary);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--accent-teal);
	}

	.comment-timecode.clickable {
		cursor: pointer;
		transition: color 0.2s, text-decoration 0.2s;
	}

	.comment-timecode.clickable:hover {
		color: var(--accent-blue);
		text-decoration: underline;
	}

	.comment-status {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 12px;
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-open {
		background: rgba(255, 146, 43, 0.1);
		color: var(--accent-orange);
	}

	.status-resolved {
		background: rgba(81, 207, 102, 0.1);
		color: var(--accent-green);
	}

	.comment-author {
		font-size: 0.8rem;
		color: var(--subtle-text);
		margin-bottom: 0.5rem;
	}

	.comment-text {
		font-size: 0.9rem;
		color: var(--secondary-text);
		line-height: 1.5;
		margin-bottom: 0.5rem;
	}

	.comment-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.75rem;
		color: var(--muted-text);
	}

	.comment-actions {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--subtle-text);
		transition: color 0.2s;
	}

	.icon-btn:hover {
		color: var(--accent-teal);
	}

	.icon-btn.delete:hover {
		color: var(--accent-red);
	}

	.replies {
		margin-top: 0.5rem;
	}

	.reply-form {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #eee;
	}

	.reply-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: var(--font-primary);
		margin-bottom: 0.5rem;
	}

	.reply-input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.reply-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-cancel-reply,
	.btn-submit-reply {
		padding: 0.4rem 0.75rem;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: var(--font-primary);
	}

	.btn-cancel-reply {
		background: #f5f5f5;
		border: 1px solid #ddd;
		color: var(--subtle-text);
	}

	.btn-submit-reply {
		background: var(--accent-teal);
		border: none;
		color: white;
	}

	.btn-submit-reply:hover {
		background: #3a8bc9;
	}

	.add-comment-section {
		padding: 1rem;
		border-top: var(--border-medium);
		background: var(--bg-secondary);
	}

	.add-comment-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.comment-input {
		flex: 1;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.9rem;
		font-family: var(--font-primary);
		background: white;
		resize: vertical;
		min-height: 80px;
	}

	.comment-input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	input.comment-input {
		min-height: auto;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 400;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #3a8bc7;
	}

	.btn-primary:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted-text);
	}

	@media (max-width: 1200px) {
		.app-container {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 400px;
		}

		.comments-panel {
			border-left: none;
			border-top: var(--border-medium);
		}
	}
</style>
