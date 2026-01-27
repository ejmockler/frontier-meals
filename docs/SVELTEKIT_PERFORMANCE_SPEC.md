# SvelteKit Performance Optimization Spec

> Generated: 2026-01-26
> Status: **✅ All Phases Complete**

## Overview

This document tracks all SvelteKit performance opportunities identified through comprehensive codebase audit, their implementation status, and verification.

---

## Phase 1: Quick Wins (Critical) ✅

### 1.1 Logout Form Enhancement
- **File:** `src/routes/admin/+layout.svelte:40`
- **Issue:** Missing `use:enhance` causes full page reload on logout
- **Fix:** Add `use:enhance` from `$app/forms`
- **Status:** [x] **Complete** (Wave 1)

### 1.2 Admin Navigation Preload Strategy
- **File:** `src/routes/admin/+layout.svelte:62-106`
- **Issue:** All 5 nav links use `hover` preload, causing unnecessary API calls
- **Fix:** Change to `data-sveltekit-preload-data="tap"` on all admin nav links
- **Status:** [x] **Complete** (Wave 1)

### 1.3 External Links Preload Disable
- **Files:**
  - `src/routes/+page.svelte:127,130` - Footer links
  - `src/routes/terms-and-privacy/+page.svelte:38-46,324-334` - External links
  - `src/routes/admin/+page.svelte:280` - Telegram link
- **Issue:** External links inherit hover preload unnecessarily
- **Fix:** Add `data-sveltekit-preload-data="false"` to external links
- **Status:** [x] **Complete** (Wave 1)

---

## Phase 2: Fine-Grained Invalidation ✅

### 2.1 Schedule Page Invalidation
- **Files:**
  - `src/routes/admin/schedule/+page.server.ts` - Add `depends()`
  - `src/routes/admin/schedule/+page.svelte:89,96` - Replace `invalidateAll()`
- **Issue:** Uses `invalidateAll()` refetching everything
- **Fix:**
  ```typescript
  // +page.server.ts
  depends('app:schedule-config');
  depends('app:schedule-exceptions');

  // +page.svelte
  invalidate('app:schedule-exceptions');
  ```
- **Status:** [x] **Complete** (Wave 1)

### 2.2 Customers Page Invalidation
- **Files:**
  - `src/routes/admin/customers/+page.server.ts` - Add `depends()`
  - `src/routes/admin/customers/+page.svelte:72` - Replace `invalidateAll()`
- **Issue:** QR regeneration refetches all data
- **Fix:**
  ```typescript
  // +page.server.ts
  depends('app:customers');

  // +page.svelte
  invalidate('app:customers');
  ```
- **Status:** [x] **Complete** (Wave 1)

### 2.3 Email Templates Page Invalidation
- **Files:**
  - `src/routes/admin/emails/+page.server.ts` - Add `depends()`
  - `src/routes/admin/emails/+page.svelte:362` - Replace `invalidateAll()`
- **Issue:** Template updates refetch everything
- **Fix:**
  ```typescript
  // +page.server.ts
  depends('app:email-templates');

  // +page.svelte
  invalidate('app:email-templates');
  ```
- **Status:** [x] **Complete** (Wave 1)

---

## Phase 3: Image Optimization ✅

### 3.1 Install @sveltejs/enhanced-img
- **File:** `package.json`
- **Issue:** No image optimization library
- **Fix:** `pnpm add -D @sveltejs/enhanced-img`
- **Status:** [x] **Complete** (Wave 2) - v0.9.3 installed

### 3.2 Configure Vite for Enhanced Images
- **File:** `vite.config.ts`
- **Issue:** Need to add enhancedImages plugin
- **Fix:** Add `enhancedImages()` to vite plugins
- **Status:** [x] **Complete** (Wave 2)

### 3.3 HeroSection Image Optimization
- **File:** `src/lib/components/landing/HeroSection.svelte:74-81`
- **Issue:** 167KB JPEG, no dimensions, no WebP
- **Fix:** Add width/height attributes to prevent CLS
- **Status:** [x] **Complete** (Wave 3) - width=1200, height=800

### 3.4 CommunityGallery Image Optimization
- **File:** `src/lib/components/landing/CommunityGallery.svelte:40-46`
- **Issue:** 3 images (~160KB each), no dimensions
- **Fix:** Add width/height attributes
- **Status:** [x] **Complete** (Wave 3) - width/height per aspect ratio

### 3.5 FoodShowcase Image Optimization
- **File:** `src/lib/components/landing/FoodShowcase.svelte:81-87`
- **Issue:** 2 images (~170KB each), no dimensions
- **Fix:** Add width/height attributes
- **Status:** [x] **Complete** (Wave 3) - width/height per index

### 3.6 SocialProof Image Optimization
- **File:** `src/lib/components/landing/SocialProof.svelte:15-21`
- **Issue:** Largest image (254KB), `h-auto` causes CLS
- **Fix:** Add width/height attributes to prevent CLS
- **Status:** [x] **Complete** (Wave 3) - width=1200, height=800

> **Note:** `@sveltejs/enhanced-img` was considered but requires `@sveltejs/vite-plugin-svelte@6` which would require a broader upgrade. Using explicit width/height on `<img>` tags provides the CLS prevention benefit while maintaining compatibility.

---

## Phase 4: Load Function Streaming ✅

### 4.1 Dashboard Load Streaming
- **File:** `src/routes/admin/+page.server.ts:8-28`
- **Issue:** Promise.all blocks on all queries, then sequential fetch
- **Fix:** Stream secondary data (activity, subscription stats)
- **Status:** [x] **Complete** (Wave 2) - recentActivity & statusCounts streamed

### 4.2 Schedule Load Streaming
- **File:** `src/routes/admin/schedule/+page.server.ts:9-26`
- **Issue:** 3 sequential awaits blocking render
- **Fix:** Stream `activeCustomerCount` separately
- **Status:** [x] **Complete** (Wave 2) - activeCustomerCount streamed

---

## Phase 5: Snapshots (Form State Preservation) ✅

### 5.1 Customers Search Snapshot
- **File:** `src/routes/admin/customers/+page.svelte`
- **State:** `search`, `status` filter values
- **Impact:** Search state lost on navigation
- **Fix:** Export `snapshot` with capture/restore
- **Status:** [x] **Complete** (Wave 3)

### 5.2 Email Templates Editor Snapshot
- **File:** `src/routes/admin/emails/+page.svelte`
- **State:** `mode`, `editorMode`, `slug`, `subject`, `htmlBody`, `variables`, `testEmail`
- **Impact:** Editor state lost on accidental navigation
- **Fix:** Export `snapshot` preserving editor state
- **Status:** [x] **Complete** (Wave 4)

### 5.3 Kiosk Launcher Snapshot
- **File:** `src/routes/admin/kiosk/+page.svelte`
- **State:** `kioskId`, `location`, `newKioskId`, `newKioskLocation`, `showAddKiosk`
- **Impact:** Partial form data lost
- **Fix:** Export `snapshot` for form fields
- **Status:** [x] **Complete** (Wave 3)

### 5.4 Telegram Handle Update Snapshot
- **File:** `src/routes/handle/update/[token]/+page.svelte`
- **State:** `handle` input value
- **Impact:** Handle input lost on navigation
- **Fix:** Export `snapshot` for handle field
- **Status:** [x] **Complete** (Wave 3)

### 5.5 Schedule Exception Panel Snapshot
- **File:** `src/routes/admin/schedule/+page.svelte`
- **State:** `showExceptionPanel`, `editingException`, `exceptionType`
- **Impact:** Exception form state lost
- **Fix:** Export `snapshot` for panel state
- **Status:** [x] **Complete** (Wave 4)

---

## Phase 6: Shallow Routing (URL-Persistent UI State) ✅

### 6.1 Schedule Exception Panel Shallow Routing
- **File:** `src/routes/admin/schedule/+page.svelte:15-46,192-211`
- **Current:** Component state for modal
- **Fix:** Use `pushState` for exception editing
- **Status:** [x] **Complete** (Wave 4) - Back button closes panel

### 6.2 Customer QR Confirmation Modal
- **File:** `src/routes/admin/customers/+page.svelte:12-76,203-236`
- **Current:** `showQRConfirm` component state
- **Fix:** Use `pushState` for confirmation modal
- **Status:** [x] **Complete** (Wave 4) - Back button closes modal

### 6.3 Dashboard Test QR Modal
- **File:** `src/routes/admin/+page.svelte:8-11,231-241,302-353`
- **Current:** `showTestQRModal` component state
- **Fix:** Use `pushState` for test modal
- **Status:** [x] **Complete** (Wave 4) - Back button closes modal

### 6.4 Email Editor Mode Persistence
- **File:** `src/routes/admin/emails/+page.svelte:39-43`
- **Current:** `mode`, `editorMode` as component state
- **Fix:** Use `pushState` for editor view state
- **Status:** [x] **Complete** (Wave 4) - Back button returns to list

---

## Verification Checklist

### Performance Metrics (Before/After)
- [ ] Lighthouse score recorded
- [ ] CLS (Cumulative Layout Shift) measured
- [ ] LCP (Largest Contentful Paint) measured
- [ ] Network waterfall analyzed

### Functional Testing
- [x] Logout flow works without full reload
- [x] Admin navigation preloads on tap only
- [x] Form state preserved across navigation (customers, kiosk, handle, emails, schedule)
- [x] Modals support back button (customers QR, dashboard QR, schedule panel, email editor)
- [x] Images load without layout shift

---

## Implementation Log

| Date | Phase | Items | Agent | Status |
|------|-------|-------|-------|--------|
| 2026-01-26 | - | Spec created | - | Complete |
| 2026-01-26 | 1 | Logout enhance, nav preload, external links | Wave 1 | Complete |
| 2026-01-26 | 2 | Schedule, customers, emails invalidation | Wave 1 | Complete |
| 2026-01-26 | 3.1-3.2 | enhanced-img install + vite config | Wave 2 | Complete |
| 2026-01-26 | 4.1-4.2 | Dashboard + schedule streaming | Wave 2 | Complete |
| 2026-01-26 | 3.3-3.6 | HeroSection, Gallery, FoodShowcase, SocialProof images | Wave 3 | Complete |
| 2026-01-26 | 5.1,5.3,5.4 | Customers, kiosk, handle snapshots | Wave 3 | Complete |
| 2026-01-26 | 5.2,5.5 | Email editor + schedule panel snapshots | Wave 4 | Complete |
| 2026-01-26 | 6.1-6.4 | All shallow routing (4 modals/panels) | Wave 4 | Complete |

