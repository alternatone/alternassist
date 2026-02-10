<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { adminAPI } from '$lib/api/admin';

	// State
	let username = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let rateLimitMessage = $state('');
	let isLoading = $state(false);

	onMount(async () => {
		// Check if already logged in
		try {
			const status = await adminAPI.status();
			if (status.isAdmin) {
				goto('/');
			}
		} catch (error) {
			// Not logged in, stay on login page
		}
	});

	async function handleLogin(event: Event) {
		event.preventDefault();

		// Clear previous messages
		errorMessage = '';
		rateLimitMessage = '';

		const trimmedUsername = username.trim();

		if (!trimmedUsername || !password) {
			errorMessage = 'Please enter both username and password';
			return;
		}

		isLoading = true;

		try {
			await adminAPI.login({ username: trimmedUsername, password });
			// Login successful - redirect to dashboard
			goto('/');
		} catch (error: any) {
			if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
				rateLimitMessage = error.message || 'Too many login attempts. Please try again later.';
			} else {
				errorMessage = error.message || 'Invalid credentials';
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Admin Login - Alternassist</title>
</svelte:head>

<div class="login-page">
	<div class="login-container">
		<div class="logo">Alternassist</div>
		<div class="subtitle">Admin Login</div>

		{#if errorMessage}
			<div class="error-message">{errorMessage}</div>
		{/if}

		{#if rateLimitMessage}
			<div class="rate-limit-message">{rateLimitMessage}</div>
		{/if}

		<form onsubmit={handleLogin}>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					type="text"
					id="username"
					bind:value={username}
					autocomplete="username"
					required
					autofocus
				/>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</div>

			<button type="submit" class="btn-login" disabled={isLoading}>
				{#if isLoading}
					<span class="loading"></span>
				{:else}
					Login
				{/if}
			</button>
		</form>
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
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		padding: 3rem;
		width: 100%;
		max-width: 420px;
		box-shadow: var(--shadow-subtle);
		border: var(--border-light);
	}

	.logo {
		font-family: var(--font-primary);
		font-size: 2rem;
		font-weight: 400;
		text-align: center;
		margin-bottom: 0.5rem;
		letter-spacing: -0.02em;
	}

	.subtitle {
		text-align: center;
		color: var(--subtle-text);
		font-size: 0.9rem;
		font-family: var(--font-mono);
		text-transform: lowercase;
		letter-spacing: 0.05em;
		margin-bottom: 2.5rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--secondary-text);
		font-size: 0.85rem;
		font-family: var(--font-mono);
		text-transform: lowercase;
		letter-spacing: 0.05em;
	}

	.form-group input {
		width: 100%;
		padding: 0.875rem 1rem;
		border: var(--border-medium);
		border-radius: 8px;
		font-size: 1rem;
		font-family: var(--font-primary);
		transition: all 0.2s;
		background: white;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
	}

	.btn-login {
		width: 100%;
		padding: 1rem;
		background: var(--accent-blue);
		color: white;
		border: none;
		border-radius: 8px;
		font-family: var(--font-primary);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		margin-top: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-login:hover:not(:disabled) {
		background: #006bb3;
	}

	.btn-login:active:not(:disabled) {
		transform: translateY(1px);
	}

	.btn-login:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.error-message {
		background: #fff5f5;
		border: 1px solid #feb2b2;
		color: #c53030;
		padding: 0.875rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
	}

	.rate-limit-message {
		background: #fffbeb;
		border: 1px solid #fcd34d;
		color: #92400e;
		padding: 0.875rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 0.6s linear infinite;
	}
</style>
