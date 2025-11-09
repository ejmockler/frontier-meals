# Admin App - Svelte Performance Optimizations

**Document Version:** 1.0
**Created:** 2025-11-09
**Status:** Implementation Plan
**Estimated Timeline:** 5-7 days

## Executive Summary

This document outlines a comprehensive strategy to optimize the Frontier Meals admin application using SvelteKit's performance primitives. The goal is to achieve:

- **Zero full-page reloads** - All navigation and data updates happen client-side
- **Instant navigation** - Preload data before users click
- **Live data updates** - Real-time dashboard metrics without manual refresh
- **Cost optimization** - Minimize database queries and API calls through intelligent caching
- **Sub-100ms perceived latency** - Users should never wait

## Current State Analysis

### Existing Admin Routes

| Route | Load Function | Current Issues | Optimization Priority |
|-------|--------------|----------------|----------------------|
| `/admin` (Dashboard) | ✅ Server load | Sequential Promise.all, N+1 queries for activity enrichment | **HIGH** |
| `/admin/customers` | ✅ Server load | No preloading, full page reload on search | **MEDIUM** |
| `/admin/emails` | ✅ Server load | No preview updates, form submission causes reload | **MEDIUM** |
| `/admin/kiosk` | ✅ Server load | Session creation causes reload | **LOW** |

### Key Pain Points Identified

**1. Dashboard Activity Feed - N+1 Query Problem**
```typescript
// src/routes/admin/+page.server.ts:44-63
const recentActivity = await Promise.all((rawActivity || []).map(async (activity) => {
  const customerIdMatch = activity.subject?.match(/customer:([a-f0-9-]+)/);
  const customerId = customerIdMatch?.[1];

  let customerName = null;
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .single(); // ❌ One query per activity item
    customerName = customer?.email || null;
  }
  return { ...activity, customerName };
}));
```

**Impact:** 10 activity items = 10 sequential database queries
**Solution:** Batch fetch all customer IDs in a single query

**2. Customer Search - Full Page Reload**
```typescript
// src/routes/admin/customers/+page.svelte:16-21
function handleSearch() {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);
  window.location.href = `/admin/customers${...}`; // ❌ Full reload
}
```

**Impact:** Loses scroll position, re-fetches layout data, slow UX
**Solution:** Use `goto()` with `invalidateAll()` for client-side navigation

**3. Email Template Editor - No Live Preview**
```typescript
// src/routes/admin/emails/+page.svelte
// ❌ No preview updates when editing HTML
// ❌ Form submission causes full page reload
```

**Impact:** Users must mentally visualize HTML output
**Solution:** Debounced preview with iframe sandbox

**4. Navigation - No Preloading**
```svelte
<!-- src/routes/admin/+layout.svelte:58-93 -->
<a href="/admin/customers" class="...">Customers</a>
<!-- ❌ No data-sveltekit-preload-data attribute -->
```

**Impact:** 200-500ms delay when clicking tabs
**Solution:** Add preload directives to navigation links

## Optimization Strategy

### Phase 1: Navigation & Preloading (Day 1-2)

**Goal:** Instant navigation between admin pages

#### 1.1 Add Preload Directives

```svelte
<!-- src/routes/admin/+layout.svelte -->
<a
  href="/admin"
  data-sveltekit-preload-data="hover"
  data-sveltekit-preload-code="eager"
  class="..."
>
  Dashboard
</a>
```

**Preload Strategy:**
- `data="hover"` - Load data when user hovers (300ms before click on average)
- `code="eager"` - Load JavaScript immediately on page mount
- `viewport` - Load when link enters viewport (for below-fold links)

#### 1.2 Optimize Layout Data Loading

```typescript
// src/routes/admin/+layout.server.ts
export const load: LayoutServerLoad = async ({ cookies, url }) => {
  // ✅ Already optimized - session data is minimal
  // No changes needed
};
```

**Rationale:** Layout load is already fast (<10ms). Session check is cached by Supabase client.

#### 1.3 Add Prefetch on Focus

```svelte
<!-- For mobile users who don't hover -->
<a
  href="/admin/customers"
  data-sveltekit-preload-data="tap"
  data-sveltekit-preload-code="eager"
>
```

**Expected Results:**
- Navigation latency: 200ms → 0ms (data already loaded)
- Perceived performance: Instant tab switching

---

### Phase 2: Dashboard Real-Time Updates (Day 2-3)

**Goal:** Live metrics without manual refresh, zero wasted queries

#### 2.1 Fix N+1 Query Problem

```typescript
// src/routes/admin/+page.server.ts - OPTIMIZED VERSION

export const load: PageServerLoad = async () => {
  const today = new Date().toISOString().split('T')[0];

  // Step 1: Fetch raw activity (unchanged)
  const { data: rawActivity } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  // Step 2: Extract all customer IDs (batch operation)
  const customerIds = Array.from(new Set(
    (rawActivity || [])
      .map(a => a.subject?.match(/customer:([a-f0-9-]+)/)?.[1])
      .filter(Boolean)
  ));

  // Step 3: Fetch ALL customers in ONE query
  const { data: customers } = await supabase
    .from('customers')
    .select('id, email')
    .in('id', customerIds);

  // Step 4: Build lookup map
  const customerMap = new Map(
    (customers || []).map(c => [c.id, c.email])
  );

  // Step 5: Enrich activity (no async, pure mapping)
  const recentActivity = (rawActivity || []).map(activity => {
    const customerIdMatch = activity.subject?.match(/customer:([a-f0-9-]+)/);
    const customerId = customerIdMatch?.[1];
    return {
      ...activity,
      customerName: customerId ? customerMap.get(customerId) || null : null
    };
  });

  // Fetch metrics (unchanged)
  const [
    { count: totalCustomers },
    { count: activeSubscriptions },
    { count: todayRedemptions }
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('redemptions').select('*', { count: 'exact', head: true }).eq('service_date', today)
  ]);

  // Subscription stats (unchanged)
  const { data: subscriptionStats } = await supabase
    .from('subscriptions')
    .select('status');

  const statusCounts = subscriptionStats?.reduce((acc, sub) => {
    acc[sub.status] = (acc[sub.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return {
    metrics: {
      totalCustomers: totalCustomers || 0,
      activeSubscriptions: activeSubscriptions || 0,
      todayRedemptions: todayRedemptions || 0,
      statusCounts
    },
    recentActivity
  };
};
```

**Performance Gain:**
- Before: 10 sequential queries = ~500ms
- After: 1 batch query = ~50ms
- **10x improvement**

#### 2.2 Add Auto-Refresh with Intelligent Timing

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';

  export let data: PageData;

  let refreshInterval: ReturnType<typeof setInterval>;
  let lastRefresh = Date.now();

  // Auto-refresh dashboard metrics every 30 seconds
  onMount(() => {
    refreshInterval = setInterval(() => {
      // Only refresh if page is visible (don't waste queries when tab is hidden)
      if (document.visibilityState === 'visible') {
        invalidate('admin:dashboard');
        lastRefresh = Date.now();
      }
    }, 30000); // 30 seconds

    // Refresh when page becomes visible again (user switches back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastRefresh = Date.now() - lastRefresh;
        // Only refresh if it's been more than 15 seconds
        if (timeSinceLastRefresh > 15000) {
          invalidate('admin:dashboard');
          lastRefresh = Date.now();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  // Visual indicator when data refreshes
  let isRefreshing = false;
  $: if ($page.data !== data) {
    isRefreshing = true;
    setTimeout(() => isRefreshing = false, 300);
  }
</script>

<!-- Add subtle refresh indicator -->
<div class="relative">
  {#if isRefreshing}
    <div class="absolute top-4 right-4 px-3 py-1 bg-blue-100 border border-blue-200 rounded-full text-xs text-blue-700 font-medium animate-fade-in">
      Updated
    </div>
  {/if}

  <!-- Existing dashboard content -->
  <!-- ... -->
</div>
```

```typescript
// src/routes/admin/+page.server.ts - Add dependency tracking
export const load: PageServerLoad = async ({ depends }) => {
  depends('admin:dashboard'); // Mark this route for selective invalidation

  // ... existing code
};
```

**Cost Optimization:**
- ✅ No refresh when tab is hidden (saves ~50% of queries for typical usage)
- ✅ Debounced refresh on tab focus (avoids double-fetch)
- ✅ 30-second interval (reasonable for admin dashboard)

**Expected Cost Impact:**
- Active admin session: ~120 queries/hour (acceptable for admin tool)
- Hidden tab: 0 queries/hour
- Cloudflare Workers: Free tier handles this easily

---

### Phase 3: Customer Search Optimization (Day 3-4)

**Goal:** Instant search without page reloads

#### 3.1 Client-Side Search Navigation

```svelte
<!-- src/routes/admin/customers/+page.svelte - OPTIMIZED -->
<script lang="ts">
  import { goto, invalidate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';

  export let data: PageData;
  export let form;

  let search = data.search;
  let status = data.status;

  // Client-side navigation (no page reload)
  async function handleSearch() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status && status !== 'all') params.set('status', status);

    // Navigate without reload + invalidate data
    await goto(`/admin/customers${params.toString() ? '?' + params.toString() : ''}`, {
      keepFocus: true,
      noScroll: true, // Keep scroll position
      invalidateAll: true // Trigger load function with new params
    });
  }

  // Debounced search (auto-search as user types)
  let searchTimeout: ReturnType<typeof setTimeout>;
  function debouncedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 500);
  }

  // Update URL params when filters change
  $: if (status !== data.status) {
    handleSearch();
  }
</script>

<!-- Add live search -->
<input
  type="text"
  bind:value={search}
  on:input={debouncedSearch}
  placeholder="Search by name, email, or Telegram..."
  class="..."
/>
```

**Performance Gain:**
- Before: Full page reload = 500-1000ms
- After: Client navigation = 50-100ms
- **10x improvement**

#### 3.2 Add Search Result Count Animation

```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';

  // Animate result count when it changes
  let previousCount = data.customers.length;
  $: countChanged = data.customers.length !== previousCount;
  $: if (countChanged) {
    setTimeout(() => previousCount = data.customers.length, 300);
  }
</script>

<div transition:fly={{ y: -5, duration: 200 }}>
  <p class="text-sm text-[#5C5A56] font-medium">
    {data.customers.length} {data.customers.length === 1 ? 'customer' : 'customers'} found
  </p>
</div>
```

---

### Phase 4: Form Actions Without Reload (Day 4-5)

**Goal:** Regenerate QR, send emails, create templates without page reload

#### 4.1 Enhance Form Submissions

```svelte
<!-- src/routes/admin/customers/+page.svelte - Already using enhance! ✅ -->
<form
  id="regenerate-form"
  method="POST"
  action="?/regenerateQR"
  use:enhance={() => {
    isRegenerating = true;
    return async ({ result, update }) => {
      await update(); // SvelteKit handles invalidation
      isRegenerating = false;

      // Show success toast (non-blocking)
      if (result.type === 'success') {
        showSuccessToast('QR code sent!');
      }
    };
  }}
>
```

**Status:** Already implemented correctly ✅
**No changes needed** - using SvelteKit's `enhance` action properly

#### 4.2 Add Toast Notification System

```typescript
// src/lib/stores/toast.ts
import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  return {
    subscribe,
    show: (message: string, type: Toast['type'] = 'success', duration = 3000) => {
      const id = crypto.randomUUID();
      update(toasts => [...toasts, { id, message, type, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          update(toasts => toasts.filter(t => t.id !== id));
        }, duration);
      }

      return id;
    },
    dismiss: (id: string) => {
      update(toasts => toasts.filter(t => t.id !== id));
    }
  };
}

export const toasts = createToastStore();
```

```svelte
<!-- src/routes/admin/+layout.svelte - Add toast container -->
<script lang="ts">
  import { toasts } from '$lib/stores/toast';
  import { fly } from 'svelte/transition';
</script>

<!-- Toast container (fixed position, top-right) -->
<div class="fixed top-4 right-4 z-50 space-y-2">
  {#each $toasts as toast (toast.id)}
    <div
      transition:fly={{ x: 300, duration: 200 }}
      class="px-4 py-3 rounded-sm shadow-xl border-2 max-w-md
        {toast.type === 'success' ? 'bg-[#52A675] border-[#52A675]/70 text-white' : ''}
        {toast.type === 'error' ? 'bg-[#D97F3E] border-[#D97F3E]/70 text-white' : ''}
        {toast.type === 'info' ? 'bg-[#2D9B9B] border-[#2D9B9B]/70 text-white' : ''}"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="font-medium">{toast.message}</p>
        <button
          on:click={() => toasts.dismiss(toast.id)}
          class="text-white hover:text-white/80"
        >
          ✕
        </button>
      </div>
    </div>
  {/each}
</div>
```

#### 4.3 Update Form Handlers to Use Toasts

```svelte
<!-- src/routes/admin/customers/+page.svelte -->
<script lang="ts">
  import { toasts } from '$lib/stores/toast';

  async function regenerateQR() {
    isRegenerating = true;
    showQRConfirm = false;

    const formElement = document.getElementById('regenerate-form') as HTMLFormElement;
    formElement?.requestSubmit();
  }

  // Replace alert() with toast
  $: if (form?.success) {
    isRegenerating = false;
    selectedCustomer = null;
    toasts.show('QR code sent successfully!', 'success');
    setTimeout(() => invalidateAll(), 500);
  } else if (form?.error) {
    isRegenerating = false;
    toasts.show(form.error, 'error', 5000); // Show error for 5 seconds
  }
</script>
```

---

### Phase 5: Email Template Live Preview (Day 5-6)

**Goal:** See HTML output as you type

#### 5.1 Add Preview Pane with Iframe Sandbox

```svelte
<!-- src/routes/admin/emails/+page.svelte - ADD PREVIEW -->
<script lang="ts">
  import { onDestroy } from 'svelte';

  let htmlBody = '';
  let previewHtml = '';
  let previewTimeout: ReturnType<typeof setTimeout>;

  // Debounced preview update (500ms after typing stops)
  function updatePreview() {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
      previewHtml = htmlBody;
    }, 500);
  }

  $: if (htmlBody) updatePreview();

  onDestroy(() => clearTimeout(previewTimeout));
</script>

<div class="grid grid-cols-2 gap-6">
  <!-- Editor (left) -->
  <div>
    <label class="block text-sm font-bold text-[#1A1816] mb-2">
      HTML Body
    </label>
    <textarea
      id="htmlBody"
      name="htmlBody"
      bind:value={htmlBody}
      required
      rows="20"
      class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
    ></textarea>
  </div>

  <!-- Preview (right) -->
  <div>
    <label class="block text-sm font-bold text-[#1A1816] mb-2">
      Live Preview
    </label>
    <div class="border-2 border-[#B8B6B1] rounded-sm bg-white overflow-hidden" style="height: 500px;">
      <iframe
        title="Email preview"
        srcdoc={previewHtml}
        sandbox="allow-same-origin"
        class="w-full h-full"
      />
    </div>
  </div>
</div>
```

**Security:** `sandbox="allow-same-origin"` prevents JavaScript execution in preview

---

### Phase 6: Kiosk Session Optimization (Day 6-7)

**Goal:** Session creation without reload, display session info immediately

#### 6.1 Optimistic UI for Session Creation

```svelte
<!-- src/routes/admin/kiosk/+page.svelte - OPTIMIZED -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toasts } from '$lib/stores/toast';

  let isCreating = false;
  let sessionToken = '';
  let sessionInfo: { kioskId: string; location: string } | null = null;

  // Show session info immediately after creation (no reload needed)
</script>

<form
  method="POST"
  action="?/createSession"
  use:enhance={() => {
    isCreating = true;
    return async ({ result, update }) => {
      isCreating = false;

      if (result.type === 'success' && result.data?.sessionToken) {
        sessionToken = result.data.sessionToken;
        sessionInfo = {
          kioskId: document.querySelector('[name="kioskId"]')?.value || '',
          location: document.querySelector('[name="location"]')?.value || ''
        };
        toasts.show('Kiosk session created!', 'success');

        // Don't call update() - we don't need to reload data
      } else {
        await update(); // Only update on error
        toasts.show('Failed to create session', 'error');
      }
    };
  }}
>
  <!-- Form fields -->
</form>

{#if sessionToken && sessionInfo}
  <div class="mt-6 bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6">
    <h3 class="text-lg font-extrabold mb-4">Session Created</h3>
    <div class="space-y-2 text-sm">
      <p><strong>Kiosk ID:</strong> {sessionInfo.kioskId}</p>
      <p><strong>Location:</strong> {sessionInfo.location}</p>
      <p><strong>Session Token:</strong></p>
      <code class="block p-3 bg-white border border-[#B8B6B1] rounded-sm font-mono text-xs break-all">
        {sessionToken}
      </code>
    </div>
  </div>
{/if}
```

**UX Improvement:** Immediate feedback without reload

---

## Performance Targets

### Metrics to Track

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Dashboard load time | ~500ms | <100ms | Chrome DevTools Network |
| Navigation latency | ~300ms | 0ms | Time to interactive |
| Customer search | ~800ms | <150ms | Input → results displayed |
| Form submission feedback | ~600ms | <50ms | Click → toast shown |
| Database queries/hour (active admin) | ~200 | <150 | Supabase dashboard |

### Cost Impact Analysis

**Current State:**
- Dashboard metrics: 4 queries every 30s = 480 queries/hour
- Activity feed: 10 queries every 30s = 1200 queries/hour
- **Total: ~1680 queries/hour per active admin**

**Optimized State:**
- Dashboard metrics: 4 queries every 30s = 480 queries/hour (unchanged)
- Activity feed: 1 query every 30s = 120 queries/hour (10x reduction)
- Auto-refresh pause when hidden: ~50% reduction
- **Total: ~300 queries/hour per active admin**

**Savings: 82% reduction in database queries**

**Cloudflare Workers Cost:**
- Free tier: 100,000 requests/day
- Admin usage: ~7,200 requests/day (1 admin, 8 hours)
- **Well within free tier ✅**

---

## Implementation Checklist

### Phase 1: Navigation & Preloading
- [ ] Add `data-sveltekit-preload-data="hover"` to all navigation links
- [ ] Add `data-sveltekit-preload-code="eager"` to critical routes
- [ ] Test navigation latency with Network throttling

### Phase 2: Dashboard Real-Time Updates
- [ ] Refactor activity feed to use batch query
- [ ] Add `depends('admin:dashboard')` to load function
- [ ] Implement auto-refresh with visibility detection
- [ ] Add refresh indicator UI
- [ ] Test query count reduction in Supabase dashboard

### Phase 3: Customer Search Optimization
- [ ] Replace `window.location.href` with `goto()`
- [ ] Add debounced search input
- [ ] Add search result count animation
- [ ] Test scroll position preservation

### Phase 4: Form Actions Without Reload
- [ ] Create toast notification system
- [ ] Update all form handlers to use toasts
- [ ] Replace `alert()` calls with toasts
- [ ] Test form submissions across all admin pages

### Phase 5: Email Template Live Preview
- [ ] Add split-pane layout (editor + preview)
- [ ] Implement debounced preview update
- [ ] Add iframe sandbox for preview
- [ ] Test preview rendering with complex HTML

### Phase 6: Kiosk Session Optimization
- [ ] Add optimistic UI for session creation
- [ ] Display session info without reload
- [ ] Test session token display

### Testing & Validation
- [ ] Measure performance metrics before/after
- [ ] Test with Network throttling (Slow 3G)
- [ ] Verify cost impact in Supabase dashboard
- [ ] Test auto-refresh pause when tab is hidden
- [ ] Cross-browser testing (Chrome, Safari, Firefox)

---

## Risk Mitigation

### Risk 1: Auto-refresh causes race conditions
**Mitigation:** Use SvelteKit's `invalidate()` which handles concurrent requests gracefully

### Risk 2: Debounced search feels laggy
**Mitigation:** Show loading spinner during search, keep debounce at 500ms (industry standard)

### Risk 3: Toast notifications overlap
**Mitigation:** Stack toasts vertically with max 3 visible, auto-dismiss oldest

### Risk 4: Preview iframe breaks complex emails
**Mitigation:** Iframe has same rendering engine as email preview, add error boundary

---

## Future Enhancements (Post-MVP)

1. **WebSocket for Real-Time Updates**
   - Replace polling with WebSocket connection
   - Push updates when new redemptions occur
   - Requires Cloudflare Durable Objects or external WebSocket service

2. **Virtual Scrolling for Large Customer Lists**
   - Only render visible rows (1000+ customers)
   - Use `svelte-virtual-list` or custom implementation

3. **Service Worker for Offline Support**
   - Cache dashboard data for offline viewing
   - Queue form submissions when offline

4. **Advanced Search with Filters**
   - Filter by subscription status, dietary flags, redemption history
   - Save search presets

---

## Deployment Checklist

- [ ] Run `pnpm run build` and verify no errors
- [ ] Test optimized app in production mode locally
- [ ] Deploy to staging environment
- [ ] Run Lighthouse audit (target: 90+ performance score)
- [ ] Monitor Cloudflare Workers analytics for 24 hours
- [ ] Monitor Supabase query count for 24 hours
- [ ] Deploy to production
- [ ] Update documentation

---

## Code Standards

### Performance Best Practices

1. **Always use `goto()` instead of `window.location`**
```typescript
// ❌ Bad
window.location.href = '/admin/customers';

// ✅ Good
await goto('/admin/customers', { invalidateAll: true });
```

2. **Batch database queries**
```typescript
// ❌ Bad
for (const item of items) {
  await supabase.from('table').select().eq('id', item.id);
}

// ✅ Good
const ids = items.map(i => i.id);
await supabase.from('table').select().in('id', ids);
```

3. **Debounce expensive operations**
```typescript
let timeout: ReturnType<typeof setTimeout>;
function debouncedUpdate() {
  clearTimeout(timeout);
  timeout = setTimeout(actualUpdate, 500);
}
```

4. **Use `depends()` for selective invalidation**
```typescript
// Instead of invalidateAll() everywhere
export const load: PageServerLoad = async ({ depends }) => {
  depends('resource:specific-key');
  // ...
};

// Then in component:
invalidate('resource:specific-key'); // Only invalidates this route
```

5. **Optimize visibility-based updates**
```typescript
if (document.visibilityState === 'visible') {
  // Only update when user can see the page
}
```

---

## Conclusion

These optimizations will transform the admin app from a traditional multi-page application into a modern SPA with server-side rendering. The key wins:

- **User Experience:** Instant navigation, live updates, no jarring page reloads
- **Performance:** 10x faster page transitions, 82% fewer database queries
- **Cost:** Stays well within Cloudflare Workers free tier
- **Maintainability:** SvelteKit's primitives handle complexity (no custom WebSocket, no complex state management)

The implementation is straightforward because SvelteKit provides all necessary primitives out-of-the-box. No external dependencies required beyond what's already in the project.
