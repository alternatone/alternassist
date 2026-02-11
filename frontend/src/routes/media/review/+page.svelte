<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { filesAPI, type Comment } from '$lib/api/files';
	import { ftpAPI } from '$lib/api/ftp';
	import VideoPlayer from '$lib/components/media/VideoPlayer.svelte';
	import CommentThread from '$lib/components/media/CommentThread.svelte';
	import CommentForm from '$lib/components/media/CommentForm.svelte';

	// URL params
	const fileId = $derived($page.url.searchParams.get('file'));
	const projectId = $derived($page.url.searchParams.get('project'));
	const ftpFilePath = $derived($page.url.searchParams.get('ftp') || $page.url.searchParams.get('ftpFile'));

	// State
	let file = $state<any>(null);
	let comments = $state<Comment[]>([]);
	let authorName = $state('');
	let replyingToId = $state<number | null>(null);
	let commentTimecode = $state<string | null>(null);
	let commentSeconds = $state(0);
	let activeCommentId = $state<number | null>(null);

	// Video player
	let videoSrc = $state('');
	let videoPlayer: VideoPlayer | undefined = $state();
	let isSubmittingComment = $state(false);

	// Auto-pause state
	let wasPlayingBeforeComment = $state(false);

	// FTP mode flag
	let isFtpMode = $state(false);
	let currentDownloadUrl = $state('');
	let currentFileName = $state('');

	// Load saved author from localStorage
	onMount(() => {
		const saved = localStorage.getItem('video-review-author');
		if (saved) {
			authorName = saved;
		}

		if (ftpFilePath) {
			loadFtpFile(ftpFilePath);
		} else if (fileId && projectId) {
			loadFile();
			loadComments();
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		videoPlayer?.cleanup();
	});

	function loadFtpFile(filePath: string) {
		isFtpMode = true;
		const fileName = filePath.split('/').pop() || filePath;

		videoSrc = ftpAPI.getStreamUrl(filePath);
		currentDownloadUrl = ftpAPI.getDownloadUrl(filePath);
		currentFileName = fileName;
		file = { original_name: fileName };

		// FTP files don't have comment support
		comments = [];
	}

	async function loadFile() {
		if (!fileId || !projectId) return;

		try {
			const files = await filesAPI.getByProject(parseInt(projectId));
			file = files.find((f: any) => f.id == parseInt(fileId!));

			if (file) {
				videoSrc = filesAPI.getStreamUrl(parseInt(fileId));
				currentDownloadUrl = `/api/files/${fileId}/download`;
				currentFileName = file.original_name || 'file';
			}
		} catch (error) {
			console.error('Error loading file:', error);
		}
	}

	async function loadComments() {
		if (!fileId || !projectId) return;

		try {
			const data = await filesAPI.getComments(parseInt(fileId));
			// Sort by timecode
			comments = sortCommentsByTime(data);
			// Clear localStorage backup on success
			clearCommentsLocalStorage();
		} catch (error) {
			console.error('Error loading comments:', error);
			// Fallback to localStorage
			comments = loadCommentsFromLocalStorage();
		}
	}

	// localStorage fallback for comments
	function getCommentsStorageKey(): string | null {
		return fileId ? `video-review-comments-${fileId}` : null;
	}

	function saveCommentsToLocalStorage() {
		const key = getCommentsStorageKey();
		if (key && comments.length > 0) {
			localStorage.setItem(key, JSON.stringify(comments));
		}
	}

	function loadCommentsFromLocalStorage(): Comment[] {
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

	// Sort comments by timecode
	function sortCommentsByTime(commentList: Comment[]): Comment[] {
		return [...commentList].sort((a, b) => {
			const aTime = a.timecode ? parseTime(a.timecode) : 0;
			const bTime = b.timecode ? parseTime(b.timecode) : 0;
			return aTime - bTime;
		});
	}

	// Auto-pause on comment textarea focus
	function handleCommentFocus() {
		if (!videoPlayer) return;
		wasPlayingBeforeComment = videoPlayer.getIsPlaying();
		commentSeconds = videoPlayer.getCurrentTime();
		commentTimecode = formatTime(commentSeconds);
		videoPlayer.pause();
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds) || seconds < 0) return '00:00:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function handleTimecodeCapture(timecode: string, seconds: number) {
		commentTimecode = timecode;
		commentSeconds = seconds;
		// Focus comment input
		setTimeout(() => {
			const input = document.querySelector('textarea.comment-input') as HTMLTextAreaElement;
			if (input) input.focus();
		}, 0);
	}

	async function handleAddComment(author: string, text: string) {
		if (!fileId || !projectId || isSubmittingComment || isFtpMode) return;

		isSubmittingComment = true;
		try {
			// Save author to localStorage
			localStorage.setItem('video-review-author', author);

			await filesAPI.addComment(parseInt(projectId), parseInt(fileId), {
				author_name: author,
				timecode: commentTimecode,
				comment_text: text
			});

			await loadComments();
			commentTimecode = null;

			// Resume video if it was playing
			if (wasPlayingBeforeComment && videoPlayer) {
				videoPlayer.play();
				wasPlayingBeforeComment = false;
			}
		} catch (error) {
			console.error('Error adding comment:', error);
			// Save to localStorage as backup
			saveCommentsToLocalStorage();
			alert('Failed to add comment');
		} finally {
			isSubmittingComment = false;
		}
	}

	async function handleReply(parentId: number) {
		replyingToId = replyingToId === parentId ? null : parentId;
	}

	async function handleSubmitReply(author: string, text: string) {
		if (!fileId || !projectId || !replyingToId) return;

		try {
			const parent = comments.find((c) => c.id === replyingToId);

			await filesAPI.addComment(parseInt(projectId), parseInt(fileId), {
				author_name: author,
				timecode: parent?.timecode || null,
				comment_text: text,
				reply_to_id: replyingToId
			});

			await loadComments();
			replyingToId = null;
		} catch (error) {
			console.error('Error adding reply:', error);
			alert('Failed to add reply');
		}
	}

	async function handleResolve(commentId: number, currentStatus: 'open' | 'resolved') {
		const newStatus = currentStatus === 'open' ? 'resolved' : 'open';

		// Optimistic update
		comments = comments.map((c) =>
			c.id === commentId ? { ...c, status: newStatus } : c
		);

		try {
			await filesAPI.updateCommentStatus(commentId, newStatus);
		} catch (error) {
			console.error('Error updating comment:', error);
			// Rollback
			comments = comments.map((c) =>
				c.id === commentId ? { ...c, status: currentStatus } : c
			);
			alert('Failed to update comment');
		}
	}

	async function handleDelete(commentId: number) {
		if (!confirm('Delete this comment?')) return;
		if (!projectId) return;

		// Optimistic update
		const deletedComment = comments.find((c) => c.id === commentId);
		const deletedIndex = comments.findIndex((c) => c.id === commentId);
		comments = comments.filter((c) => c.id !== commentId);

		try {
			await filesAPI.deleteComment(parseInt(projectId), commentId);
		} catch (error) {
			console.error('Error deleting comment:', error);
			// Rollback
			if (deletedComment && deletedIndex >= 0) {
				const restored = [...comments];
				restored.splice(deletedIndex, 0, deletedComment);
				comments = restored;
			}
			alert('Failed to delete comment');
		}
	}

	function handleJumpToTime(seconds: number) {
		videoPlayer?.seekTo(seconds);
	}

	function handleCardClick(commentId: number, timeSeconds: number) {
		activeCommentId = commentId;
		videoPlayer?.seekTo(timeSeconds);
	}

	function handleMarkerClick(markerId: number) {
		activeCommentId = markerId;
	}

	function exportToNotes() {
		const formattedComments = comments
			.filter((c) => c.timecode)
			.map((c) => ({
				timecode: c.timecode,
				text: c.comment_text,
				author: c.author_name,
				isReply: !!c.reply_to_id
			}));

		window.dispatchEvent(
			new CustomEvent('exportToNotes', {
				detail: {
					type: 'exportToNotes',
					comments: formattedComments,
					fileName: file?.original_name || 'Media Review Comments'
				}
			})
		);

		// Also try postMessage for iframe contexts
		window.postMessage(
			{
				type: 'exportToNotes',
				comments: formattedComments,
				fileName: file?.original_name || 'Media Review Comments'
			},
			'*'
		);
	}

	function handleDownload() {
		if (!currentDownloadUrl || !currentFileName) return;
		const a = document.createElement('a');
		a.href = currentDownloadUrl;
		a.download = currentFileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function navigateBack() {
		// Cleanup media elements before navigating
		videoPlayer?.cleanup();

		if (window.history.length > 1) {
			window.history.back();
		} else {
			window.location.href = '/media';
		}
	}

	// Comment markers for progress bar
	const commentMarkers = $derived(
		comments.map((c) => ({
			id: c.id,
			timeSeconds: c.timecode ? parseTime(c.timecode) : 0
		}))
	);

	function parseTime(timeString: string): number {
		const parts = timeString.split(':').map((p) => parseInt(p) || 0);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		return 0;
	}
</script>

<svelte:head>
	<title>Video Review - Alternassist</title>
</svelte:head>

<div class="app-container">
	<!-- Video Panel -->
	<div class="video-wrapper">
		<div class="back-btn-container">
			<button class="back-btn" onclick={navigateBack}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
				back to files
			</button>
		</div>
		<VideoPlayer
			bind:this={videoPlayer}
			src={videoSrc}
			fileName={file?.original_name || ''}
			onTimecodeCapture={handleTimecodeCapture}
			onMarkerClick={handleMarkerClick}
			{commentMarkers}
		/>
	</div>

	<!-- Comments Panel -->
	<div class="comments-panel">
		<div class="comments-header-row">
			<h2 style="margin: 0;">Comments</h2>
			<div style="display: flex; gap: 0.5rem; align-items: center;">
				{#if comments.length > 0 && !isFtpMode}
					<button class="download-icon-btn" onclick={exportToNotes} title="Send to NoteMarker">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
							<line x1="16" y1="13" x2="8" y2="13"></line>
							<line x1="16" y1="17" x2="8" y2="17"></line>
						</svg>
					</button>
				{/if}
				<button class="download-icon-btn" onclick={handleDownload} title="Download file">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="7 10 12 15 17 10"></polyline>
						<line x1="12" y1="15" x2="12" y2="3"></line>
					</svg>
				</button>
			</div>
		</div>

		<CommentThread
			{comments}
			{activeCommentId}
			onJumpToTime={handleJumpToTime}
			onCardClick={handleCardClick}
			onReply={handleReply}
			onResolve={handleResolve}
			onDelete={handleDelete}
		/>

		{#if isFtpMode}
			<div class="ftp-notice">
				FTP files do not support comments.
			</div>
		{:else if replyingToId}
			{@const parentComment = comments.find((c) => c.id === replyingToId)}
			<div class="reply-section">
				<div class="reply-header">
					Replying to {parentComment?.author_name}
				</div>
				<CommentForm
					bind:authorName
					onSubmit={handleSubmitReply}
					onCancel={() => (replyingToId = null)}
					placeholder="Write a reply..."
					submitLabel="Reply"
					showAuthor={true}
					replyMode={true}
				/>
			</div>
		{:else}
			<CommentForm
				bind:authorName
				onSubmit={handleAddComment}
				onFocus={handleCommentFocus}
				showAuthor={true}
			/>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		overflow: hidden !important;
		margin: 0;
		padding: 0;
	}

	.app-container {
		display: grid;
		grid-template-columns: 1fr 400px;
		min-height: 100vh;
		height: 100vh;
		gap: 0;
		background: #000;
	}

	.video-wrapper {
		position: relative;
	}

	.back-btn-container {
		position: absolute;
		top: 1rem;
		left: 1.5rem;
		z-index: 30;
	}

	.back-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.comments-panel {
		background: var(--bg-secondary);
		display: flex;
		flex-direction: column;
		border-left: var(--border-medium);
		height: 100vh;
		overflow: hidden;
	}

	.comments-header-row {
		padding: 1.5rem;
		border-bottom: var(--border-medium);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.comments-header-row h2 {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.download-icon-btn {
		background: none;
		border: none;
		color: var(--subtle-text);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		transition: color 0.2s;
	}

	.download-icon-btn:hover {
		color: var(--accent-teal);
	}

	.reply-section {
		padding: 1rem;
		border-top: var(--border-medium);
		background: var(--bg-primary);
	}

	.reply-header {
		font-size: 0.85rem;
		color: var(--subtle-text);
		margin-bottom: 0.5rem;
	}

	.ftp-notice {
		padding: 1rem;
		border-top: var(--border-medium);
		text-align: center;
		color: var(--muted-text);
		font-size: 0.85rem;
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
