<script lang="ts">
	import { goto } from '$app/navigation';
	import { adminAPI } from '$lib/api/admin';

	let { currentPath }: { currentPath: string } = $props();

	// Detect if running in Electron
	const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

	let navElement: HTMLElement | undefined = $state();
	let navLinksElement: HTMLElement | undefined = $state();
	let isScrolled = $state(false);

	// Scroll handler for condensed nav state
	$effect(() => {
		if (typeof window === 'undefined') return;
		function handleScroll() {
			isScrolled = window.scrollY > 10;
		}
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});

	// Update underline position based on active link
	function updateNavUnderline() {
		if (!navLinksElement) return;
		requestAnimationFrame(() => {
			const activeLink = navLinksElement!.querySelector('.nav-link.active') as HTMLElement;
			if (!activeLink) return;
			const linkRect = activeLink.getBoundingClientRect();
			const navRect = navLinksElement!.getBoundingClientRect();
			const leftOffset = linkRect.left - navRect.left;
			const linkWidth = linkRect.width;
			navLinksElement!.style.setProperty('--underline-left', leftOffset + 'px');
			navLinksElement!.style.setProperty('--underline-width', linkWidth + 'px');
		});
	}

	// Re-position underline when path changes or on mount
	$effect(() => {
		// Track currentPath so this re-runs on navigation
		currentPath;
		// Small delay to ensure DOM has updated with active classes
		setTimeout(updateNavUnderline, 50);
	});

	// Re-position underline on window resize
	$effect(() => {
		if (typeof window === 'undefined') return;
		window.addEventListener('resize', updateNavUnderline);
		return () => window.removeEventListener('resize', updateNavUnderline);
	});

	// Determine which parent nav link should be active
	const activeParent = $derived(
		currentPath === '/' ? 'dashboard' :
		['/kanban', '/cues', '/notes', '/media'].some(p => currentPath.startsWith(p)) ? 'projects' :
		['/estimates', '/invoices', '/payments', '/books'].some(p => currentPath.startsWith(p)) ? 'accounting' :
		''
	);

	async function handleLogout() {
		if (!confirm('Are you sure you want to logout?')) {
			return;
		}

		try {
			await adminAPI.logout();
			goto('/login');
		} catch (error) {
			console.error('Logout error:', error);
			alert('Logout failed. Please try again.');
		}
	}
</script>

<nav class="nav" class:scrolled={isScrolled} bind:this={navElement}>
	<div class="nav-content">
		<a href="/" class="logo">Alternassist</a>
		<ul class="nav-links" bind:this={navLinksElement}>
			<li class="nav-item">
				<a href="/" class="nav-link" class:active={currentPath === '/'}>dashboard</a>
			</li>

			<li class="nav-item">
				<a href="#" class="nav-link" class:active={activeParent === 'projects'} onclick={(e: MouseEvent) => e.preventDefault()}>projects</a>
				<div class="nav-dropdown">
					<a href="/kanban" class="nav-dropdown-item" class:active={currentPath === '/kanban'}>kanban</a>
					<a href="/cues" class="nav-dropdown-item" class:active={currentPath === '/cues'}>cues</a>
					{#if isElectron}
						<a href="/notes" class="nav-dropdown-item" class:active={currentPath === '/notes'}>notes</a>
					{/if}
					<a href="/media" class="nav-dropdown-item" class:active={currentPath.startsWith('/media')}>media</a>
				</div>
			</li>

			<li class="nav-item">
				<a href="#" class="nav-link" class:active={activeParent === 'accounting'} onclick={(e: MouseEvent) => e.preventDefault()}>accounting</a>
				<div class="nav-dropdown">
					<a href="/estimates" class="nav-dropdown-item" class:active={currentPath === '/estimates'}>estimates</a>
					<a href="/invoices" class="nav-dropdown-item" class:active={currentPath === '/invoices'}>invoices</a>
					<a href="/payments" class="nav-dropdown-item" class:active={currentPath === '/payments'}>payments</a>
					<a href="/books" class="nav-dropdown-item" class:active={currentPath === '/books'}>books</a>
				</div>
			</li>

			<li class="nav-item">
				<a href="/media/resources/artist-guide.html" class="nav-link" target="_blank">resources</a>
			</li>

			<li class="nav-item" style="margin-left: auto;">
				<button class="nav-link logout-btn" onclick={handleLogout}>logout</button>
			</li>
		</ul>
	</div>
</nav>

<style>
	.nav {
		position: fixed;
		top: 0;
		width: 100%;
		background: rgba(253, 248, 240, 0.8);
		backdrop-filter: blur(20px);
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
		z-index: 1000;
		padding: 1.2rem 0;
		transition: all 0.3s ease;
		-webkit-app-region: drag;
	}

	.nav.scrolled {
		padding: 0.8rem 0;
		background: rgba(253, 248, 240, 0.95);
	}

	.nav-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
		padding-left: 90px;
	}

	.logo {
		font-family: var(--font-primary);
		font-size: 1.75rem;
		font-weight: 400;
		text-decoration: none;
		color: var(--primary-text);
		letter-spacing: -0.02em;
		cursor: pointer;
		transition: opacity 0.3s ease;
		-webkit-app-region: no-drag;
	}

	.logo:hover {
		opacity: 0.7;
	}

	.nav-links {
		display: flex;
		gap: 2.5rem;
		list-style: none;
		position: relative;
		margin: 0;
		padding: 0;
		--underline-left: 0px;
		--underline-width: 80px;
		-webkit-app-region: no-drag;
	}

	.nav-links::after {
		content: '';
		position: absolute;
		bottom: -4px;
		left: var(--underline-left, 0px);
		width: var(--underline-width, 80px);
		height: 2px;
		background: linear-gradient(90deg,
			var(--accent-gold, #E8A45D) 0%,
			var(--accent-red, #ff6b6b) 16.66%,
			#EE5A6F 33.33%,
			var(--accent-purple, #845ec2) 50%,
			var(--accent-blue, #007acc) 66.66%,
			var(--accent-green, #51cf66) 83.33%,
			var(--accent-teal, #469FE0) 100%);
		transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
		border-radius: 1px;
	}

	.nav-link {
		font-family: var(--font-mono);
		text-decoration: none;
		color: var(--subtle-text);
		font-weight: 400;
		font-size: 0.9rem;
		text-transform: lowercase;
		letter-spacing: 0.02em;
		transition: all 0.3s ease;
		cursor: pointer;
		position: relative;
		z-index: 1;
		background: none;
		border: none;
		padding: 0;
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--primary-text);
	}

	.logout-btn {
		color: var(--accent-red);
	}

	/* Dropdown Navigation */
	.nav-item {
		position: relative;
	}

	.nav-dropdown {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 1rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
		padding: 0.5rem 0;
		min-width: 160px;
		opacity: 0;
		visibility: hidden;
		transition: all 0.2s ease;
		z-index: 1001;
	}

	.nav-item:hover .nav-dropdown {
		opacity: 1;
		visibility: visible;
		margin-top: 0.75rem;
	}

	.nav-dropdown-item {
		display: block;
		padding: 0.75rem 1.25rem;
		color: var(--subtle-text);
		text-decoration: none;
		font-size: 0.9rem;
		transition: all 0.2s ease;
		cursor: pointer;
		font-family: var(--font-mono);
		text-transform: lowercase;
	}

	.nav-dropdown-item:hover,
	.nav-dropdown-item.active {
		background: rgba(0, 122, 204, 0.08);
		color: var(--accent-blue);
	}
</style>
