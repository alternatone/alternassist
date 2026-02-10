<script lang="ts">
	import '$lib/styles/global.css';
	import { page } from '$app/stores';

	let { children } = $props();
	let currentPath = $derived($page.url.pathname);
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<!-- No navigation for client portal - minimal interface -->
<div class="client-layout">
	{@render children()}
</div>

<style>
	.client-layout {
		min-height: 100vh;
		background: var(--bg-primary);
	}

	:global(body) {
		overflow: auto !important;
	}
</style>
