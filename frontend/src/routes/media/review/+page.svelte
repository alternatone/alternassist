<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { type Comment } from '$lib/api/files';
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

		// Load locally-stored comments for FTP files
		comments = loadCommentsFromLocalStorage();
	}

	async function loadFile() {
		if (!fileId || !projectId) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/files`, { credentials: 'include' });
			if (!response.ok) throw new Error('Failed to load files');
			const files = await response.json();
			file = files.find((f: any) => f.id == parseInt(fileId!));

			if (file) {
				videoSrc = `/api/files/${projectId}/${fileId}/stream`;
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
			const response = await fetch(`/api/files/${projectId}/${fileId}/comments`, { credentials: 'include' });
			if (!response.ok) throw new Error('Failed to load comments');
			const data = await response.json();
			// Map API response fields to Comment type (backend returns camelCase/short names)
			const mapped = data.map((c: any) => ({
				id: c.id,
				file_id: parseInt(fileId!),
				author_name: c.author || c.author_name,
				timecode: c.timecode,
				comment_text: c.text || c.comment_text,
				status: c.status || 'open',
				created_at: c.createdAt || c.created_at,
				reply_to_id: c.reply_to_id || null
			}));
			// Sort by timecode
			comments = sortCommentsByTime(mapped);
			// Clear localStorage backup on success
			clearCommentsLocalStorage();
		} catch (error) {
			console.error('Error loading comments:', error);
			// Fallback to localStorage
			comments = loadCommentsFromLocalStorage();
		}
	}

	// localStorage key for comments (works for both project files and FTP files)
	function getCommentsStorageKey(): string | null {
		if (fileId) return `video-review-comments-${fileId}`;
		if (ftpFilePath) return `video-review-comments-ftp-${ftpFilePath}`;
		return null;
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
		if (isSubmittingComment) return;

		isSubmittingComment = true;
		try {
			// Save author to localStorage
			localStorage.setItem('video-review-author', author);

			if (isFtpMode) {
				// FTP files: store comments locally
				const localComment: Comment = {
					id: Date.now(),
					author_name: author,
					timecode: commentTimecode,
					comment_text: text,
					status: 'open' as const,
					created_at: new Date().toISOString(),
					reply_to_id: null
				};
				comments = sortCommentsByTime([...comments, localComment]);
				saveCommentsToLocalStorage();
			} else if (fileId && projectId) {
				await fetch(`/api/files/${projectId}/${fileId}/comments`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						author_name: author,
						timecode: commentTimecode,
						comment_text: text
					})
				});
				await loadComments();
			}

			commentTimecode = null;

			// Resume video if it was playing
			if (wasPlayingBeforeComment && videoPlayer) {
				videoPlayer.play();
				wasPlayingBeforeComment = false;
			}
		} catch (error) {
			console.error('Error adding comment:', error);
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
		if (!replyingToId) return;

		try {
			const parent = comments.find((c) => c.id === replyingToId);

			if (isFtpMode) {
				const localReply: Comment = {
					id: Date.now(),
					author_name: author,
					timecode: parent?.timecode || null,
					comment_text: text,
					status: 'open' as const,
					created_at: new Date().toISOString(),
					reply_to_id: replyingToId
				};
				comments = [...comments, localReply];
				saveCommentsToLocalStorage();
			} else if (fileId && projectId) {
				await fetch(`/api/files/${projectId}/${fileId}/comments`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						author_name: author,
						timecode: parent?.timecode || null,
						comment_text: text,
						reply_to_id: replyingToId
					})
				});
				await loadComments();
			}

			replyingToId = null;
		} catch (error) {
			console.error('Error adding reply:', error);
			alert('Failed to add reply');
		}
	}

	async function handleResolve(commentId: number, currentStatus: 'open' | 'resolved') {
		const newStatus = currentStatus === 'open' ? 'resolved' : 'open';

		comments = comments.map((c) =>
			c.id === commentId ? { ...c, status: newStatus } : c
		);

		if (isFtpMode) {
			saveCommentsToLocalStorage();
		} else {
			if (!projectId) return;
			try {
				const response = await fetch(`/api/files/${projectId}/comments/${commentId}`, {
					method: 'PATCH',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: newStatus })
				});
				if (!response.ok) throw new Error('Failed to update comment status');
			} catch (error) {
				console.error('Error updating comment:', error);
				comments = comments.map((c) =>
					c.id === commentId ? { ...c, status: currentStatus } : c
				);
				alert('Failed to update comment');
			}
		}
	}

	async function handleDelete(commentId: number) {
		if (!confirm('Delete this comment?')) return;

		const deletedComment = comments.find((c) => c.id === commentId);
		const deletedIndex = comments.findIndex((c) => c.id === commentId);
		comments = comments.filter((c) => c.id !== commentId);

		if (isFtpMode) {
			saveCommentsToLocalStorage();
		} else {
			if (!projectId) return;
			try {
				const response = await fetch(`/api/files/${projectId}/comments/${commentId}`, {
					method: 'DELETE',
					credentials: 'include'
				});
				if (!response.ok) throw new Error('Failed to delete comment');
			} catch (error) {
				console.error('Error deleting comment:', error);
				if (deletedComment && deletedIndex >= 0) {
					const restored = [...comments];
					restored.splice(deletedIndex, 0, deletedComment);
					comments = restored;
				}
				alert('Failed to delete comment');
			}
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

<div class="page-header">
	<button class="back-link" onclick={navigateBack}>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="15 18 9 12 15 6"></polyline>
		</svg>
		Back to Media
	</button>
	<h1>{file?.original_name || 'Video Review'}</h1>
	<div class="header-actions">
		{#if comments.length > 0 && !isFtpMode}
			<button class="action-btn" onclick={exportToNotes} title="Send to NoteMarker">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
				</svg>
				NoteMarker
			</button>
		{/if}
		<button class="action-btn" onclick={handleDownload} title="Download file">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
				<polyline points="7 10 12 15 17 10"></polyline>
				<line x1="12" y1="15" x2="12" y2="3"></line>
			</svg>
			Download
		</button>
	</div>
</div>

<div class="review-panel">
	<!-- Video Section -->
	<div class="video-section">
		<VideoPlayer
			bind:this={videoPlayer}
			src={videoSrc}
			onTimecodeCapture={handleTimecodeCapture}
			onMarkerClick={handleMarkerClick}
			{commentMarkers}
		/>
	</div>

	<!-- Comments Section -->
	<div class="comments-section">
		<CommentThread
			{comments}
			{activeCommentId}
			onJumpToTime={handleJumpToTime}
			onCardClick={handleCardClick}
			onReply={handleReply}
			onResolve={handleResolve}
			onDelete={handleDelete}
		/>

		{#if replyingToId}
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
	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--primary-text);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--subtle-text);
		font-family: var(--font-body);
		font-size: 0.85rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.back-link:hover {
		color: var(--accent-teal);
		background: rgba(70, 159, 224, 0.08);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-secondary);
		border: var(--border-light);
		border-radius: 6px;
		color: var(--subtle-text);
		font-family: var(--font-primary);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		color: var(--accent-teal);
		border-color: var(--accent-teal);
	}

	.review-panel {
		display: grid;
		grid-template-columns: 1fr 380px;
		background: var(--bg-secondary);
		border: var(--border-light);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-subtle);
		overflow: hidden;
		/* Fill remaining viewport minus nav (6rem) + page padding (2rem top + 2rem bottom) + header (~3.5rem) + gap (1.5rem) */
		height: calc(100vh - 15rem);
	}

	.video-section {
		background: #000;
		overflow: hidden;
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
	}

	.comments-section {
		display: flex;
		flex-direction: column;
		border-left: var(--border-medium);
		min-height: 0;
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

	@media (max-width: 1100px) {
		.review-panel {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(300px, 1fr) minmax(250px, 1fr);
			height: auto;
			min-height: calc(100vh - 15rem);
		}

		.video-section {
			border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		}

		.comments-section {
			border-left: none;
			border-top: var(--border-medium);
		}
	}
</style>
