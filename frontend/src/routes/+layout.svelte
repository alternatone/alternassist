<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navigation from '$lib/components/Navigation.svelte';
	import ShareLinkModal from '$lib/components/ShareLinkModal.svelte';
	import { page } from '$app/stores';
	import { setContext } from 'svelte';

	interface LayoutData {
		user: {
			isAuthenticated: boolean;
			isAdmin: boolean;
			username?: string;
			isElectron: boolean;
		};
	}

	let { children, data }: { children: any; data: LayoutData } = $props();

	// Check if current route should show navigation
	const isPublicRoute = $derived(
		$page.url.pathname.startsWith('/login') ||
		$page.url.pathname.startsWith('/client-login') ||
		$page.url.pathname.startsWith('/client/login') ||
		$page.url.pathname.startsWith('/viewer')
	);

	// Show navigation only for authenticated admin routes
	const showNav = $derived(!isPublicRoute && data.user.isAuthenticated);

	// Share link modal reference — available to child components via context
	let shareLinkModal: ShareLinkModal | undefined = $state();

	setContext('shareLinkModal', {
		openForProject: (id: number, name: string) => shareLinkModal?.openForProject(id, name),
		openForFile: (id: number, name: string) => shareLinkModal?.openForFile(id, name),
		openForFtp: (path: string, name: string) => shareLinkModal?.openForFtp(path, name)
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Alternassist</title>
</svelte:head>

{#if showNav}
	<div class="app-layout">
		<Navigation currentPath={$page.url.pathname} />
		<main class="content">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="public-layout">
		{@render children()}
	</div>
{/if}

<ShareLinkModal bind:this={shareLinkModal} />

<style>
	.app-layout {
		min-height: 100vh;
	}

	.content {
		padding: 6rem 2rem 2rem;
		min-height: 100vh;
		max-width: 1400px;
		margin: 0 auto;
	}

	.public-layout {
		min-height: 100vh;
		background: var(--bg-primary);
	}
</style>
