<script lang="ts">
	import { shareAPI } from '$lib/api/share';

	interface ShareItem {
		type: 'project' | 'file' | 'ftp';
		id?: number;
		path?: string;
		name: string;
	}

	let showModal = $state(false);
	let showSuccessModal = $state(false);
	let currentItem: ShareItem | null = $state(null);

	// Form state
	let expiry = $state('7d');
	let requirePassword = $state(false);
	let password = $state('');

	// Success state
	let generatedUrl = $state('');
	let generatedPassword = $state('');
	let generatedExpiry = $state('');

	export function openForProject(projectId: number, projectName: string) {
		currentItem = { type: 'project', id: projectId, name: projectName };
		resetForm();
		showModal = true;
	}

	export function openForFile(fileId: number, fileName: string) {
		currentItem = { type: 'file', id: fileId, name: fileName };
		resetForm();
		showModal = true;
	}

	export function openForFtp(ftpPath: string, fileName: string) {
		currentItem = { type: 'ftp', path: ftpPath, name: fileName };
		resetForm();
		showModal = true;
	}

	function resetForm() {
		expiry = '7d';
		requirePassword = false;
		password = '';
	}

	function closeModal() {
		showModal = false;
		currentItem = null;
	}

	function closeSuccessModal() {
		showSuccessModal = false;
	}

	async function generateShareLink() {
		if (!currentItem) return;

		if (requirePassword && !password.trim()) {
			alert('Please enter a password');
			return;
		}

		try {
			const requestData: any = {
				password: requirePassword ? password.trim() : undefined,
				expires_at: expiry !== 'never' ? expiry : undefined
			};

			if (currentItem.type === 'project') {
				requestData.project_id = currentItem.id;
			} else if (currentItem.type === 'file') {
				requestData.file_id = currentItem.id;
			} else if (currentItem.type === 'ftp') {
				requestData.ftp_path = currentItem.path;
			}

			const data = await shareAPI.generate(requestData);

			// Copy to clipboard
			await navigator.clipboard.writeText(data.url);

			// Store success data
			generatedUrl = data.url;
			generatedPassword = requirePassword ? password.trim() : '';
			generatedExpiry = expiry !== 'never' ? '7 days' : 'Never';

			// Switch modals
			closeModal();
			showSuccessModal = true;
		} catch (error: any) {
			console.error('[Share Link] Error:', error);
			alert(error.message || 'Failed to generate share link');
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			closeModal();
		}
	}

	function handleSuccessBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			closeSuccessModal();
		}
	}
</script>

{#if showModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={handleBackdropClick}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>Generate Share Link</h2>
				<button class="modal-close" onclick={closeModal}>&times;</button>
			</div>
			<div class="modal-body">
				<p class="modal-subtitle">
					Generate a secure share link for {currentItem?.type === 'project' ? 'project' : 'file'} "{currentItem?.name}"
				</p>

				<div class="form-group">
					<label class="form-label">Link Expiration</label>
					<div class="radio-group">
						<label class="radio-option">
							<input type="radio" bind:group={expiry} value="7d" />
							<span>7 days</span>
						</label>
						<label class="radio-option">
							<input type="radio" bind:group={expiry} value="never" />
							<span>Never</span>
						</label>
					</div>
				</div>

				<div class="form-group">
					<label class="checkbox-option">
						<input type="checkbox" bind:checked={requirePassword} />
						<span class="form-label">Require password</span>
					</label>
				</div>

				{#if requirePassword}
					<div class="form-group">
						<label class="form-label">Password</label>
						<input type="text" bind:value={password} placeholder="Enter password" class="form-input" />
					</div>
				{/if}

				<div class="modal-actions">
					<button class="btn-secondary" onclick={closeModal}>Cancel</button>
					<button class="btn-primary" onclick={generateShareLink}>Generate Link</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showSuccessModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={handleSuccessBackdropClick}>
		<div class="modal-content">
			<div class="modal-header">
				<h2>Share Link Generated</h2>
				<button class="modal-close" onclick={closeSuccessModal}>&times;</button>
			</div>
			<div class="modal-body">
				<p class="modal-subtitle">Link copied to clipboard!</p>

				<div class="url-display">{generatedUrl}</div>

				<div class="link-details">
					{#if generatedPassword}
						<div class="detail-row">
							<strong>Password:</strong> <code>{generatedPassword}</code>
						</div>
					{/if}
					<div class="detail-row">
						<strong>Expires:</strong> {generatedExpiry}
					</div>
				</div>

				<div class="modal-actions">
					<button class="btn-primary" onclick={closeSuccessModal}>Done</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.modal-content {
		background: white;
		border-radius: 12px;
		width: 100%;
		max-width: 600px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		padding: 1.5rem;
		border-bottom: 1px solid #f0f0f0;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-header h2 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 2rem;
		line-height: 1;
		cursor: pointer;
		color: #888;
		transition: color 0.2s;
	}

	.modal-close:hover {
		color: #1a1a1a;
	}

	.modal-body {
		padding: 2rem;
	}

	.modal-subtitle {
		color: var(--subtle-text);
		margin-bottom: 1.5rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--secondary-text);
	}

	.radio-group {
		display: flex;
		gap: 0.75rem;
	}

	.radio-option,
	.checkbox-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.form-input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-size: 1rem;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}

	.btn-primary:hover {
		background: var(--accent-blue);
	}

	.btn-secondary {
		background: white;
		color: #666;
		border: 1px solid #e8e8e8;
	}

	.btn-secondary:hover {
		background: var(--bg-primary);
	}

	.url-display {
		background: var(--bg-primary);
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		word-break: break-all;
		font-family: var(--font-mono);
		font-size: 0.9rem;
	}

	.link-details {
		background: #f8f9fa;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.detail-row {
		margin-bottom: 0.5rem;
	}

	.detail-row:last-child {
		margin-bottom: 0;
	}

	.detail-row code {
		background: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}
</style>
