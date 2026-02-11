<script lang="ts">
	import type { Comment } from '$lib/api/files';

	let {
		comments,
		activeCommentId = null,
		onJumpToTime,
		onCardClick,
		onReply,
		onResolve,
		onDelete
	}: {
		comments: Comment[];
		activeCommentId?: number | null;
		onJumpToTime?: (seconds: number) => void;
		onCardClick?: (commentId: number, timeSeconds: number) => void;
		onReply?: (commentId: number) => void;
		onResolve?: (commentId: number, currentStatus: 'open' | 'resolved') => void;
		onDelete?: (commentId: number) => void;
	} = $props();

	// Parse timecode to seconds
	function parseTime(timeString: string): number {
		const parts = timeString.split(':').map((p) => parseInt(p) || 0);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		return 0;
	}

	// Group comments by parent/reply
	const topLevelComments = $derived(comments.filter((c) => !c.reply_to_id));
	const total = $derived(comments.length);
	const open = $derived(comments.filter((c) => c.status === 'open').length);

	function getReplies(commentId: number): Comment[] {
		return comments.filter((c) => c.reply_to_id === commentId);
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return (
			date.toLocaleDateString() +
			' ' +
			date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		);
	}
</script>

<div class="comments-header">
	<h2>Comments</h2>
	<div class="comments-stats">
		<div class="stat-item">
			<span class="stat-badge">{total}</span>
			<span>total</span>
		</div>
		<div class="stat-item">
			<span class="stat-badge">{open}</span>
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
		{#each topLevelComments as comment (comment.id)}
			{@const replies = getReplies(comment.id)}
			{@const timeSeconds = comment.timecode ? parseTime(comment.timecode) : 0}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="comment-card"
				class:active={activeCommentId === comment.id}
				onclick={(e) => {
					const target = e.target as HTMLElement;
					if (target.closest('.icon-btn') || target.closest('.comment-timecode')) return;
					if (onCardClick) onCardClick(comment.id, timeSeconds);
				}}
			>
				<div class="comment-header">
					{#if comment.timecode}
						<button
							class="comment-timecode clickable"
							onclick={() => onJumpToTime && onJumpToTime(timeSeconds)}
						>
							{comment.timecode}
						</button>
					{/if}
					<span class="comment-status status-{comment.status}">{comment.status}</span>
				</div>
				<div class="comment-author">{comment.author_name}</div>
				<div class="comment-text">{comment.comment_text}</div>
				<div class="comment-meta">
					<span>{formatDate(comment.created_at)}</span>
					<div class="comment-actions">
						<button
							class="icon-btn"
							onclick={() => onReply && onReply(comment.id)}
							title="Reply"
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
							class="icon-btn"
							onclick={() => onResolve && onResolve(comment.id, comment.status)}
							title={comment.status === 'open' ? 'Resolve' : 'Reopen'}
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
							onclick={() => onDelete && onDelete(comment.id)}
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
				</div>

				{#if replies.length > 0}
					<div class="replies">
						{#each replies as reply (reply.id)}
							<div class="comment-card reply">
								<div class="comment-author">{reply.author_name}</div>
								<div class="comment-text">{reply.comment_text}</div>
								<div class="comment-meta">
									<span>{formatDate(reply.created_at)}</span>
									<button
										class="icon-btn delete"
										onclick={() => onDelete && onDelete(reply.id)}
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
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.comments-header {
		padding: 1.5rem;
		border-bottom: var(--border-medium);
	}

	.comments-header h2 {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
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

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.comment-timecode {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--accent-teal);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		transition: color 0.2s, text-decoration 0.2s;
	}

	.comment-timecode:hover {
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
		color: var(--accent-gold);
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
		display: flex;
		align-items: center;
	}

	.icon-btn:hover {
		color: var(--accent-teal);
	}

	.icon-btn.delete:hover {
		color: var(--accent-red);
	}

	.replies {
		margin-top: 0.75rem;
	}

	.comment-card.reply {
		margin-left: 1.5rem;
		margin-bottom: 0.5rem;
		padding: 0.75rem;
		border-left: 2px solid var(--accent-teal);
		background: rgba(70, 159, 224, 0.03);
	}

	.comment-card.reply:hover {
		transform: none;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted-text);
	}

	/* Scrollbar styling */
	.comments-list::-webkit-scrollbar {
		width: 8px;
	}

	.comments-list::-webkit-scrollbar-track {
		background: var(--bg-primary);
	}

	.comments-list::-webkit-scrollbar-thumb {
		background: var(--border-medium);
		border-radius: 4px;
	}

	.comments-list::-webkit-scrollbar-thumb:hover {
		background: var(--subtle-text);
	}
</style>
