# Brutalist Critique Fixes - LEAN Implementation Plan

**Date:** 2025-11-08
**Philosophy:** Fix critical issues WITHOUT adding new cloud services, queues, or infrastructure complexity
**Stack:** SvelteKit + Supabase + Stripe + Telegram + Resend (NOTHING ELSE)

---

## Core Principle: Work With What We Have

**NO:**
- ❌ Cloudflare KV for rate limiting
- ❌ Redis for caching
- ❌ Separate queue services
- ❌ Complex monitoring services (beyond free Sentry tier)
- ❌ Additional external dependencies

**YES:**
- ✅ Postgres (we already have Supabase)
- ✅ Existing cron jobs (Cloudflare Pages already supports this)
- ✅ Simple database tables for queues
- ✅ Built-in Postgres features (advisory locks, triggers)
- ✅ Smart retry logic without infrastructure

---

## WEEK 1: CRITICAL FIXES (Lean Approach)

### 🔴 CRITICAL #1: Telegram Link Corruption - SIMPLIFIED FIX

**Problem:** 60-minute link expiration + no recovery path
**Lean Solution:** Just make it work, no complex infrastructure

#### Task 1.1: Show Deep Link on Success Page (NO API CALL NEEDED)

**Key Insight:** We can generate the token BEFORE Stripe checkout, store it in session metadata, and display it directly.

**File:** `src/routes/api/stripe/create-checkout/+server.ts`

```typescript
// Generate token BEFORE checkout
const deepLinkToken = randomUUID();
const deepLinkTokenHash = await sha256(deepLinkToken);

const session = await stripe.checkout.sessions.create({
  // ... existing config
  success_url: `${PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}&t=${deepLinkToken}`,  // Pass token in URL
  metadata: {
    deep_link_token: deepLinkToken,
    deep_link_token_hash: deepLinkTokenHash
  }
});
```

**File:** `src/routes/success/+page.svelte`

```svelte
<script lang="ts">
  import { page } from '$app/stores';

  let deepLink = '';

  $: {
    const token = $page.url.searchParams.get('t');
    if (token) {
      deepLink = `https://t.me/frontiermealsbot?start=${token}`;
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(deepLink);
  }
</script>

{#if deepLink}
  <div class="success-container">
    <h1>Welcome to Frontier Meals! 🍽️</h1>

    <div class="telegram-link-box">
      <h2>Next Step: Connect Telegram</h2>
      <p>Click below to connect your account:</p>

      <a href={deepLink} class="big-button">Open Telegram Bot</a>
      <button on:click={copyLink}>Copy Link</button>

      <code>{deepLink}</code>
    </div>

    <p class="backup-text">
      We've also sent this link to your email. It's valid for 7 days.
    </p>
  </div>
{/if}
```

**That's it.** No API calls, no database lookups. Token is in the URL.

#### Task 1.2: Extend Token Expiration to 7 Days

**One-line change in webhook:**

```typescript
// BEFORE: 60 minutes
const deepLinkExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

// AFTER: 7 days
const deepLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
```

#### Task 1.3: Handle Update Auto-Generates New Link

**File:** `src/routes/api/handle/consume/+server.ts`

Add 10 lines after handle update:

```typescript
// Generate new deep link
const newToken = randomUUID();
const newTokenHash = await sha256(newToken);

await supabase.from('telegram_deep_link_tokens').insert({
  customer_id: handleToken.customer_id,
  token_hash: newTokenHash,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
});

// Return link to user (show on page)
return json({
  success: true,
  telegram_link: `https://t.me/frontiermealsbot?start=${newToken}`
});
```

**Update UI to show the link:**

```svelte
<!-- In handle update page success state -->
{:else}
  <h2>Handle updated! ✅</h2>
  <p>Click below to connect Telegram:</p>
  <a href={result.telegram_link}>Open Telegram Bot</a>
{/if}
```

**Done. No email queue, no complex retry logic.**

---

### 🔴 CRITICAL #2: QR Code Race Condition - DATABASE-ONLY FIX

**Lean Solution:** Use Postgres ON CONFLICT instead of advisory locks

**File:** `src/lib/cron/issue-qr.ts`

**Change upsert to:**

```typescript
// Insert with ON CONFLICT DO NOTHING
const { error: insertError } = await supabase
  .from('qr_tokens')
  .insert({
    customer_id: customer.id,
    service_date: today,
    jti,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString()
  })
  .select()
  .maybeSingle();

// If constraint violation, QR already exists - skip
if (insertError?.code === '23505') {
  console.log(`[QR] Already issued for ${customer.email}, skipping`);
  continue;
}

if (insertError) {
  console.error(`[QR] Error for ${customer.email}:`, insertError);
  continue;  // Skip this customer, don't fail entire job
}

// Only send email if insert succeeded
await sendQREmail(customer, jwt);
```

**Add unique constraint to ensure atomicity:**

**Migration:** `supabase/migrations/20251108000010_qr_unique_constraint.sql`

```sql
-- Ensure unique constraint exists
ALTER TABLE qr_tokens DROP CONSTRAINT IF EXISTS qr_tokens_customer_date_unique;
ALTER TABLE qr_tokens ADD CONSTRAINT qr_tokens_customer_date_unique
  UNIQUE (customer_id, service_date);
```

**That's it.** Database handles concurrency, no locks needed.

---

### 🔴 CRITICAL #3: Email Failures - LEAN RETRY WITHOUT QUEUE

**Lean Solution:** Store failures in simple table, existing cron processes retries

**Migration:** `supabase/migrations/20251108000011_email_retry_simple.sql`

```sql
CREATE TABLE email_retry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  template_type TEXT NOT NULL,

  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_email_retry_pending ON email_retry(next_attempt_at)
  WHERE sent_at IS NULL AND attempts < 5;
```

**Modify sendEmail to auto-retry on failure:**

**File:** `src/lib/email/send.ts`

```typescript
export async function sendEmail(params: EmailParams) {
  try {
    // Try to send
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey || `${Date.now()}`
      },
      body: JSON.stringify({
        from: 'Frontier Meals <meals@frontiermeals.com>',
        to: [params.to],
        subject: params.subject,
        html: params.html,
        tags: params.tags
      })
    });

    if (!response.ok) {
      throw new Error(`Resend API error: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    // On failure, store for retry (don't throw)
    console.error('[EMAIL] Send failed, queuing for retry:', error);

    // Get supabase client (passed as param or imported)
    const supabase = getSupabase();

    await supabase.from('email_retry').insert({
      customer_id: params.customerId,
      email_to: params.to,
      subject: params.subject,
      html: params.html,
      template_type: params.templateType || 'unknown',
      next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()  // Retry in 5 min
    });

    // Don't throw - let caller continue
    return null;
  }
}
```

**Create simple retry cron:** `src/routes/api/cron/retry-emails/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/db/supabase';
import { sendEmail } from '$lib/email/send';

export const GET: RequestHandler = async ({ request }) => {
  const supabase = getSupabase();

  // Fetch emails ready for retry
  const { data: emails } = await supabase
    .from('email_retry')
    .select('*')
    .is('sent_at', null)
    .lt('attempts', 5)
    .lte('next_attempt_at', new Date().toISOString())
    .limit(10);  // Process 10 at a time

  if (!emails || emails.length === 0) {
    return json({ processed: 0 });
  }

  let sent = 0;

  for (const email of emails) {
    try {
      // Attempt send
      await sendEmail({
        to: email.email_to,
        subject: email.subject,
        html: email.html,
        customerId: email.customer_id,
        templateType: email.template_type,
        idempotencyKey: `retry/${email.id}`
      });

      // Mark as sent
      await supabase
        .from('email_retry')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', email.id);

      sent++;

    } catch (error) {
      // Increment attempts, schedule next retry
      const nextAttempt = new Date(Date.now() + Math.pow(2, email.attempts) * 5 * 60 * 1000);  // Exponential backoff

      await supabase
        .from('email_retry')
        .update({
          attempts: email.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          next_attempt_at: nextAttempt.toISOString()
        })
        .eq('id', email.id);
    }
  }

  return json({ processed: sent });
};
```

**Add to wrangler.toml:**

```toml
# Run every 5 minutes
[[routes]]
pattern = "/api/cron/retry-emails"
custom_domain = true
```

**Total additions: 1 table, 1 cron job, 20 lines of code. No external queue service.**

---

### 🔴 CRITICAL #4: NULL Subscription Dates - ONE LINE FIX

**File:** `src/routes/api/stripe/webhook/+server.ts`

**Just use subscription.created as fallback:**

```typescript
current_period_start: subscription.current_period_start
  ? new Date(subscription.current_period_start * 1000).toISOString()
  : new Date(subscription.created * 1000).toISOString(),

current_period_end: subscription.current_period_end
  ? new Date(subscription.current_period_end * 1000).toISOString()
  : new Date(new Date(subscription.created * 1000).setMonth(new Date(subscription.created * 1000).getMonth() + 1)).toISOString()
```

**And update QR cron to handle NULL gracefully:**

```typescript
const { data: activeCustomers } = await supabase
  .from('customers')
  .select('*, subscriptions!inner(*)')
  .eq('subscriptions.status', 'active')
  .not('subscriptions.current_period_start', 'is', null)  // Skip NULL
  .not('subscriptions.current_period_end', 'is', null)
  .lte('subscriptions.current_period_start', today)
  .gte('subscriptions.current_period_end', today);
```

**Done.**

---

## WEEK 2: SECURITY (Minimal Changes)

### 🔴 CRITICAL #5-7: Timing Attacks - 3 ONE-LINE FIXES

**File:** `src/routes/api/telegram/webhook/+server.ts`

```typescript
// BEFORE:
if (!secretToken || !timingSafeEqual(secretToken, TELEGRAM_SECRET_TOKEN))

// AFTER:
const receivedToken = secretToken || '';
if (!timingSafeEqual(receivedToken, TELEGRAM_SECRET_TOKEN))
```

**File:** `src/lib/utils/crypto.ts`

```typescript
// Fix timingSafeEqual - no early return
export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;

  for (let i = 0; i < maxLen; i++) {
    const aChar = i < a.length ? a.charCodeAt(i) : 0;
    const bChar = i < b.length ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }

  return result === 0;
}
```

**File:** `src/lib/cron/issue-qr.ts`

```typescript
// Use consistent timestamp precision
const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
const jwt = await new jose.SignJWT({ ... })
  .setExpirationTime(expiresAtSeconds)
  .sign(privateKey);

await supabase.from('qr_tokens').insert({
  expires_at: new Date(expiresAtSeconds * 1000).toISOString()
});
```

---

### 🔴 CRITICAL #8: Webhook Idempotency - USE POSTGRES

**No advisory locks needed.** Just check-then-insert:

**File:** `src/routes/api/stripe/webhook/+server.ts`

```typescript
// Check if already processed
const { data: existing } = await supabase
  .from('webhook_events')
  .select('status')
  .eq('event_id', event.id)
  .maybeSingle();

if (existing) {
  console.log('[Webhook] Already processed:', event.id);
  return json({ received: true });
}

// Try to insert (race condition handled by unique constraint)
const { error: insertError } = await supabase
  .from('webhook_events')
  .insert({
    source: 'stripe',
    event_id: event.id,
    event_type: event.type,
    status: 'processing'
  });

if (insertError?.code === '23505') {
  // Another request beat us to it
  console.log('[Webhook] Race condition, another process handling');
  return json({ received: true });
}
```

**Add unique constraint:**

```sql
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);
```

---

### 🔴 CRITICAL #9: Rate Limiting - USE POSTGRES

**No KV store needed.** Use Postgres:

**Migration:** `supabase/migrations/20251108000012_rate_limit.sql`

```sql
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);

-- Auto-delete old entries
CREATE FUNCTION cleanup_rate_limits() RETURNS trigger AS $$
BEGIN
  DELETE FROM rate_limits WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_rate_limits
  AFTER INSERT ON rate_limits
  EXECUTE FUNCTION cleanup_rate_limits();
```

**Helper function:** `src/lib/utils/rate-limit.ts`

```typescript
import { getSupabase } from '$lib/db/supabase';

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const supabase = getSupabase();

  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  // Get or create rate limit entry
  const { data: entry } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('key', key)
    .gte('window_start', windowStart.toISOString())
    .maybeSingle();

  if (!entry) {
    // First request in window
    await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: new Date().toISOString(),
      expires_at: new Date(Date.now() + windowSeconds * 1000).toISOString()
    });
    return true;
  }

  // Check if over limit
  if (entry.count >= limit) {
    return false;
  }

  // Increment counter
  await supabase
    .from('rate_limits')
    .update({ count: entry.count + 1 })
    .eq('key', key);

  return true;
}
```

**Use in webhook:**

```typescript
const telegramUserId = update.message?.from?.id || update.callback_query?.from?.id;
const allowed = await checkRateLimit(`tg:${telegramUserId}`, 20, 60);  // 20 req/min

if (!allowed) {
  console.warn('[Telegram] Rate limit exceeded');
  return json({ ok: true });
}
```

**Total: 1 table, 1 function, 30 lines of code. No Redis, no KV.**

---

### 🔴 CRITICAL #11: Connection Pooling - SINGLETON PATTERN

**File:** `src/lib/db/supabase.ts`

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

let instance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!instance) {
    instance = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
  }
  return instance;
}
```

**Replace everywhere:**

```typescript
// BEFORE:
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// AFTER:
import { getSupabase } from '$lib/db/supabase';
const supabase = getSupabase();
```

**That's it. 10 lines of code.**

---

## WEEK 3: POLISH (Minimal Work)

### 🟠 HIGH #12: Limit Correction Emails

**Add column:** `correction_emails_sent INT DEFAULT 0`

**In check-telegram-links cron:**

```typescript
if (customer.correction_emails_sent >= 3) continue;

// After sending email:
await supabase
  .from('customers')
  .update({ correction_emails_sent: customer.correction_emails_sent + 1 })
  .eq('id', customer.id);
```

**3 lines of code.**

---

### 🟠 HIGH #14: Graceful Bot Errors

**In telegram webhook catch block:**

```typescript
} catch (error) {
  console.error('Error:', error);

  const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
  if (chatId) {
    await sendMessage(chatId, 'Something went wrong. Please try again or contact @noahchonlee');
  }

  return json({ ok: true });  // Don't trigger retry loop
}
```

**5 lines of code.**

---

### 🟡 MEDIUM #16: Batch Skip Queries

**In handleSkipCommand:**

```typescript
// BEFORE: 14 queries
for (let i = 0; i < 14; i++) {
  const { data: skip } = await supabase.from('skips').select('*').single();
}

// AFTER: 1 query
const { data: skips } = await supabase
  .from('skips')
  .select('skip_date')
  .eq('customer_id', customerId)
  .gte('skip_date', today)
  .lte('skip_date', endDate);

const skipSet = new Set(skips?.map(s => s.skip_date) || []);
```

**10 lines of code.**

---

## Monitoring: FREE TIER ONLY

**Use Sentry (free tier = 5k errors/month):**

```bash
pnpm add @sentry/sveltekit
```

**File:** `src/hooks.server.ts`

```typescript
import * as Sentry from '@sentry/sveltekit';

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0  // No performance monitoring (free tier)
  });
}

export const handleError = Sentry.handleErrorWithSentry();
```

**That's it. No paid services.**

---

## Summary: What Changed

### New Tables (Postgres only, no new services):
1. `email_retry` - Simple email retry queue
2. `rate_limits` - Rate limiting without Redis

### New Cron Jobs:
1. `/api/cron/retry-emails` - Process email retries

### Code Changes:
- ✅ Token in URL on success page
- ✅ ON CONFLICT for QR race condition
- ✅ Simple email retry logic
- ✅ Singleton Supabase client
- ✅ Postgres-based rate limiting
- ✅ Better error messages

### What We DIDN'T Add:
- ❌ No Cloudflare KV
- ❌ No Redis
- ❌ No separate queue service
- ❌ No complex infrastructure
- ❌ No paid monitoring

**Total Infrastructure: UNCHANGED (just Postgres + existing services)**
**Total Code Added: ~200 lines**
**External Services Added: 0**

---

## Testing Checklist

### Week 1 (Critical)
- [ ] Complete Stripe checkout → token visible on success page
- [ ] Email send fails → stored in retry table
- [ ] Retry cron processes failed emails
- [ ] QR cron runs twice → only one QR generated
- [ ] Subscription dates NULL → QR cron skips, no crash

### Week 2 (Security)
- [ ] Timing attack mitigations verified
- [ ] Duplicate webhook → handled gracefully
- [ ] High request volume → rate limited

### Week 3 (Polish)
- [ ] Skip calendar loads fast (1 query not 14)
- [ ] Bot errors show helpful message
- [ ] Sentry captures errors in production

---

**Philosophy:** Every fix uses existing infrastructure. No new cloud services. Keep it simple.
