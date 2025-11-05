<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

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
  <!-- Page header -->
  <div>
    <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Dashboard</h1>
    <p class="text-[#5C5A56] mt-2">Welcome back. Here's what's happening today.</p>
  </div>

  <!-- Key metrics grid -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- Total customers -->
    <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-[#5C5A56]">Total Customers</p>
          <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{data.metrics.totalCustomers}</p>
        </div>
        <div class="w-12 h-12 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
      </div>
      <div class="mt-4 flex items-center text-sm">
        <span class="text-[#52A675] font-medium">Active subscribers</span>
      </div>
    </div>

    <!-- Active subscriptions -->
    <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-[#5C5A56]">Active Subscriptions</p>
          <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{data.metrics.activeSubscriptions}</p>
        </div>
        <div class="w-12 h-12 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
      <div class="mt-4 flex items-center text-sm">
        <span class="text-[#5C5A56]">
          {data.metrics.statusCounts.past_due || 0} past due,
          {data.metrics.statusCounts.canceled || 0} canceled
        </span>
      </div>
    </div>

    <!-- Today's redemptions -->
    <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-[#5C5A56]">Today's Redemptions</p>
          <p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">{data.metrics.todayRedemptions}</p>
        </div>
        <div class="w-12 h-12 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
      <div class="mt-4 flex items-center text-sm">
        <span class="text-[#5C5A56]">QR codes scanned today</span>
      </div>
    </div>
  </div>

  <!-- Quick actions -->
  <div class="bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm p-6 text-white shadow-lg">
    <h2 class="text-xl font-extrabold tracking-tight mb-4">Quick Actions</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <a
        href="/admin/customers"
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all"
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
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all"
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
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span class="font-bold">Launch Kiosk</span>
        </div>
      </a>

      <button
        on:click={() => fetch('/api/cron/issue-qr', { method: 'POST', headers: { 'cron-secret': '' } })}
        class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all"
      >
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="font-bold">Test QR Cron</span>
        </div>
      </button>
    </div>
  </div>

  <!-- Recent activity feed -->
  <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm shadow-lg">
    <div class="p-6 border-b-2 border-[#D9D7D2]">
      <h2 class="text-lg font-extrabold tracking-tight text-[#1A1816]">Recent Activity</h2>
      <p class="text-sm text-[#5C5A56] mt-1">Latest events from the system</p>
    </div>
    <div class="divide-y-2 divide-[#D9D7D2]">
      {#if data.recentActivity.length === 0}
        <div class="p-8 text-center text-[#5C5A56]">
          <svg class="w-12 h-12 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p class="font-bold">No recent activity</p>
          <p class="text-sm mt-1">Activity will appear here as events occur</p>
        </div>
      {:else}
        {#each data.recentActivity as activity}
          <div class="p-4 hover:bg-[#F5F3EF] transition-colors">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 flex-1">
                <span class="px-2 py-1 text-xs font-bold rounded-sm {getActionColor(activity.action)}">
                  {formatAction(activity.action)}
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-[#1A1816] font-bold">{activity.subject}</p>
                  {#if activity.metadata}
                    <p class="text-xs text-[#5C5A56] mt-1 truncate">
                      {JSON.stringify(activity.metadata)}
                    </p>
                  {/if}
                  <p class="text-xs text-[#5C5A56] mt-1">by {activity.actor}</p>
                </div>
              </div>
              <span class="text-xs text-[#8E8C87] whitespace-nowrap">
                {formatTime(activity.created_at)}
              </span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
