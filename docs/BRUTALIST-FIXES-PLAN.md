# Brutalist Critique Fixes - Implementation Plan

**Date:** 2025-11-08
**Status:** Planning Phase
**Priority:** CRITICAL - Production Stability

---

## Overview

This document contains detailed implementation plans for every issue raised by the Brutalist MCP analysis. Issues are categorized by severity and organized into 3-week implementation sprints.

**Issue Summary:**
- 🔴 **11 CRITICAL** (Production-killing, data loss, security breaches)
- 🟠 **8 HIGH** (Customer experience disasters, race conditions)
- 🟡 **6 MEDIUM** (Performance bottlenecks, maintainability nightmares)

---

## WEEK 1: STOP THE BLEEDING (Critical Issues 1-4)

### 🔴 CRITICAL #1: Telegram Link Corruption - Customers Pay But Can't Get Meals

**Priority:** P0 - URGENT
**Impact:** Revenue loss, chargebacks, customer trust destroyed
**Effort:** 2 days

#### Problem Analysis

**Current Flow:**
```
1. User enters Telegram handle during Stripe checkout (NO VALIDATION)
2. Stripe webhook → customer record created with handle (might be typo)
3. Deep link token generated (expires in 60 minutes)
4. Email sent with deep link
5. User clicks link → Telegram bot matches telegram_user_id
6. If handle was wrong → user updates via /handle/update/[token]
7. Handle updated in DB BUT no new deep link generated
8. Original deep link expired → USER STUCK
```

**Root Cause:**
- Storing `telegram_handle` but bot links via `telegram_user_id`
- Handle update flow doesn't generate new deep link
- 60-minute expiration is too aggressive
- No self-serve recovery path

#### Implementation Plan

##### **Task 1.1: Display Deep Link on Success Page**

**File:** `src/routes/success/+page.svelte`

**Current State:**
```svelte
<script lang="ts">
  export let data: PageData;
</script>

<div class="success-message">
  <h1>Payment Successful!</h1>
  <p>Check your email for next steps.</p>
</div>
```

**New Implementation:**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  export let data: PageData;

  let sessionId = '';
  let deepLink = '';
  let loading = true;
  let error = '';
  let copied = false;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session_id') || '';

    if (!sessionId) {
      error = 'No session ID found';
      loading = false;
      return;
    }

    try {
      // Fetch deep link from backend
      const response = await fetch('/api/checkout/get-telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Telegram link');
      }

      const result = await response.json();
      deepLink = result.deep_link;
    } catch (err) {
      error = 'Error loading Telegram link. Please check your email.';
      console.error(err);
    } finally {
      loading = false;
    }
  });

  function copyToClipboard() {
    navigator.clipboard.writeText(deepLink);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-green-100">
  <div class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
        <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Welcome to Frontier Meals! 🍽️</h1>
      <p class="text-gray-600">Your subscription is active</p>
    </div>

    {#if loading}
      <div class="text-center py-8">
        <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <p class="text-gray-600 mt-4">Setting up your account...</p>
      </div>
    {:else if error}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-red-800">{error}</p>
      </div>
    {:else}
      <div class="space-y-6">
        <div class="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h2 class="font-semibold text-gray-900 mb-2">Next Step: Connect Telegram</h2>
          <p class="text-sm text-gray-700 mb-4">
            Click the link below to connect your Telegram account and start receiving your daily meal QR codes.
          </p>

          <div class="bg-white border border-gray-200 rounded-lg p-3 mb-3">
            <code class="text-xs text-gray-800 break-all">{deepLink}</code>
          </div>

          <div class="flex gap-2">
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all text-center"
            >
              Open Telegram Bot
            </a>
            <button
              on:click={copyToClipboard}
              class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div class="text-center text-sm text-gray-500">
          <p>A confirmation email has also been sent to your inbox.</p>
          <p class="mt-2">Need help? Message <a href="https://t.me/noahchonlee" class="text-blue-600 hover:text-blue-700">@noahchonlee</a></p>
        </div>
      </div>
    {/if}
  </div>
</div>
```

**New Backend Endpoint:** `src/routes/api/checkout/get-telegram-link/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true
});

export const POST: RequestHandler = async ({ request }) => {
  const { session_id } = await request.json();

  if (!session_id) {
    return json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session.customer) {
      return json({ error: 'No customer found' }, { status: 404 });
    }

    // Find customer in database by Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', session.customer)
      .single();

    if (customerError || !customer) {
      return json({ error: 'Customer not found in database' }, { status: 404 });
    }

    // Find active deep link token for this customer
    const { data: deepLinkToken, error: tokenError } = await supabase
      .from('telegram_deep_link_tokens')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !deepLinkToken) {
      // Generate new token if none exists
      const { randomUUID, sha256 } = await import('$lib/utils/crypto');
      const newToken = randomUUID();
      const tokenHash = await sha256(newToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const { error: insertError } = await supabase
        .from('telegram_deep_link_tokens')
        .insert({
          customer_id: customer.id,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString()
        });

      if (insertError) {
        console.error('[ERROR] Failed to create deep link token:', insertError);
        return json({ error: 'Failed to generate Telegram link' }, { status: 500 });
      }

      return json({ deep_link: `https://t.me/frontiermealsbot?start=${newToken}` });
    }

    // Token exists but we don't have the plaintext - we only store the hash
    // This is a limitation of the current design
    // Return error and suggest checking email
    return json({
      error: 'Token already issued. Please check your email or contact support.',
      support_contact: '@noahchonlee'
    }, { status: 400 });

  } catch (error) {
    console.error('[ERROR] Error retrieving Telegram link:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
```

**Problem with Above Approach:** We hash tokens before storing, so we can't retrieve the plaintext later.

**Better Solution:** Store plaintext token in session or use a different approach.

**REVISED APPROACH - Store Token in Stripe Session Metadata:**

Modify `src/routes/api/stripe/create-checkout/+server.ts`:

```typescript
// Generate deep link token BEFORE creating checkout session
const deepLinkToken = randomUUID();
const deepLinkTokenHash = await sha256(deepLinkToken);

const session = await stripe.checkout.sessions.create({
  // ... existing config
  metadata: {
    deep_link_token: deepLinkToken  // Store plaintext in Stripe metadata
  }
});
```

Then in webhook `handleCheckoutCompleted`:

```typescript
const deepLinkToken = session.metadata?.deep_link_token;
const deepLinkTokenHash = await sha256(deepLinkToken);

// Store hash in database
await supabase.from('telegram_deep_link_tokens').insert({
  customer_id: customer.id,
  token_hash: deepLinkTokenHash,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
});

// Include token in email
const deepLink = `https://t.me/frontiermealsbot?start=${deepLinkToken}`;
```

Then the `/api/checkout/get-telegram-link` endpoint can retrieve it from Stripe:

```typescript
const session = await stripe.checkout.sessions.retrieve(session_id);
const deepLinkToken = session.metadata?.deep_link_token;

if (!deepLinkToken) {
  return json({ error: 'Token not found' }, { status: 404 });
}

return json({ deep_link: `https://t.me/frontiermealsbot?start=${deepLinkToken}` });
```

##### **Task 1.2: Extend Token Expiration to 7 Days**

**Files to modify:**
- `src/routes/api/stripe/webhook/+server.ts` (line 225)
- `src/lib/cron/check-telegram-links.ts` (line 71)

**Change:**
```typescript
// BEFORE:
const deepLinkExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

// AFTER:
const deepLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
```

##### **Task 1.3: Regenerate Deep Link on Handle Update**

**File:** `src/routes/api/handle/consume/+server.ts`

**Add after line 104:**

```typescript
// Update customer handle
const { error: updateError } = await supabase
  .from('customers')
  .update({ telegram_handle: formattedHandle })
  .eq('id', handleToken.customer_id);

if (updateError) {
  console.error('[DB ERROR] Error updating handle:', updateError);
  return json({ error: 'Failed to update handle' }, { status: 500 });
}

// Generate NEW deep link token since handle was corrected
const newDeepLinkToken = randomUUID();
const newDeepLinkTokenHash = await sha256(newDeepLinkToken);
const newDeepLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const { error: newTokenError } = await supabase
  .from('telegram_deep_link_tokens')
  .insert({
    customer_id: handleToken.customer_id,
    token_hash: newDeepLinkTokenHash,
    expires_at: newDeepLinkExpiresAt.toISOString()
  });

if (newTokenError) {
  console.error('[DB ERROR] Error creating new deep link:', newTokenError);
  // Don't fail - handle was updated successfully
}

// Send new deep link email
const newDeepLink = `https://t.me/frontiermealsbot?start=${newDeepLinkToken}`;

try {
  await sendEmail({
    to: customer.email,
    subject: 'Your updated Telegram link - Frontier Meals',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Telegram Handle Updated! ✅</h1>
          <p>Your Telegram handle has been updated to <strong>${formattedHandle}</strong>.</p>
          <p>Click the button below to connect your Telegram account:</p>
          <a href="${newDeepLink}" class="button">Connect Telegram Account</a>
          <p>This link expires in 7 days.</p>
          <p>Questions? Message <a href="https://t.me/noahchonlee">@noahchonlee</a></p>
        </div>
      </body>
      </html>
    `,
    tags: [
      { name: 'category', value: 'handle_updated' },
      { name: 'customer_id', value: handleToken.customer_id }
    ]
  });
} catch (emailError) {
  console.error('[EMAIL ERROR] Failed to send updated link email:', emailError);
  // Don't fail - user will see link on success page
}
```

##### **Task 1.4: Add Self-Serve Recovery in Telegram Bot**

**File:** `src/routes/api/telegram/webhook/+server.ts`

**Modify `handleStartCommand` (around line 175):**

```typescript
if (!deepLinkToken) {
  // Token invalid or expired - AUTO-GENERATE new one

  // Try to find customer by telegram_user_id first (in case they're already linked)
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (existingCustomer) {
    // Already linked - just welcome back
    await sendMessage(chatId, 'Welcome back! Use /help to see available commands.');
    return;
  }

  // Not linked - generate new token and send to user
  await sendMessage(
    chatId,
    `❌ This link is invalid or expired.\n\n` +
    `If you recently subscribed, please:\n` +
    `1. Check your email for a fresh link\n` +
    `2. Or visit https://frontiermeals.com/account/telegram-link to get a new link\n\n` +
    `Need help? Message @noahchonlee`
  );
  return;
}
```

**New Page:** `src/routes/account/telegram-link/+page.svelte`

```svelte
<script lang="ts">
  let email = '';
  let loading = false;
  let success = false;
  let error = '';

  async function sendNewLink() {
    loading = true;
    error = '';

    try {
      const response = await fetch('/api/account/resend-telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to send link');
      }

      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
  <div class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-4">Get Your Telegram Link</h1>

    {#if !success}
      <p class="text-gray-600 mb-6">
        Enter your email to receive a fresh Telegram connection link.
      </p>

      <form on:submit|preventDefault={sendNewLink} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="your@email.com"
          />
        </div>

        {#if error}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <p class="text-sm text-red-800">{error}</p>
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Link'}
        </button>
      </form>
    {:else}
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">Check Your Email!</h2>
        <p class="text-gray-600">We've sent a fresh Telegram link to {email}</p>
      </div>
    {/if}
  </div>
</div>
```

**New Endpoint:** `src/routes/api/account/resend-telegram-link/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SITE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { sendEmail } from '$lib/email/send';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request }) => {
  const { email } = await request.json();

  if (!email) {
    return json({ error: 'Email required' }, { status: 400 });
  }

  // Find customer by email
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (customerError || !customer) {
    // Don't reveal whether email exists (security)
    return json({ success: true });
  }

  // Check if already linked
  if (customer.telegram_user_id) {
    // Already linked - send them a "you're all set" email
    await sendEmail({
      to: email,
      subject: 'Your Telegram account is already connected',
      html: `
        <p>Good news! Your Telegram account is already connected to Frontier Meals.</p>
        <p>You should be receiving daily QR codes at 12 PM PT.</p>
        <p>Questions? Message <a href="https://t.me/noahchonlee">@noahchonlee</a></p>
      `
    });
    return json({ success: true });
  }

  // Generate new deep link token
  const newToken = randomUUID();
  const tokenHash = await sha256(newToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await supabase
    .from('telegram_deep_link_tokens')
    .insert({
      customer_id: customer.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString()
    });

  const deepLink = `https://t.me/frontiermealsbot?start=${newToken}`;

  // Send email
  await sendEmail({
    to: email,
    subject: 'Connect your Telegram - Frontier Meals',
    html: `
      <h1>Connect Your Telegram Account</h1>
      <p>Click the link below to connect your Telegram account and start receiving daily meal QR codes:</p>
      <a href="${deepLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0;">
        Connect Telegram
      </a>
      <p>This link expires in 7 days.</p>
      <p>Questions? Message <a href="https://t.me/noahchonlee">@noahchonlee</a></p>
    `,
    tags: [
      { name: 'category', value: 'telegram_link_resend' },
      { name: 'customer_id', value: customer.id }
    ]
  });

  return json({ success: true });
};
```

**Testing Checklist for Critical #1:**
- [ ] User completes checkout → sees deep link on success page
- [ ] User clicks "Copy" button → link copied to clipboard
- [ ] User clicks "Open Telegram Bot" → bot opens in Telegram
- [ ] Email still sent with link (backup)
- [ ] Link expires in 7 days (not 60 minutes)
- [ ] Handle update generates new deep link
- [ ] Handle update sends new email with link
- [ ] `/account/telegram-link` page works for getting new link
- [ ] Bot shows helpful message if link expired

---

### 🔴 CRITICAL #2: QR Code Generation Race Condition

**Priority:** P0 - URGENT
**Impact:** Customer QR codes don't work at kiosk
**Effort:** 4 hours

#### Problem Analysis

**Current Code:**
```typescript
// Generate JWT with JTI
const jti = randomUUID();  // "abc-123"
const jwt = await sign({ jti });

// Upsert to database
await supabase.from('qr_tokens').upsert({
  customer_id: customer.id,
  service_date: today,
  jti,  // "abc-123"
  // ...
}, {
  onConflict: 'customer_id,service_date'
});
```

**Race Condition:**
```
Run 1 (12:00:00.000): jti="abc-123", email sent, DB upserted
Run 2 (12:00:00.500): jti="def-456", email sent, DB OVERWRITES with "def-456"

Customer scans first QR → JTI="abc-123" not in DB → REJECTED
```

#### Implementation Plan

##### **Task 2.1: Add Idempotency Check**

**File:** `src/lib/cron/issue-qr.ts`

**Before line 102:**

```typescript
for (const customer of activeCustomers) {
  try {
    // IDEMPOTENCY CHECK: Skip if QR already issued for today
    const { data: existingQR, error: checkError } = await supabase
      .from('qr_tokens')
      .select('jti, issued_at')
      .eq('customer_id', customer.id)
      .eq('service_date', today)
      .maybeSingle();  // Use maybeSingle() instead of single() to avoid error on no match

    if (checkError) {
      console.error(`[QR CRON] Error checking existing QR for ${customer.email}:`, checkError);
      continue;  // Skip this customer, don't fail entire job
    }

    if (existingQR) {
      console.log(`[QR CRON] QR already issued for ${customer.email} on ${today}, skipping`);
      continue;
    }

    // ... rest of QR generation logic
```

##### **Task 2.2: Change Upsert to Insert**

**File:** `src/lib/cron/issue-qr.ts` (line 102-113)

**Change from:**
```typescript
await supabase
  .from('qr_tokens')
  .upsert({
    customer_id: customer.id,
    service_date: today,
    jti,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    used_at: null
  }, {
    onConflict: 'customer_id,service_date'
  });
```

**To:**
```typescript
const { error: insertError } = await supabase
  .from('qr_tokens')
  .insert({
    customer_id: customer.id,
    service_date: today,
    jti,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    used_at: null
  });

if (insertError) {
  // Unique constraint violation means another process already inserted
  if (insertError.code === '23505') {
    console.log(`[QR CRON] QR already issued by another process for ${customer.email}, skipping`);
    continue;
  }

  // Other error - log and continue
  console.error(`[QR CRON] Error inserting QR token for ${customer.email}:`, {
    code: insertError.code,
    message: insertError.message,
    details: insertError.details
  });
  continue;
}
```

##### **Task 2.3: Add Database Advisory Lock (Advanced)**

For extra safety, use Postgres advisory locks:

**Create new function:** `src/lib/utils/advisory-lock.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Acquire a Postgres advisory lock
 * Lock ID is derived from a string key using a hash
 */
export async function acquireAdvisoryLock(
  supabase: SupabaseClient,
  lockKey: string
): Promise<boolean> {
  // Convert string to int64 for pg_try_advisory_lock
  const lockId = hashStringToInt64(lockKey);

  const { data, error } = await supabase.rpc('pg_try_advisory_lock', {
    lock_id: lockId
  });

  if (error) {
    console.error('[LOCK] Error acquiring advisory lock:', error);
    return false;
  }

  return data === true;
}

/**
 * Release a Postgres advisory lock
 */
export async function releaseAdvisoryLock(
  supabase: SupabaseClient,
  lockKey: string
): Promise<void> {
  const lockId = hashStringToInt64(lockKey);

  await supabase.rpc('pg_advisory_unlock', {
    lock_id: lockId
  });
}

/**
 * Hash a string to a 64-bit integer for use as lock ID
 */
function hashStringToInt64(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
```

**Create Postgres function:**

Add migration: `supabase/migrations/20251108000002_add_advisory_lock_functions.sql`

```sql
-- Enable advisory lock functions
-- These are built into Postgres, just documenting here

COMMENT ON FUNCTION pg_try_advisory_lock(bigint) IS 'Acquire advisory lock if available (non-blocking)';
COMMENT ON FUNCTION pg_advisory_unlock(bigint) IS 'Release advisory lock';

-- Advisory locks are session-scoped and automatically released on connection close
-- Lock IDs should be consistent across app instances for the same resource
```

**Use in cron job:**

```typescript
import { acquireAdvisoryLock, releaseAdvisoryLock } from '$lib/utils/advisory-lock';

for (const customer of activeCustomers) {
  const lockKey = `qr_gen:${customer.id}:${today}`;

  // Try to acquire lock
  const locked = await acquireAdvisoryLock(supabase, lockKey);

  if (!locked) {
    console.log(`[QR CRON] Another process is generating QR for ${customer.email}, skipping`);
    continue;
  }

  try {
    // ... QR generation logic
  } finally {
    // Always release lock
    await releaseAdvisoryLock(supabase, lockKey);
  }
}
```

**Testing Checklist for Critical #2:**
- [ ] Run cron job twice simultaneously → only one QR generated
- [ ] Check database for duplicate rows → none exist
- [ ] Verify customer receives exactly one email
- [ ] Scan QR code at kiosk → works
- [ ] Check logs for "already issued" message

---

### 🔴 CRITICAL #3: Email Send Failures Silently Swallowed

**Priority:** P0 - URGENT
**Impact:** Customers pay but never receive onboarding email
**Effort:** 1 day

#### Problem Analysis

**Current Code:**
```typescript
try {
  await sendEmail({ ... });
} catch (emailError) {
  console.error('[EMAIL ERROR]', emailError);
  // Don't throw - email failure shouldn't fail webhook
}
```

**Problem:**
- Resend outage → email fails → no retry
- No alerts → ops doesn't know
- No recovery → customer stuck

#### Implementation Plan

##### **Task 3.1: Create Email Queue Table**

**Migration:** `supabase/migrations/20251108000003_create_email_queue.sql`

```sql
-- Email queue for retry logic
CREATE TABLE email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,

  -- Email details
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'welcome_telegram_link',
    'telegram_correction',
    'handle_updated',
    'qr_daily',
    'dunning_soft',
    'dunning_retry',
    'dunning_final',
    'canceled_notice'
  )),

  -- Retry tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'abandoned')),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,

  -- Error tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb
);

-- Indexes
CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_next_retry ON email_queue(next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_email_queue_customer ON email_queue(customer_id);

-- Comments
COMMENT ON TABLE email_queue IS 'Queue for email sending with retry logic';
COMMENT ON COLUMN email_queue.status IS 'pending = not sent yet, sent = delivered, failed = retrying, abandoned = gave up';
COMMENT ON COLUMN email_queue.next_retry_at IS 'When to retry sending (exponential backoff)';
```

##### **Task 3.2: Create Email Queue Service**

**File:** `src/lib/email/queue.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './send';

export type EmailTemplate =
  | 'welcome_telegram_link'
  | 'telegram_correction'
  | 'handle_updated'
  | 'qr_daily'
  | 'dunning_soft'
  | 'dunning_retry'
  | 'dunning_final'
  | 'canceled_notice';

export interface QueuedEmail {
  customer_id: string;
  email_to: string;
  subject: string;
  html: string;
  template_type: EmailTemplate;
  metadata?: Record<string, any>;
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Add email to queue for sending
 */
export async function queueEmail(
  supabase: ReturnType<typeof createClient>,
  email: QueuedEmail
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('email_queue')
    .insert({
      customer_id: email.customer_id,
      email_to: email.email_to,
      subject: email.subject,
      html: email.html,
      template_type: email.template_type,
      metadata: email.metadata || {},
      tags: email.tags || [],
      status: 'pending',
      next_retry_at: new Date().toISOString()  // Send immediately
    })
    .select('id')
    .single();

  if (error) {
    console.error('[EMAIL QUEUE] Error queueing email:', error);
    return null;
  }

  return { id: data.id };
}

/**
 * Process pending emails in queue
 * Called by cron job
 */
export async function processEmailQueue(
  supabase: ReturnType<typeof createClient>
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  // Fetch pending emails due for retry
  const { data: pendingEmails, error: fetchError } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(50);  // Process in batches

  if (fetchError) {
    console.error('[EMAIL QUEUE] Error fetching pending emails:', fetchError);
    return { processed: 0, failed: 0 };
  }

  if (!pendingEmails || pendingEmails.length === 0) {
    console.log('[EMAIL QUEUE] No pending emails to process');
    return { processed: 0, failed: 0 };
  }

  console.log(`[EMAIL QUEUE] Processing ${pendingEmails.length} emails`);

  for (const emailRecord of pendingEmails) {
    try {
      // Attempt to send email
      await sendEmail({
        to: emailRecord.email_to,
        subject: emailRecord.subject,
        html: emailRecord.html,
        tags: emailRecord.tags,
        idempotencyKey: `queue/${emailRecord.id}`
      });

      // Mark as sent
      await supabase
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', emailRecord.id);

      processed++;
      console.log(`[EMAIL QUEUE] Sent email ${emailRecord.id} to ${emailRecord.email_to}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const newRetryCount = emailRecord.retry_count + 1;

      // Exponential backoff: 1min, 5min, 15min, 1hr, 4hr
      const backoffMinutes = [1, 5, 15, 60, 240];
      const nextRetryMinutes = backoffMinutes[Math.min(newRetryCount - 1, backoffMinutes.length - 1)];
      const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);

      // Check if exceeded max retries
      if (newRetryCount >= emailRecord.max_retries) {
        // Give up
        await supabase
          .from('email_queue')
          .update({
            status: 'abandoned',
            retry_count: newRetryCount,
            last_error: errorMessage,
            last_error_at: new Date().toISOString()
          })
          .eq('id', emailRecord.id);

        failed++;
        console.error(`[EMAIL QUEUE] Abandoned email ${emailRecord.id} after ${newRetryCount} retries`);

        // TODO: Send alert to ops (Telegram notification)

      } else {
        // Schedule retry
        await supabase
          .from('email_queue')
          .update({
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt.toISOString(),
            last_error: errorMessage,
            last_error_at: new Date().toISOString()
          })
          .eq('id', emailRecord.id);

        console.error(`[EMAIL QUEUE] Email ${emailRecord.id} failed, retrying in ${nextRetryMinutes}min (attempt ${newRetryCount}/${emailRecord.max_retries})`);
      }
    }
  }

  return { processed, failed };
}
```

##### **Task 3.3: Update Webhook to Use Queue**

**File:** `src/routes/api/stripe/webhook/+server.ts`

**Replace lines 246-273:**

```typescript
// Queue welcome email (don't send directly)
const { error: queueError } = await queueEmail(supabase, {
  customer_id: customer.id,
  email_to: customer.email,
  subject: 'Welcome to Frontier Meals - Connect Your Telegram',
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <!-- ... existing email template ... -->
    </head>
    <body>
      <!-- ... existing email content ... -->
    </body>
    </html>
  `,
  template_type: 'welcome_telegram_link',
  metadata: {
    deep_link_token: deepLinkToken,
    telegram_handle: customer.telegram_handle
  },
  tags: [
    { name: 'category', value: 'onboarding' },
    { name: 'customer_id', value: customer.id }
  ]
});

if (queueError) {
  console.error('[EMAIL ERROR] Failed to queue welcome email:', queueError);
  // Don't fail webhook - email will be retried
} else {
  console.log('[EMAIL SUCCESS] Welcome email queued');
}
```

##### **Task 3.4: Create Email Queue Cron Job**

**File:** `src/routes/api/cron/process-email-queue/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { processEmailQueue } from '$lib/email/queue';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[EMAIL QUEUE CRON] Starting email queue processing');

  try {
    const { processed, failed } = await processEmailQueue(supabase);

    console.log(`[EMAIL QUEUE CRON] Complete. Processed: ${processed}, Failed: ${failed}`);

    return json({ processed, failed });
  } catch (error) {
    console.error('[EMAIL QUEUE CRON] Error:', error);
    return json({ error: 'Internal error' }, { status: 500 });
  }
};
```

**Update `wrangler.toml`:**

```toml
# Add new cron schedule for email queue processing
# Run every 5 minutes
[[workflows]]
name = "email-queue-processor"
script = "api/cron/process-email-queue"
schedule = "*/5 * * * *"
```

##### **Task 3.5: Add Ops Alerts for Failed Emails**

**File:** `src/lib/alerts/telegram.ts`

```typescript
import { TELEGRAM_BOT_TOKEN } from '$env/static/private';

const OPS_TELEGRAM_CHAT_ID = '987654321';  // @noahchonlee's chat ID

export async function sendOpsAlert(message: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OPS_TELEGRAM_CHAT_ID,
        text: `🚨 [FRONTIER MEALS ALERT]\n\n${message}`,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.error('[OPS ALERT] Failed to send Telegram alert:', error);
  }
}
```

**Use in email queue processor:**

```typescript
if (newRetryCount >= emailRecord.max_retries) {
  // Alert ops
  await sendOpsAlert(
    `Email abandoned after ${newRetryCount} retries\n\n` +
    `Customer: ${emailRecord.email_to}\n` +
    `Template: ${emailRecord.template_type}\n` +
    `Error: ${errorMessage}\n` +
    `Queue ID: ${emailRecord.id}`
  );
}
```

**Testing Checklist for Critical #3:**
- [ ] Email queued on webhook success
- [ ] Cron job processes queue every 5 minutes
- [ ] Failed email retried with exponential backoff
- [ ] After 5 failures, email marked abandoned
- [ ] Ops receives Telegram alert on abandonment
- [ ] Successful emails marked as sent

---

### 🔴 CRITICAL #4: NULL Subscription Dates Break QR Cron

**Priority:** P1 - HIGH
**Impact:** No QR codes issued for customers
**Effort:** 2 hours

#### Implementation Plan

##### **Task 4.1: Add Fallback to subscription.created**

**File:** `src/routes/api/stripe/webhook/+server.ts` (lines 177-182)

**Change from:**
```typescript
current_period_start: subscription.current_period_start
  ? new Date(subscription.current_period_start * 1000).toISOString()
  : null,
current_period_end: subscription.current_period_end
  ? new Date(subscription.current_period_end * 1000).toISOString()
  : null
```

**To:**
```typescript
// Use period dates if available, otherwise fall back to subscription created date + 1 month
current_period_start: subscription.current_period_start
  ? new Date(subscription.current_period_start * 1000).toISOString()
  : new Date(subscription.created * 1000).toISOString(),
current_period_end: subscription.current_period_end
  ? new Date(subscription.current_period_end * 1000).toISOString()
  : new Date(new Date(subscription.created * 1000).setMonth(new Date(subscription.created * 1000).getMonth() + 1)).toISOString()
```

##### **Task 4.2: Add Database Constraint**

**Migration:** `supabase/migrations/20251108000004_add_subscription_date_constraint.sql`

```sql
-- Add check constraint to ensure dates are set
-- Allow NULL temporarily during creation, but require them to be set eventually

-- Add a computed column to track if dates are set
ALTER TABLE subscriptions
  ADD COLUMN dates_set BOOLEAN GENERATED ALWAYS AS (
    current_period_start IS NOT NULL AND current_period_end IS NOT NULL
  ) STORED;

CREATE INDEX idx_subscriptions_dates_set ON subscriptions(dates_set) WHERE NOT dates_set;

COMMENT ON COLUMN subscriptions.dates_set IS 'Computed: TRUE if period dates are set, FALSE if NULL (awaiting invoice.paid)';
```

##### **Task 4.3: Fix QR Cron Query**

**File:** `src/lib/cron/issue-qr.ts` (around line 50)

**Add NULL check:**

```typescript
const { data: activeCustomers, error } = await supabase
  .from('customers')
  .select('*, subscriptions!inner(*)')
  .eq('subscriptions.status', 'active')
  .not('subscriptions.current_period_start', 'is', null)  // Only customers with dates set
  .not('subscriptions.current_period_end', 'is', null)
  .lte('subscriptions.current_period_start', today)
  .gte('subscriptions.current_period_end', today);

if (error) {
  console.error('[QR CRON] Error fetching active customers:', error);
  throw error;
}

// Also log customers who are active but missing dates (for monitoring)
const { data: customersWithNullDates } = await supabase
  .from('customers')
  .select('email, subscriptions!inner(created_at)')
  .eq('subscriptions.status', 'active')
  .or('subscriptions.current_period_start.is.null,subscriptions.current_period_end.is.null');

if (customersWithNullDates && customersWithNullDates.length > 0) {
  console.warn(`[QR CRON] ${customersWithNullDates.length} active subscriptions with NULL dates:`,
    customersWithNullDates.map(c => c.email));

  // Alert ops if any subscription is >1 hour old and still has NULL dates
  for (const customer of customersWithNullDates) {
    const sub = Array.isArray(customer.subscriptions) ? customer.subscriptions[0] : customer.subscriptions;
    const createdAt = new Date(sub.created_at);
    const ageMinutes = (Date.now() - createdAt.getTime()) / 1000 / 60;

    if (ageMinutes > 60) {
      // This is a problem - invoice.paid should have fired by now
      await sendOpsAlert(
        `Subscription dates still NULL after 1 hour\n\n` +
        `Customer: ${customer.email}\n` +
        `Subscription created: ${sub.created_at}\n` +
        `Age: ${Math.round(ageMinutes)} minutes`
      );
    }
  }
}
```

**Testing Checklist for Critical #4:**
- [ ] New subscription created → dates populated from subscription.created
- [ ] invoice.paid webhook updates dates → dates overwritten with real values
- [ ] QR cron only processes customers with non-NULL dates
- [ ] Alert sent if subscription >1hr old with NULL dates

---

## WEEK 2: SECURE THE PERIMETER (Critical Issues 5-11)

### 🔴 CRITICAL #5: Timing Attack on Telegram Webhook Secret

**Priority:** P2 - MEDIUM
**Effort:** 30 minutes

**File:** `src/routes/api/telegram/webhook/+server.ts` (line 66)

**Change from:**
```typescript
if (!secretToken || !timingSafeEqual(secretToken, TELEGRAM_SECRET_TOKEN)) {
  return json({ error: 'Forbidden' }, { status: 403 });
}
```

**To:**
```typescript
const receivedToken = secretToken || '';  // Never short-circuit
if (!timingSafeEqual(receivedToken, TELEGRAM_SECRET_TOKEN)) {
  return json({ error: 'Forbidden' }, { status: 403 });
}
```

---

### 🔴 CRITICAL #6: Handle Update Token Replay Protection

**Priority:** P2 - MEDIUM
**Effort:** 1 hour

**File:** `src/routes/api/handle/consume/+server.ts` (line 112)

**Change from:**
```typescript
// Mark token as used
await supabase
  .from('handle_update_tokens')
  .update({ used_at: new Date().toISOString() })
  .eq('token_hash', tokenHash);
```

**To:**
```typescript
// Atomic update - only succeed if not already used
const { data: updateResult, error: updateError } = await supabase
  .from('handle_update_tokens')
  .update({ used_at: new Date().toISOString() })
  .eq('token_hash', tokenHash)
  .is('used_at', null)  // Only update if still NULL
  .select()
  .maybeSingle();

if (updateError) {
  console.error('[DB ERROR] Error marking token as used:', updateError);
  return json({ error: 'Database error' }, { status: 500 });
}

if (!updateResult) {
  // No rows updated = token already used
  return json({
    error: 'This link has already been used',
    code: 'ALREADY_USED'
  }, { status: 400 });
}
```

---

### 🔴 CRITICAL #7: QR JWT Expiration Mismatch

**Priority:** P2 - MEDIUM
**Effort:** 30 minutes

**File:** `src/lib/cron/issue-qr.ts` (line 86-99)

**Change:**
```typescript
const expiresAt = endOfDayPT(today);  // Returns Date object

// Truncate to seconds for consistency
const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
const expiresAtDate = new Date(expiresAtSeconds * 1000);

const jwt = await new jose.SignJWT({
  customer_id: customer.id,
  service_date: today,
  jti
})
  .setProtectedHeader({ alg: 'ES256' })
  .setIssuedAt()
  .setExpirationTime(expiresAtSeconds)  // Use seconds
  .sign(privateKey);

await supabase.from('qr_tokens').insert({
  customer_id: customer.id,
  service_date: today,
  jti,
  issued_at: new Date().toISOString(),
  expires_at: expiresAtDate.toISOString(),  // Use truncated date
  used_at: null
});
```

---

### 🔴 CRITICAL #8: Stripe Webhook Idempotency Race Condition

**Priority:** P1 - HIGH
**Effort:** 2 hours

**File:** `src/routes/api/stripe/webhook/+server.ts` (line 48-63)

**Implementation:**

```typescript
// Use advisory lock for webhook processing
import { acquireAdvisoryLock, releaseAdvisoryLock } from '$lib/utils/advisory-lock';

const lockKey = `stripe_webhook:${event.id}`;
const locked = await acquireAdvisoryLock(supabase, lockKey);

if (!locked) {
  console.log('[Stripe Webhook] Another process is handling this event, skipping');
  return json({ received: true });
}

try {
  // Check if event already processed
  const { data: existingEvent, error: fetchError } = await supabase
    .from('webhook_events')
    .select('status')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existingEvent) {
    console.log('[Stripe Webhook] Event already processed:', event.id);
    return json({ received: true });
  }

  // Insert event record
  const { error: insertError } = await supabase
    .from('webhook_events')
    .insert({
      source: 'stripe',
      event_id: event.id,
      event_type: event.type,
      status: 'processing'
    });

  if (insertError) {
    console.error('[Stripe Webhook] Error inserting event:', insertError);
    return json({ error: 'Database error' }, { status: 500 });
  }

  // Process webhook
  // ... existing webhook handling logic

} finally {
  await releaseAdvisoryLock(supabase, lockKey);
}
```

---

### 🔴 CRITICAL #9: Telegram Bot Rate Limiting

**Priority:** P1 - HIGH
**Effort:** 3 hours

**File:** `src/routes/api/telegram/webhook/+server.ts`

**Implementation using Cloudflare KV:**

```typescript
// Add rate limiting at the start of webhook handler
const rateLimitKey = `telegram_rate:${update.message?.from?.id || update.callback_query?.from?.id}`;

// Get current request count from KV
const currentCount = await env.KV.get(rateLimitKey);
const requestCount = currentCount ? parseInt(currentCount) : 0;

// Rate limit: 20 requests per minute per user
if (requestCount >= 20) {
  console.warn(`[Telegram Webhook] Rate limit exceeded for user ${rateLimitKey}`);
  return json({ ok: true });  // Silently drop (don't tell attacker)
}

// Increment counter
await env.KV.put(rateLimitKey, (requestCount + 1).toString(), {
  expirationTtl: 60  // Reset every 60 seconds
});
```

**Note:** Requires adding KV namespace to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
```

---

### 🔴 CRITICAL #10: Crypto Timing Attack in timingSafeEqual

**Priority:** P2 - MEDIUM
**Effort:** 15 minutes

**File:** `src/lib/utils/crypto.ts` (line 59-70)

**Change from:**
```typescript
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;  // ❌ Early return leaks length
  }
  // ...
}
```

**To:**
```typescript
export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;  // XOR lengths (nonzero if different)

  for (let i = 0; i < maxLen; i++) {
    const aChar = i < a.length ? a.charCodeAt(i) : 0;
    const bChar = i < b.length ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }

  return result === 0;
}
```

---

### 🔴 CRITICAL #11: Database Connection Pool Limits

**Priority:** P1 - HIGH
**Effort:** 1 hour

**Create:** `src/lib/db/supabase.ts`

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get singleton Supabase client with connection pooling
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        db: {
          pool: {
            min: 2,
            max: 10  // Limit per worker
          }
        },
        auth: {
          persistSession: false  // No session storage on server
        }
      }
    );
  }

  return supabaseInstance;
}
```

**Update all files to use singleton:**

```typescript
// BEFORE:
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// AFTER:
import { getSupabase } from '$lib/db/supabase';
const supabase = getSupabase();
```

---

## WEEK 3: PREVENT FUTURE DISASTERS (High/Medium Issues)

### 🟠 HIGH #12: check-telegram-links Sends Correction Emails Forever

**File:** `src/lib/cron/check-telegram-links.ts`

**Add counter:**

```sql
-- Migration
ALTER TABLE customers ADD COLUMN correction_emails_sent INT NOT NULL DEFAULT 0;
```

**Update cron:**

```typescript
// Skip if already sent 3 correction emails
if (customer.correction_emails_sent >= 3) {
  console.log(`[Telegram Check] Already sent 3 correction emails to ${customer.email}, skipping`);
  continue;
}

// ... send email logic

// Increment counter
await supabase
  .from('customers')
  .update({ correction_emails_sent: customer.correction_emails_sent + 1 })
  .eq('id', customer.id);
```

---

### 🟠 HIGH #14: Telegram Bot Error Recovery

**File:** `src/routes/api/telegram/webhook/+server.ts` (line 84-86)

**Change:**

```typescript
} catch (error) {
  console.error('Error processing Telegram update:', error);

  // Send error message to user (don't leave them hanging)
  try {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(
        chatId,
        '⚠️ Something went wrong. Please try again in a moment or contact @noahchonlee for help.'
      );
    }
  } catch (sendError) {
    console.error('Failed to send error message:', sendError);
  }

  // Return 200 OK (don't trigger Telegram retry loop)
  return json({ ok: true });
}
```

---

### 🟡 MEDIUM #16: Skip Command Performance

**File:** `src/routes/api/telegram/webhook/+server.ts` (line 418-423)

**Batch fetch:**

```typescript
// BEFORE: 14 sequential queries
for (let i = 0; i < 14; i++) {
  const { data: existingSkip } = await supabase.from('skips').select('*').single();
}

// AFTER: 1 batch query
const startDate = today;
const endDate = new Date(today);
endDate.setDate(endDate.getDate() + 13);

const { data: existingSkips } = await supabase
  .from('skips')
  .select('skip_date')
  .eq('customer_id', customerId)
  .gte('skip_date', startDate)
  .lte('skip_date', endDate.toISOString().split('T')[0]);

const skipSet = new Set(existingSkips?.map(s => s.skip_date) || []);

// Build calendar
for (let i = 0; i < 14; i++) {
  const dateStr = /* ... */;
  const isSkipped = skipSet.has(dateStr);
  // ...
}
```

---

### 🟡 MEDIUM #17: Email Templates in Database

**Move hardcoded templates to `email_templates` table**

This is lower priority but improves maintainability.

---

### 🟡 MEDIUM #18: Monitoring & Alerting

**Add Sentry integration:**

```bash
pnpm add @sentry/sveltekit
```

**Configure:** `src/hooks.server.ts`

```typescript
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1
});

export const handleError = Sentry.handleErrorWithSentry();
```

---

## Testing Strategy

### Integration Tests

Create `tests/integration/webhook-flow.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Stripe checkout → Telegram link flow', async ({ page }) => {
  // 1. Complete Stripe checkout
  // 2. Verify customer created in DB
  // 3. Verify deep link token created
  // 4. Verify email queued
  // 5. Visit success page
  // 6. Verify deep link displayed
  // 7. Click Telegram link
  // 8. Verify bot responds
});
```

### Load Testing

**Simulate concurrent webhook requests:**

```bash
# Install k6
brew install k6

# Create load test script
cat > load-test.js <<EOF
import http from 'k6/http';

export default function() {
  http.post('https://frontiermeals.com/api/stripe/webhook', JSON.stringify({
    // Mock Stripe webhook payload
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export let options = {
  vus: 50,  // 50 concurrent users
  duration: '30s'
};
EOF

# Run test
k6 run load-test.js
```

---

## Rollout Plan

### Phase 1: Critical Fixes (Week 1)
- Deploy behind feature flag
- Enable for 10% of new signups
- Monitor error rates
- Gradually increase to 100%

### Phase 2: Security Hardening (Week 2)
- Deploy rate limiting
- Monitor for attack attempts
- Tune rate limits based on usage

### Phase 3: Performance & Monitoring (Week 3)
- Enable Sentry
- Set up dashboards
- Create runbooks

---

## Success Metrics

### Before Fixes
- Telegram link success rate: ~60% (estimated)
- Email delivery rate: Unknown (failures swallowed)
- QR redemption issues: 2-3 per week

### After Fixes (Target)
- Telegram link success rate: >95%
- Email delivery rate: >99%
- QR redemption issues: <1 per month
- Zero race condition incidents

---

## Rollback Plan

If critical issues arise:

1. Disable feature flag
2. Revert to previous deployment
3. Analyze logs
4. Fix in staging
5. Re-deploy with additional tests

---

## Documentation Updates Needed

- [ ] Update API contracts spec with new endpoints
- [ ] Document email queue system
- [ ] Create runbook for email queue failures
- [ ] Update ops guide with new alerts
- [ ] Document rate limiting thresholds

---

**END OF BRUTALIST FIXES PLAN**
