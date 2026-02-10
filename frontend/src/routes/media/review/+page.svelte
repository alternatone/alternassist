<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { filesAPI, type Comment } from '$lib/api/files';
	import VideoPlayer from '$lib/components/media/VideoPlayer.svelte';
	import CommentThread from '$lib/components/media/CommentThread.svelte';
	import CommentForm from '$lib/components/media/CommentForm.svelte';

	// URL params
	const fileId = $derived($page.url.searchParams.get('file'));
	const projectId = $derived($page.url.searchParams.get('project'));

	// State
	let file = $state<any>(null);
	let comments = $state<Comment[]>([]);
	let authorName = $state('');
	let replyingToId = $state<number | null>(null);
	let commentTimecode = $state<string | null>(null);
	let commentSeconds = $state(0);

	// Video player
	let videoSrc = $state('');
	let videoPlayer: VideoPlayer | undefined = $state();
	let isSubmittingComment = $state(false);

	// Load saved author from localStorage
	onMount(() => {
		const saved = localStorage.getItem('video-review-author');
		if (saved) {
			authorName = saved;
		}

		if (fileId && projectId) {
			loadFile();
			loadComments();
		}
	});

	async function loadFile() {
		if (!fileId || !projectId) return;

		try {
			const files = await filesAPI.getByProject(parseInt(projectId));
			file = files.find((f: any) => f.id == parseInt(fileId!));

			if (file) {
				videoSrc = filesAPI.getStreamUrl(parseInt(fileId));
			}
		} catch (error) {
			console.error('Error loading file:', error);
			alert('Failed to load file');
		}
	}

	async function loadComments() {
		if (!fileId || !projectId) return;

		try {
			const data = await filesAPI.getComments(parseInt(fileId));
			comments = data;
		} catch (error) {
			console.error('Error loading comments:', error);
			comments = [];
		}
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
		if (!fileId || !projectId || isSubmittingComment) return;

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
		} catch (error) {
			console.error('Error adding comment:', error);
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

		try {
			await filesAPI.updateCommentStatus(commentId, newStatus);
			await loadComments();
		} catch (error) {
			console.error('Error updating comment:', error);
			alert('Failed to update comment');
		}
	}

	async function handleDelete(commentId: number) {
		if (!confirm('Delete this comment?')) return;
		if (!projectId) return;

		try {
			await filesAPI.deleteComment(parseInt(projectId), commentId);
			await loadComments();
		} catch (error) {
			console.error('Error deleting comment:', error);
			alert('Failed to delete comment');
		}
	}

	function handleJumpToTime(seconds: number) {
		videoPlayer?.seekTo(seconds);
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
		if (!fileId) return;
		const url = `/api/files/${fileId}/download`;
		const a = document.createElement('a');
		a.href = url;
		a.download = file?.original_name || 'file';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function navigateBack() {
		window.history.back();
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
			{commentMarkers}
		/>
	</div>

	<!-- Comments Panel -->
	<div class="comments-panel">
		<div class="comments-header-row">
			<h2 style="margin: 0;">Comments</h2>
			<div style="display: flex; gap: 0.5rem; align-items: center;">
				{#if comments.length > 0}
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
			onJumpToTime={handleJumpToTime}
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
			<CommentForm bind:authorName onSubmit={handleAddComment} showAuthor={true} />
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
