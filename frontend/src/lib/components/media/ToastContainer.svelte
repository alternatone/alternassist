<script lang="ts">
	interface Toast {
		id: number;
		message: string;
		type: 'success' | 'error' | 'info';
		leaving?: boolean;
	}

	let toasts = $state<Toast[]>([]);
	let nextId = 0;

	export function show(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) {
		const id = nextId++;
		toasts = [...toasts, { id, message, type }];

		setTimeout(() => {
			// Mark as leaving for exit animation
			toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
			setTimeout(() => {
				toasts = toasts.filter((t) => t.id !== id);
			}, 300);
		}, duration);
	}
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}" class:leaving={toast.leaving}>
				{toast.message}
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.toast {
		padding: 12px 20px;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		font-size: 14px;
		color: white;
		animation: slideIn 0.3s ease-out;
		max-width: 400px;
	}

	.toast.leaving {
		animation: slideOut 0.3s ease-out forwards;
	}

	.toast-success {
		background: #10b981;
	}

	.toast-error {
		background: #ef4444;
	}

	.toast-info {
		background: #3b82f6;
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

	@keyframes slideOut {
		from {
			transform: translateX(0);
			opacity: 1;
		}
		to {
			transform: translateX(400px);
			opacity: 0;
		}
	}
</style>
