<script lang="ts">
	let { amount, showSign = false }: { amount: number; showSign?: boolean } = $props();

	const formatted = $derived.by(() => {
		const abs = Math.abs(amount);
		const formatted = new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(abs);

		if (showSign && amount < 0) {
			return `-${formatted}`;
		}
		return formatted;
	});
</script>

<span class="money">{formatted}</span>

<style>
	.money {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>
