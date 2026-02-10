<script lang="ts">
	let { status }: { status: string } = $props();

	const colors: Record<string, { bg: string; text: string }> = {
		paid: { bg: 'rgba(122, 199, 196, 0.1)', text: 'var(--accent-teal)' },
		partial: { bg: 'rgba(74, 144, 200, 0.1)', text: 'var(--accent-blue)' },
		unpaid: { bg: 'rgba(217, 100, 89, 0.1)', text: 'var(--accent-red)' },
		pending: { bg: 'rgba(136, 136, 136, 0.1)', text: 'var(--muted-text)' }
	};

	const style = $derived(colors[status?.toLowerCase()] || colors.pending);
</script>

<span class="status-badge" style="background: {style.bg}; color: {style.text}">
	{status}
</span>

<style>
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-family: var(--font-mono);
	}
</style>
