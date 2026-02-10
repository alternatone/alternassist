<script lang="ts">
	import { onMount } from 'svelte';
	import { ftpAPI } from '$lib/api/ftp';

	// State
	let currentPath = $state('/');
	let items = $state<any[]>([]);
	let sortColumn = $state('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let searchTerm = $state('');

	// Breadcrumb path
	const breadcrumbParts = $derived(
		currentPath === '/' ? [] : currentPath.split('/').filter((p) => p)
	);

	onMount(async () => {
		await loadDirectory('/');
	});

	async function loadDirectory(path: string) {
		try {
			const data = await ftpAPI.browse(path);
			items = data;
			currentPath = path;
		} catch (error) {
			console.error('Error loading directory:', error);
			items = [];
		}
	}

	function navigateToFolder(folderName: string) {
		const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
		loadDirectory(newPath);
	}

	function navigateToBreadcrumb(index: number) {
		if (index === -1) {
			loadDirectory('/');
		} else {
			const parts = currentPath.split('/').filter((p) => p);
			const newPath = '/' + parts.slice(0, index + 1).join('/');
			loadDirectory(newPath);
		}
	}

	function sortBy(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function formatFileSize(bytes: number): string {
		if (!bytes || bytes === 0) return '-';
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - date.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getFileIcon(type: string) {
		const icons = {
			directory:
				'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
			file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
		};
		return icons[type as keyof typeof icons] || icons.file;
	}

	// Filtered and sorted items
	const displayItems = $derived.by(() => {
		let filtered = items;

		// Search filter
		if (searchTerm) {
			filtered = filtered.filter((item) =>
				item.name.toLowerCase().includes(searchTerm.toLowerCase())
			);
		}

		// Sort
		filtered.sort((a, b) => {
			// Directories always first
			if (a.type === 'directory' && b.type !== 'directory') return -1;
			if (a.type !== 'directory' && b.type === 'directory') return 1;

			let aVal: any, bVal: any;

			switch (sortColumn) {
				case 'name':
					aVal = a.name.toLowerCase();
					bVal = b.name.toLowerCase();
					break;
				case 'modified':
					aVal = a.modified ? new Date(a.modified) : new Date(0);
					bVal = b.modified ? new Date(b.modified) : new Date(0);
					break;
				case 'size':
					aVal = a.size || 0;
					bVal = b.size || 0;
					break;
				case 'type':
					aVal = a.type;
					bVal = b.type;
					break;
				default:
					return 0;
			}

			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});

		return filtered;
	});

	const totalSize = $derived(displayItems.reduce((sum, item) => sum + (item.size || 0), 0));
</script>

<svelte:head>
	<title>Media Browser - Alternassist</title>
</svelte:head>

<div class="browser-container">
	<div class="browser-header">
		<h1>Media Browser</h1>
		<div class="breadcrumb">
			<button class="breadcrumb-link" onclick={() => navigateToBreadcrumb(-1)}>All Projects</button>
			{#each breadcrumbParts as part, index}
				<span class="breadcrumb-separator">/</span>
				<button class="breadcrumb-link" onclick={() => navigateToBreadcrumb(index)}>{part}</button>
			{/each}
		</div>
	</div>

	<div class="browser-controls">
		<div class="search-box">
			<svg
				class="search-icon"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="11" cy="11" r="8"></circle>
				<path d="m21 21-4.35-4.35"></path>
			</svg>
			<input type="text" bind:value={searchTerm} placeholder="Search files and folders..." />
		</div>
		<div class="view-toggle">
			<button class="view-btn active">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="8" y1="6" x2="21" y2="6"></line>
					<line x1="8" y1="12" x2="21" y2="12"></line>
					<line x1="8" y1="18" x2="21" y2="18"></line>
					<line x1="3" y1="6" x2="3.01" y2="6"></line>
					<line x1="3" y1="12" x2="3.01" y2="12"></line>
					<line x1="3" y1="18" x2="3.01" y2="18"></line>
				</svg>
				List
			</button>
		</div>
	</div>

	<div class="file-table-container">
		<table class="file-table">
			<thead>
				<tr>
					<th class="sortable" onclick={() => sortBy('name')}>Name</th>
					<th class="sortable" onclick={() => sortBy('modified')}>Date Modified</th>
					<th class="sortable" onclick={() => sortBy('size')}>Size</th>
					<th class="sortable" onclick={() => sortBy('type')}>Type</th>
				</tr>
			</thead>
			<tbody>
				{#if displayItems.length === 0}
					<tr>
						<td colspan="4" class="empty-state">
							{searchTerm ? 'No items match your search.' : 'This folder is empty.'}
						</td>
					</tr>
				{:else}
					{#each displayItems as item}
						<tr
							class={item.type === 'directory' ? 'folder' : ''}
							onclick={() => item.type === 'directory' && navigateToFolder(item.name)}
							style={item.type === 'directory' ? 'cursor: pointer' : ''}
						>
							<td>
								<div class="file-name">{item.name}</div>
							</td>
							<td class="file-date">{formatDate(item.modified)}</td>
							<td class="file-size">{item.type === 'directory' ? '-' : formatFileSize(item.size)}</td>
							<td>
								<span class="file-type-badge badge-{item.type}">
									{item.type}
								</span>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
		<div class="stats-bar">
			<div class="stat-item">
				<span class="stat-value">{displayItems.length}</span>
				<span>items</span>
			</div>
			<div class="stat-item">
				<span class="stat-value">{formatFileSize(totalSize)}</span>
				<span>total</span>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.browser-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	.browser-header {
		margin-bottom: 2rem;
	}

	.browser-header h1 {
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
		font-family: var(--font-display);
		margin-bottom: 0.5rem;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--subtle-text);
		margin-top: 1rem;
	}

	.breadcrumb-link {
		color: var(--accent-teal);
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-body);
		font-size: 0.9rem;
		cursor: pointer;
		transition: color 0.2s;
	}

	.breadcrumb-link:hover {
		color: var(--accent-blue);
	}

	.breadcrumb-separator {
		color: var(--muted-text);
	}

	.browser-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.search-box {
		flex: 1;
		max-width: 400px;
		position: relative;
	}

	.search-box input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		border: var(--border-medium);
		border-radius: 8px;
		font-size: 0.9rem;
		font-family: var(--font-body);
		background: white;
		transition: border-color 0.2s;
	}

	.search-box input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--muted-text);
		pointer-events: none;
	}

	.view-toggle {
		display: flex;
		gap: 0.5rem;
		background: white;
		border: var(--border-medium);
		border-radius: 8px;
		padding: 0.25rem;
	}

	.view-btn {
		padding: 0.5rem 0.75rem;
		border: none;
		background: transparent;
		color: var(--subtle-text);
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-body);
	}

	.view-btn:hover {
		background: var(--bg-primary);
	}

	.view-btn.active {
		background: var(--accent-teal);
		color: white;
	}

	.file-table-container {
		background: white;
		border-radius: var(--radius-lg);
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		overflow: hidden;
	}

	.file-table {
		width: 100%;
		border-collapse: collapse;
	}

	.file-table thead {
		background: var(--bg-primary);
		border-bottom: var(--border-medium);
	}

	.file-table th {
		padding: 1rem 1.5rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--subtle-text);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-family: var(--font-body);
	}

	.file-table th.sortable {
		cursor: pointer;
		user-select: none;
		transition: color 0.2s;
	}

	.file-table th.sortable:hover {
		color: var(--accent-teal);
	}

	.file-table tbody tr {
		border-bottom: var(--border-light);
		transition: background 0.2s;
	}

	.file-table tbody tr:hover {
		background: var(--bg-primary);
	}

	.file-table tbody tr.folder {
		font-weight: 500;
	}

	.file-table td {
		padding: 1rem 1.5rem;
		font-size: 0.9rem;
	}

	.file-name {
		color: var(--primary-text);
	}

	.file-type-badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.badge-directory {
		background: rgba(118, 75, 162, 0.1);
		color: #764ba2;
	}

	.badge-file {
		background: rgba(0, 0, 0, 0.05);
		color: var(--subtle-text);
	}

	.file-size {
		color: var(--muted-text);
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.file-date {
		color: var(--subtle-text);
		font-size: 0.85rem;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--muted-text);
	}

	.stats-bar {
		display: flex;
		gap: 2rem;
		padding: 1rem 1.5rem;
		background: var(--bg-primary);
		border-top: var(--border-light);
		font-size: 0.85rem;
		color: var(--subtle-text);
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-value {
		font-weight: 600;
		color: var(--primary-text);
	}
</style>
