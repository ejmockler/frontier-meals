<script lang="ts">
  import type { LayoutData } from './$types';
  import { page } from '$app/stores';
  import { toasts } from '$lib/stores/toast';
  import { fly } from 'svelte/transition';

  export let data: LayoutData;

  // Check if we're on an auth page
  $: isAuthPage = $page.url.pathname.startsWith('/admin/auth');
</script>

{#if isAuthPage}
  <!-- Auth pages: minimal layout -->
  <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
    <slot />
  </div>
{:else}
  <!-- Admin dashboard: full layout with navigation -->
  <div class="min-h-screen bg-gray-50">
    <!-- Top navigation bar -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/90">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo and title -->
          <div class="flex items-center gap-3">
            <div class="text-2xl">🍽️</div>
            <div>
              <h1 class="text-lg font-semibold text-gray-900">Frontier Meals</h1>
              <p class="text-xs text-gray-500">Admin Dashboard</p>
            </div>
          </div>

          <!-- Admin info -->
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="text-sm font-medium text-gray-900">{data.session?.email}</p>
              <p class="text-xs text-gray-500">Administrator</p>
            </div>
            <form action="/api/admin/auth/logout" method="POST">
              {#if data.csrfToken}
                <input type="hidden" name="csrf_token" value={data.csrfToken} />
              {/if}
              <button
                type="submit"
                class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main navigation tabs -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav class="flex gap-1 -mb-px" aria-label="Tabs">
          <a
            href="/admin"
            data-sveltekit-preload-data="hover"
            data-sveltekit-preload-code="eager"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
              {$page.url.pathname === '/admin'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
          >
            Dashboard
          </a>
          <a
            href="/admin/customers"
            data-sveltekit-preload-data="hover"
            data-sveltekit-preload-code="eager"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
              {$page.url.pathname.startsWith('/admin/customers')
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
          >
            Customers
          </a>
          <a
            href="/admin/emails"
            data-sveltekit-preload-data="hover"
            data-sveltekit-preload-code="eager"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
              {$page.url.pathname.startsWith('/admin/emails')
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
          >
            Email Templates
          </a>
          <a
            href="/admin/kiosk"
            data-sveltekit-preload-data="hover"
            data-sveltekit-preload-code="eager"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
              {$page.url.pathname.startsWith('/admin/kiosk')
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
          >
            Kiosk
          </a>
        </nav>
      </div>
    </div>

    <!-- Page content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>
  </div>
{/if}

<!-- Toast notification container (global) -->
<div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      transition:fly={{ x: 300, duration: 200 }}
      class="pointer-events-auto px-4 py-3 rounded-sm shadow-xl border-2 max-w-md
        {toast.type === 'success' ? 'bg-[#52A675] border-[#52A675]/70 text-white' : ''}
        {toast.type === 'error' ? 'bg-[#D97F3E] border-[#D97F3E]/70 text-white' : ''}
        {toast.type === 'info' ? 'bg-[#2D9B9B] border-[#2D9B9B]/70 text-white' : ''}"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="font-bold text-sm">{toast.message}</p>
        <button
          on:click={() => toasts.dismiss(toast.id)}
          class="text-white hover:text-white/80 flex-shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  {/each}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
</style>
