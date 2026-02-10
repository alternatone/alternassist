<script lang="ts">
	let {
		authorName = $bindable(''),
		onSubmit,
		onCancel,
		placeholder = 'add a comment...',
		submitLabel = 'add comment',
		showAuthor = true,
		replyMode = false
	}: {
		authorName?: string;
		onSubmit: (author: string, text: string) => void;
		onCancel?: () => void;
		placeholder?: string;
		submitLabel?: string;
		showAuthor?: boolean;
		replyMode?: boolean;
	} = $props();

	let commentText = $state('');

	function handleSubmit() {
		const author = authorName.trim();
		const text = commentText.trim();

		if (!author && showAuthor) {
			alert('Please enter your name');
			return;
		}

		if (!text) {
			alert('Please enter a comment');
			return;
		}

		onSubmit(author, text);

		// Clear form
		commentText = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === 'Escape' && onCancel) {
			onCancel();
		}
	}
</script>

<div class={replyMode ? 'reply-form' : 'add-comment-form'}>
	{#if showAuthor}
		<input
			type="text"
			class="comment-input"
			bind:value={authorName}
			placeholder="your name"
		/>
	{/if}
	<textarea
		class="comment-input"
		bind:value={commentText}
		{placeholder}
		onkeydown={handleKeydown}
	></textarea>
	<div class={replyMode ? 'reply-actions' : 'form-actions'}>
		{#if onCancel}
			<button class="btn-cancel-reply" onclick={onCancel}>Cancel</button>
		{/if}
		<button class={replyMode ? 'btn-submit-reply' : 'btn btn-primary'} onclick={handleSubmit}>
			{submitLabel}
		</button>
	</div>
</div>

<style>
	.add-comment-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border-top: var(--border-medium);
		background: var(--bg-secondary);
	}

	.reply-form {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #eee;
	}

	.comment-input {
		flex: 1;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.9rem;
		font-family: var(--font-body);
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

	.reply-form .comment-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
		min-height: auto;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
	}

	.reply-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		font-family: var(--font-body);
	}

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}

	.btn-primary:hover {
		background: #3a8bc7;
	}

	.btn-cancel-reply {
		padding: 0.4rem 0.75rem;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: var(--font-primary);
		background: #f5f5f5;
		border: 1px solid #ddd;
		color: var(--subtle-text);
	}

	.btn-submit-reply {
		padding: 0.4rem 0.75rem;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: var(--font-primary);
		background: var(--accent-teal);
		border: none;
		color: white;
	}

	.btn-submit-reply:hover {
		background: #3a8bc9;
	}
</style>
