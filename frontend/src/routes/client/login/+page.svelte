<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { clientPortalAPI } from '$lib/api/clientPortal';

	// State
	let projectName = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isLoading = $state(false);

	// Get file parameter from URL if present
	const fileParam = $derived($page.url.searchParams.get('file'));
	const filesParam = $derived($page.url.searchParams.get('files'));

	onMount(async () => {
		// Check if already logged in
		try {
			const current = await clientPortalAPI.getCurrent();
			if (current && current.id) {
				// Already logged in - redirect appropriately
				if (fileParam) {
					goto(`/client/portal?file=${encodeURIComponent(fileParam)}`);
				} else if (filesParam) {
					goto(`/client/portal?files=${encodeURIComponent(filesParam)}`);
				} else {
					goto('/client/portal');
				}
			}
		} catch (error) {
			// Not logged in, stay on login page
		}
	});

	async function handleLogin(event: Event) {
		event.preventDefault();

		const trimmedProjectName = projectName.trim();

		if (!trimmedProjectName || !password) {
			errorMessage = 'Please enter both project name and password';
			return;
		}

		errorMessage = '';
		isLoading = true;

		try {
			await clientPortalAPI.login({ name: trimmedProjectName, password });

			// Authentication successful - redirect
			if (fileParam) {
				goto(`/client/portal?file=${encodeURIComponent(fileParam)}`);
			} else if (filesParam) {
				goto(`/client/portal?files=${encodeURIComponent(filesParam)}`);
			} else {
				goto('/client/portal');
			}
		} catch (error: any) {
			errorMessage = error.message || 'Invalid credentials';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Client Portal - Alternassist</title>
</svelte:head>

<div class="login-page">
	<div class="login-container">
		<div class="logo">
			<h1>Alternassist</h1>
			<p>Client Portal</p>
		</div>

		{#if errorMessage}
			<div class="error-message">{errorMessage}</div>
		{/if}

		<form onsubmit={handleLogin}>
			<div class="form-group">
				<label for="projectName">Project Name</label>
				<input
					type="text"
					id="projectName"
					bind:value={projectName}
					autocomplete="off"
					required
					autofocus
				/>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input type="password" id="password" bind:value={password} required />
			</div>

			<button type="submit" class="btn" disabled={isLoading}>
				{#if isLoading}
					authenticating...
				{:else}
					access files
				{/if}
			</button>
		</form>

		<div class="help-text">Contact your project manager if you need assistance</div>
	</div>
</div>

<style>
	:global(body) {
		overflow: hidden !important;
	}

	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: var(--bg-primary);
	}

	.login-container {
		background: white;
		border-radius: var(--radius-lg);
		padding: 3rem;
		max-width: 450px;
		width: 100%;
		box-shadow: var(--shadow-subtle);
	}

	.logo {
		text-align: center;
		margin-bottom: 2rem;
	}

	.logo h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 600;
		color: var(--primary-text);
		margin-bottom: 0.5rem;
	}

	.logo p {
		color: var(--subtle-text);
		font-size: 0.95rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--secondary-text);
		font-size: 0.9rem;
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: var(--border-medium);
		border-radius: 8px;
		font-family: var(--font-primary);
		font-size: 0.95rem;
		transition: border-color 0.2s;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.btn {
		width: 100%;
		padding: 0.875rem 1.5rem;
		background: var(--accent-teal);
		color: white;
		border: none;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn:hover:not(:disabled) {
		background: var(--accent-blue);
	}

	.btn:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.error-message {
		background: #ffebee;
		color: #c62828;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.help-text {
		text-align: center;
		margin-top: 1.5rem;
		color: var(--muted-text);
		font-size: 0.85rem;
	}
</style>
