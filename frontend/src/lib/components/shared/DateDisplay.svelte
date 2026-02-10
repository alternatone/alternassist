<script lang="ts">
	let {
		date,
		format = 'short'
	}: { date: string | Date; format?: 'short' | 'long' | 'iso' } = $props();

	const formatted = $derived.by(() => {
		const d = typeof date === 'string' ? new Date(date) : date;
		if (isNaN(d.getTime())) return 'Invalid date';

		if (format === 'iso') {
			return d.toISOString().split('T')[0];
		} else if (format === 'long') {
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} else {
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		}
	});
</script>

<span class="date">{formatted}</span>

<style>
	.date {
		font-family: var(--font-body);
		white-space: nowrap;
	}
</style>
