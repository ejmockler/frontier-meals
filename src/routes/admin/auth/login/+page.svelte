<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let email = '';
  let isLoading = false;
  let isSuccess = false;
  let error = '';

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    missing_token: 'No verification token provided. Please request a new magic link.',
    invalid_token: 'This link is invalid or has already been used. Please request a new magic link.',
    verification_failed: 'Verification failed. Please try again or request a new magic link.',
    expired_token: 'This link has expired. Links are valid for 15 minutes. Please request a new one.'
  };

  onMount(() => {
    // Check for error in URL params
    const errorParam = $page.url.searchParams.get('error');
    if (errorParam) {
      error = errorMessages[errorParam] || 'An error occurred. Please try again.';
    }
  });

  async function handleSubmit() {
    isLoading = true;
    error = '';

    try {
      const response = await fetch('/api/admin/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        throw new Error('Failed to send magic link');
      }

      isSuccess = true;
      isLoading = false;
    } catch (err) {
      error = 'Something went wrong. Please try again.';
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Admin Login - Frontier Meals</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo and branding -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
        <span class="text-3xl">🍽️</span>
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Admin Access</h1>
      <p class="text-gray-600">Sign in to manage Frontier Meals</p>
    </div>

    {#if !isSuccess}
      <!-- Login form -->
      <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <form on:submit|preventDefault={handleSubmit} class="space-y-6">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              bind:value={email}
              required
              disabled={isLoading}
              placeholder="admin@frontier-meals.com"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none disabled:bg-gray-50 disabled:text-gray-500"
            />
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
            disabled={isLoading || !email}
            class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 focus:ring-4 focus:ring-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {#if isLoading}
              <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending magic link...
            {:else}
              Send magic link →
            {/if}
          </button>
        </form>

        <div class="mt-6 pt-6 border-t border-gray-100">
          <p class="text-xs text-gray-500 text-center">
            We'll email you a secure link to sign in.<br>
            No password required.
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

          <h2 class="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p class="text-gray-600 mb-6">
            We've sent a magic link to <strong class="text-gray-900">{email}</strong>
          </p>

          <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
            <p class="text-sm text-indigo-900 mb-2">
              <strong>Next steps:</strong>
            </p>
            <ol class="text-sm text-indigo-800 space-y-1 list-decimal list-inside text-left">
              <li>Open your email inbox</li>
              <li>Click the "Login to Admin Dashboard" button</li>
              <li>You'll be signed in automatically</li>
            </ol>
          </div>

          <p class="text-xs text-gray-500">
            The link expires in 15 minutes.
          </p>

          <button
            on:click={() => { isSuccess = false; email = ''; isLoading = false; }}
            class="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            ← Send another link
          </button>
        </div>
      </div>
    {/if}

    <!-- Security note -->
    <p class="text-center text-xs text-gray-500 mt-6">
      🔒 This is a secure admin-only area.<br>
      Access is restricted to authorized personnel.
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
