<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ftpAPI, type FTPItem } from '$lib/api/ftp';

	// State
	let currentPath = $state('/');
	let items = $state<FTPItem[]>([]);
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
			items = data.items || [];
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

	function formatFileSize(bytes: number | undefined): string {
		if (!bytes || bytes === 0) return '-';
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
	}

	function formatDate(dateStr: string | undefined): string {
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

	// Determine file category from extension
	function getFileCategory(name: string, isDir: boolean): string {
		if (isDir) return 'folder';
		const ext = name.split('.').pop()?.toLowerCase() || '';
		const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];
		const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'aif', 'aiff'];
		const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'];
		if (videoExts.includes(ext)) return 'video';
		if (audioExts.includes(ext)) return 'audio';
		if (imageExts.includes(ext)) return 'image';
		return 'document';
	}

	function getCategoryLabel(cat: string): string {
		const labels: Record<string, string> = {
			folder: 'Folder',
			video: 'Video',
			audio: 'Audio',
			image: 'Image',
			document: 'Document'
		};
		return labels[cat] || cat;
	}

	// Check if file can be opened in review
	function isReviewable(name: string): boolean {
		const ext = name.split('.').pop()?.toLowerCase() || '';
		const mediaExts = [
			'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v',
			'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'
		];
		return mediaExts.includes(ext);
	}

	function openInReview(item: FTPItem) {
		const filePath = currentPath === '/' ? item.name : `${currentPath}/${item.name}`.replace(/^\//, '');
		goto(`/media/review?ftp=${encodeURIComponent(filePath)}`);
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
		filtered = [...filtered].sort((a, b) => {
			// Directories always first
			const aIsDir = a.isDirectory ?? false;
			const bIsDir = b.isDirectory ?? false;
			if (aIsDir && !bIsDir) return -1;
			if (!aIsDir && bIsDir) return 1;

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
					aVal = getFileCategory(a.name, aIsDir);
					bVal = getFileCategory(b.name, bIsDir);
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

	function getSortIndicator(column: string): string {
		if (sortColumn !== column) return '';
		return sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
	}
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
					<th class="sortable" onclick={() => sortBy('name')}>Name{getSortIndicator('name')}</th>
					<th class="sortable" onclick={() => sortBy('modified')}>Date Modified{getSortIndicator('modified')}</th>
					<th class="sortable" onclick={() => sortBy('size')}>Size{getSortIndicator('size')}</th>
					<th class="sortable" onclick={() => sortBy('type')}>Type{getSortIndicator('type')}</th>
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
						{@const isDir = item.isDirectory ?? false}
						{@const category = getFileCategory(item.name, isDir)}
						{@const reviewable = !isDir && isReviewable(item.name)}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<tr
							class={isDir ? 'folder-row' : reviewable ? 'reviewable-row' : ''}
							onclick={() => isDir && navigateToFolder(item.name)}
							ondblclick={() => reviewable && openInReview(item)}
							style={isDir || reviewable ? 'cursor: pointer' : ''}
							title={reviewable ? 'Double-click to open in review' : ''}
						>
							<td>
								<div class="file-name">
									{#if isDir}
										<svg class="file-icon folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
									{:else if category === 'video'}
										<svg class="file-icon video-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
									{:else if category === 'audio'}
										<svg class="file-icon audio-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
									{:else if category === 'image'}
										<svg class="file-icon image-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
									{:else}
										<svg class="file-icon doc-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
									{/if}
									<span>{item.name}</span>
								</div>
							</td>
							<td class="file-date">{formatDate(item.modified)}</td>
							<td class="file-size">{isDir ? '-' : formatFileSize(item.size)}</td>
							<td>
								<span class="file-type-badge badge-{category}">
									{getCategoryLabel(category)}
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

	.file-table tbody tr.folder-row {
		font-weight: 500;
	}

	.file-table tbody tr.reviewable-row:hover {
		background: rgba(70, 159, 224, 0.05);
	}

	.file-table td {
		padding: 0.75rem 1.5rem;
		font-size: 0.9rem;
	}

	.file-name {
		color: var(--primary-text);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.file-icon {
		flex-shrink: 0;
	}

	.folder-icon {
		color: #764ba2;
	}

	.video-icon {
		color: #f5576c;
	}

	.audio-icon {
		color: #00f2fe;
	}

	.image-icon {
		color: #38f9d7;
	}

	.doc-icon {
		color: var(--subtle-text);
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

	.badge-folder {
		background: rgba(118, 75, 162, 0.1);
		color: #764ba2;
	}

	.badge-video {
		background: rgba(245, 87, 108, 0.1);
		color: #f5576c;
	}

	.badge-audio {
		background: rgba(0, 242, 254, 0.1);
		color: #00b4d8;
	}

	.badge-image {
		background: rgba(56, 249, 215, 0.1);
		color: #2ec4a0;
	}

	.badge-document {
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
