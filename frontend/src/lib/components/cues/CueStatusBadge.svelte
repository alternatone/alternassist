<script lang="ts">
	let { status }: { status: string } = $props();

	// Normalize legacy status values
	const normalizedStatus = $derived(() => {
		if (status === 'sketch') return 'to-write';
		if (status === 'recording') return 'written';
		if (status === 'mixing') return 'revisions';
		if (status === 'complete') return 'approved';
		return status;
	});

	const statusLabels: Record<string, string> = {
		'to-write': 'To Write',
		written: 'Written',
		revisions: 'Revisions',
		approved: 'Approved'
	};
</script>

<span class="status-badge status-{normalizedStatus()}">
	{statusLabels[normalizedStatus()] || status}
</span>

<style>
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-to-write {
		background: rgba(255, 107, 107, 0.1);
		color: var(--accent-red);
	}

	.status-written {
		background: rgba(255, 146, 43, 0.1);
		color: var(--accent-gold);
	}

	.status-revisions {
		background: rgba(255, 217, 61, 0.1);
		color: #ffd93d;
	}

	.status-approved {
		background: rgba(81, 207, 102, 0.1);
		color: var(--accent-green);
	}
</style>
