<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	let handle = data.prefilled_handle || '';
	let isLoading = false;
	let isSuccess = false;
	let error = '';

	// Auto-add @ prefix if not present
	function formatHandle(value: string) {
		if (value && !value.startsWith('@')) {
			return '@' + value;
		}
		return value;
	}

	async function handleSubmit() {
		isLoading = true;
		error = '';

		const formattedHandle = formatHandle(handle);

		try {
			const response = await fetch('/api/handle/consume', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: data.token,
					newHandle: formattedHandle
				})
			});

			const result = await response.json();

			if (!response.ok) {
				if (result.code === 'INVALID_TOKEN') {
					error = 'This link is invalid. Please contact support.';
				} else if (result.code === 'ALREADY_USED') {
					error = 'This link has already been used.';
				} else if (result.code === 'EXPIRED') {
					error = 'This link has expired. Please contact support for a new one.';
				} else if (result.code === 'HANDLE_TAKEN') {
					error = 'This Telegram handle is already linked to another account.';
				} else if (result.code === 'INVALID_HANDLE_FORMAT') {
					error = result.details || 'Invalid handle format. Use @username format.';
				} else {
					error = result.error || 'Something went wrong. Please try again.';
				}
				isLoading = false;
			} else {
				isSuccess = true;
			}
		} catch (err) {
			error = 'Network error. Please check your connection and try again.';
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Update Telegram Handle - Frontier Meals</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
	<div class="w-full max-w-md">
		<!-- Logo and branding -->
		<div class="text-center mb-8">
			<div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl mb-4 shadow-lg">
				<span class="text-3xl">✏️</span>
			</div>
			<h1 class="text-3xl font-bold text-gray-900 mb-2">Update Your Telegram Handle</h1>
			<p class="text-gray-600">Correct your Telegram username to connect your account</p>
		</div>

		{#if !isSuccess}
			<!-- Handle update form -->
			<div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
				<form on:submit|preventDefault={handleSubmit} class="space-y-6">
					<div>
						<label for="handle" class="block text-sm font-medium text-gray-700 mb-2">
							Telegram Username
						</label>
						<div class="relative">
							<input
								id="handle"
								type="text"
								bind:value={handle}
								required
								disabled={isLoading}
								placeholder="@username"
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:bg-gray-50 disabled:text-gray-500"
							/>
						</div>
						<p class="text-xs text-gray-500 mt-2">
							Enter your Telegram username (e.g. @username). Must be 2-32 characters.
						</p>
					</div>

					{#if error}
						<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 animate-shake">
							<svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="text-sm text-red-800">{error}</p>
						</div>
					{/if}

					<button
						type="submit"
						disabled={isLoading || !handle}
						class="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-cyan-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						{#if isLoading}
							<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Updating handle...
						{:else}
							Update handle →
						{/if}
					</button>
				</form>

				<div class="mt-6 pt-6 border-t border-gray-100">
					<p class="text-xs text-gray-500 text-center">
						This link expires in 48 hours.<br>
						Need help? Message <a href="https://t.me/noahchonlee" class="text-blue-600 hover:text-blue-700 font-medium">@noahchonlee</a> on Telegram.
					</p>
				</div>
			</div>
		{:else}
			<!-- Success state -->
			<div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
				<div class="text-center">
					<!-- Success icon with animation -->
					<div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
						<svg class="w-8 h-8 text-green-600 animate-checkmark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
					</div>

					<h2 class="text-2xl font-bold text-gray-900 mb-2">Handle updated!</h2>
					<p class="text-gray-600 mb-6">
						Your Telegram handle has been updated to <strong class="text-gray-900">{formatHandle(handle)}</strong>
					</p>

					<div class="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
						<p class="text-sm text-blue-900 mb-2">
							<strong>Next steps:</strong>
						</p>
						<ol class="text-sm text-blue-800 space-y-1 list-decimal list-inside text-left">
							<li>Open Telegram and search for <strong>@frontier_meals_bot</strong></li>
							<li>Click "Start" to connect your account</li>
							<li>You'll receive your meal QR codes daily</li>
						</ol>
					</div>

					<a
						href="https://t.me/frontier_meals_bot"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center justify-center w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-cyan-700 focus:ring-4 focus:ring-blue-200 transition-all"
					>
						Open Telegram Bot →
					</a>
				</div>
			</div>
		{/if}

		<!-- Security note -->
		<p class="text-center text-xs text-gray-500 mt-6">
			🔒 This is a secure one-time link.<br>
			Your handle will only be updated once.
		</p>
	</div>
</div>

<style>
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
		20%, 40%, 60%, 80% { transform: translateX(4px); }
	}

	@keyframes checkmark {
		0% {
			opacity: 0;
			transform: scale(0.5);
		}
		50% {
			opacity: 1;
			transform: scale(1.1);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-shake {
		animation: shake 0.5s ease-in-out;
	}

	.animate-checkmark {
		animation: checkmark 0.5s ease-out;
	}
</style>
