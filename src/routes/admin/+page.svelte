<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate, pushState } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Test QR modal state
  let showTestQRModal = $state(false);
  let testQRDate = $state('');
  let testQRLoading = $state(false);

  // Auto-refresh state
  let isRefreshing = $state(false);
  let lastRefresh = Date.now();

  // Auto-refresh dashboard metrics every 30 seconds
  onMount(() => {
    const refreshInterval = setInterval(() => {
      // Only refresh if page is visible (don't waste queries when tab is hidden)
      if (document.visibilityState === 'visible') {
        isRefreshing = true;
        invalidate('admin:dashboard');
        lastRefresh = Date.now();
        setTimeout(() => isRefreshing = false, 300);
      }
    }, 30000); // 30 seconds

    // Refresh when page becomes visible again (user switches back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastRefresh = Date.now() - lastRefresh;
        // Only refresh if it's been more than 15 seconds
        if (timeSinceLastRefresh > 15000) {
          isRefreshing = true;
          invalidate('admin:dashboard');
          lastRefresh = Date.now();
          setTimeout(() => isRefreshing = false, 300);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  // Get today's date in YYYY-MM-DD format for input default
  function getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Initialize with today's date
  $effect(() => {
    if (!testQRDate) {
      testQRDate = getTodayString();
    }
  });

  // Open test QR modal with shallow routing (enables back button to close)
  function openTestQRModal() {
    showTestQRModal = true;
    pushState('', { testQR: true });
  }

  // React to back button - close modal when state is cleared
  $effect(() => {
    if (!$page.state.testQR && showTestQRModal) {
      showTestQRModal = false;
    }
  });

  async function generateTestQR() {
    testQRLoading = true;
    try {
      const response = await fetch('/api/admin/test-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceDate: testQRDate })
      });
      const result = await response.json();

      if (result.success) {
        const debugInfo = result.debug ? `\n\nDebug Info:\n${JSON.stringify(result.debug, null, 2)}` : '';
        alert(`✅ ${result.message}${debugInfo}`);
        showTestQRModal = false;
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      testQRLoading = false;
    }
  }

  // Format activity action for display
  function formatAction(action: string): string {
    return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Get color for action type
  function getActionColor(action: string): string {
    if (action.includes('created')) return 'text-white bg-[#52A675] border-2 border-[#52A675]/70';
    if (action.includes('canceled')) return 'text-white bg-[#C85454] border-2 border-[#C85454]/70';
    if (action.includes('failed')) return 'text-white bg-[#D97F3E] border-2 border-[#D97F3E]/70';
    return 'text-white bg-[#2D9B9B] border-2 border-[#2D9B9B]/70';
  }

  // Format timestamp
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
</script>

<svelte:head>
  <title>Dashboard - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-8">
  <!-- Page header with refresh indicator -->
  <div class="relative">
    <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Dashboard</h1>
    <p class="text-[#5C5A56] mt-2">Welcome back. Here's what's happening today.</p>

    {#if isRefreshing}
      <div class="absolute top-0 right-0 px-3 py-1 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm text-xs text-white font-bold animate-pulse">
        Updated
      </div>
    {/if}
  </div>

  <!-- Key metrics grid -->
  {#await data.metrics}
    <!-- Skeleton loading state for metrics -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Total customers skeleton -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Total Customers</p>
            <div class="h-9 w-20 bg-[#E8E6E1] rounded animate-pulse mt-2"></div>
          </div>
          <div class="w-12 h-12 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Active subscriptions skeleton -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Active Subscriptions</p>
            <div class="h-9 w-16 bg-[#E8E6E1] rounded animate-pulse mt-2"></div>
          </div>
          <div class="w-12 h-12 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div class="mt-4">
          <div class="h-4 w-32 bg-[#E8E6E1] rounded animate-pulse"></div>
        </div>
      </div>

      <!-- Today's redemptions skeleton -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Today's Redemptions</p>
            <div class="h-9 w-12 bg-[#E8E6E1] rounded animate-pulse mt-2"></div>
          </div>
          <div class="w-12 h-12 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  {:then metrics}
    <!-- Loaded metrics -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Total customers -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Total Customers</p>
            <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{metrics.totalCustomers}</p>
          </div>
          <div class="w-12 h-12 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Active subscriptions -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Active Subscriptions</p>
            <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{metrics.activeSubscriptions}</p>
          </div>
          <div class="w-12 h-12 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div class="mt-4 flex items-center text-sm">
          {#await data.statusCounts}
            <span class="text-[#8E8C87] animate-pulse">Loading status...</span>
          {:then statusCounts}
            <span class="text-[#5C5A56]">
              {statusCounts.past_due || 0} past due,
              {statusCounts.canceled || 0} canceled
            </span>
          {:catch}
            <span class="text-[#C85454]">Failed to load</span>
          {/await}
        </div>
      </div>

      <!-- Today's redemptions -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[#5C5A56]">Today's Redemptions</p>
            <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{metrics.todayRedemptions}</p>
          </div>
          <div class="w-12 h-12 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  {/await}

  <!-- Quick actions -->
  <div class="bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm p-6 text-white shadow-lg">
    <h2 class="text-xl font-extrabold tracking-tight mb-4">Quick Actions</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <a
        href="/admin/customers"
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span class="font-bold">Search Customers</span>
        </div>
      </a>

      <a
        href="/admin/emails"
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span class="font-bold">Email Templates</span>
        </div>
      </a>

      <a
        href="/admin/kiosk"
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span class="font-bold">Launch Kiosk</span>
        </div>
      </a>

      <button
        onclick={openTestQRModal}
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="font-bold">Test QR Code</span>
        </div>
      </button>
    </div>
  </div>

  <!-- Recent activity feed -->
  <div class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-lg">
    <div class="p-6 border-b-2 border-[#D9D7D2]">
      <h2 class="text-lg font-extrabold tracking-tight text-[#1A1816]">Recent Activity</h2>
      <p class="text-sm text-[#5C5A56] mt-1">Latest events from the system</p>
    </div>
    <div class="divide-y-2 divide-[#D9D7D2]">
      {#await data.recentActivity}
        <div class="p-8 text-center text-[#8E8C87]">
          <div class="w-12 h-12 mx-auto mb-4 border-4 border-[#D9D7D2] border-t-[#2D9B9B] rounded-full animate-spin"></div>
          <p class="font-bold">Loading activity...</p>
        </div>
      {:then recentActivity}
        {#if recentActivity.length === 0}
          <div class="p-8 text-center text-[#5C5A56]">
            <svg class="w-12 h-12 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p class="font-bold">No recent activity</p>
            <p class="text-sm mt-1">Activity will appear here as events occur</p>
          </div>
        {:else}
          {#each recentActivity as activity}
            <div class="p-4 hover:bg-white transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3 flex-1">
                  <span class="px-2 py-1 text-xs font-bold rounded-sm {getActionColor(activity.action)}">
                    {formatAction(activity.action)}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-[#1A1816] font-bold">
                      {activity.customerName || 'Unknown customer'}
                    </p>
                    {#if activity.metadata?.kiosk_location}
                      <p class="text-xs text-[#5C5A56] mt-1">
                        at {activity.metadata.kiosk_location}
                      </p>
                    {/if}
                    {#if activity.metadata?.telegram_username}
                      <p class="text-xs mt-1">
                        <a
                          href="https://t.me/{activity.metadata.telegram_username}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[#2D9B9B] hover:text-[#E67E50] font-medium transition-colors hover:underline"
                          data-sveltekit-preload-data="false"
                        >
                          @{activity.metadata.telegram_username}
                        </a>
                      </p>
                    {/if}
                  </div>
                </div>
                <span class="text-xs text-[#8E8C87] whitespace-nowrap">
                  {formatTime(activity.created_at)}
                </span>
              </div>
            </div>
          {/each}
        {/if}
      {:catch error}
        <div class="p-8 text-center text-[#C85454]">
          <svg class="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="font-bold">Failed to load activity</p>
          <p class="text-sm text-[#5C5A56] mt-1">Please refresh the page to try again</p>
        </div>
      {/await}
    </div>
  </div>
</div>

<!-- Test QR Modal -->
{#if showTestQRModal}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6">
      <h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-4">Generate Test QR Code</h3>

      <p class="text-sm text-[#5C5A56] mb-6">
        Generate a test QR code for any service date to verify expiration handling and timezone behavior.
      </p>

      <div class="mb-6">
        <label for="test-qr-date" class="block text-sm font-bold text-[#1A1816] mb-2">
          Service Date
        </label>
        <input
          id="test-qr-date"
          type="date"
          bind:value={testQRDate}
          class="w-full px-4 py-3 bg-white border-2 border-[#D9D7D2] rounded-sm text-[#1A1816] font-medium focus:outline-none focus:border-[#E67E50] transition-colors"
        />
        <p class="text-xs text-[#8E8C87] mt-2">
          QR code will expire at 11:59:59 PM Pacific Time on this date
        </p>
      </div>

      <div class="bg-[#E67E50]/10 border-2 border-[#E67E50]/20 rounded-sm p-4 mb-6">
        <h4 class="text-sm font-bold text-[#1A1816] mb-2">Test Scenarios:</h4>
        <ul class="text-xs text-[#5C5A56] space-y-1">
          <li>• <strong>Yesterday:</strong> Should show "QR code expired"</li>
          <li>• <strong>Today:</strong> Should scan successfully</li>
          <li>• <strong>Tomorrow:</strong> Should scan successfully (valid for future dates)</li>
        </ul>
      </div>

      <div class="flex gap-3">
        <button
          onclick={() => showTestQRModal = false}
          class="flex-1 px-4 py-3 bg-[#D9D7D2] hover:bg-[#C9C7C2] text-[#1A1816] font-bold rounded-sm transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={generateTestQR}
          disabled={testQRLoading}
          class="flex-1 px-4 py-3 bg-[#E67E50] hover:bg-[#D97F3E] disabled:bg-[#D9D7D2] disabled:text-[#8E8C87] text-white font-bold rounded-sm transition-colors disabled:cursor-not-allowed cursor-pointer"
        >
          {testQRLoading ? 'Sending...' : 'Generate & Send'}
        </button>
      </div>
    </div>
  </div>
{/if}
