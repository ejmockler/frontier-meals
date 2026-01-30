# PayPal Integration Implementation Plan

**Generated:** 2026-01-29
**Status:** Ready for Implementation
**Key Insight:** Telegram username resolved from bot interaction, not checkout

---

## Executive Summary

This plan adapts Frontier Meals for PayPal by leveraging a key capability: **when a user sends `/start` to the Telegram bot, we receive their full User object including `username`**. This eliminates the need for checkout custom fields entirely.

### The Solution

**Current Stripe Flow:**
```
Checkout → User types telegram_handle → Webhook stores handle → Email with deep link → Bot links user_id
```

**New PayPal Flow:**
```
Checkout → (no handle needed) → Webhook creates customer → Email with deep link → Bot extracts username AND links user_id
```

The Telegram Bot API provides `message.from.username` when a user interacts. This is **more reliable** than user-typed input because:
- No typos (extracted directly from Telegram)
- Always current (reflects their actual username)
- Verified (user must have the account to click the link)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Migration](#2-database-migration)
3. [PayPal API Integration](#3-paypal-api-integration)
4. [Checkout Flow](#4-checkout-flow)
5. [Webhook Handler](#5-webhook-handler)
6. [Telegram Bot Changes](#6-telegram-bot-changes)
7. [Email Template Updates](#7-email-template-updates)
8. [Environment Variables](#8-environment-variables)
9. [Testing Strategy](#9-testing-strategy)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Architecture Overview

### Telegram Username Resolution

When a user clicks `https://t.me/frontiermealsbot?start=TOKEN` and sends `/start`:

```json
{
  "message": {
    "from": {
      "id": 123456789,           // Always present, unique, immutable
      "is_bot": false,
      "first_name": "John",      // Always present
      "last_name": "Doe",        // Optional
      "username": "johndoe",     // Optional but usually present
      "language_code": "en"
    },
    "text": "/start abc123token"
  }
}
```

**Key Fields:**
| Field | Availability | Use Case |
|-------|--------------|----------|
| `id` | ✅ Always | Primary identifier (store as `telegram_user_id`) |
| `username` | ⚠️ Optional | Display handle (store as `telegram_handle`) |
| `first_name` | ✅ Always | Fallback display name |

### Flow Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STRIPE FLOW (Current)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────┐    ┌──────────────┐ │
│  │ Landing  │───▶│ Stripe Checkout  │───▶│ Success   │───▶│ Telegram Bot │ │
│  │ Page     │    │ (collects handle)│    │ Page      │    │ (/start)     │ │
│  └──────────┘    └──────────────────┘    └───────────┘    └──────────────┘ │
│                          │                                       │          │
│                          │ telegram_handle                       │          │
│                          ▼                                       ▼          │
│                  ┌───────────────┐                      Links telegram_user_id
│                  │ Webhook:      │                                          │
│                  │ Stores handle │                                          │
│                  └───────────────┘                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAYPAL FLOW (New)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────┐    ┌──────────────┐ │
│  │ Landing  │───▶│ PayPal Checkout  │───▶│ Success   │───▶│ Telegram Bot │ │
│  │ Page     │    │ (NO handle)      │    │ Page      │    │ (/start)     │ │
│  └──────────┘    └──────────────────┘    └───────────┘    └──────────────┘ │
│                          │                                       │          │
│                          │ (no telegram_handle)                  │          │
│                          ▼                                       ▼          │
│                  ┌───────────────┐               Extracts username from     │
│                  │ Webhook:      │               message.from.username      │
│                  │ handle = NULL │               AND links telegram_user_id │
│                  └───────────────┘                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/routes/api/paypal/
├── create-subscription/
│   └── +server.ts              # Creates PayPal subscription
├── webhook/
│   └── +server.ts              # Handles PayPal events
└── __tests__/
    ├── create-subscription.test.ts
    └── webhook.test.ts

src/lib/integrations/
├── paypal.ts                   # PayPal REST client
└── paypal.contract.test.ts     # API contract tests

supabase/migrations/
└── 20260129000000_add_paypal_support.sql
```

---

## 2. Database Migration

### Migration File

```sql
-- supabase/migrations/20260129000000_add_paypal_support.sql

BEGIN;

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================

-- Add payment provider discriminator
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_provider TEXT
    DEFAULT 'stripe'
    CHECK (payment_provider IN ('stripe', 'paypal'));

-- Add PayPal payer ID
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS paypal_payer_id TEXT UNIQUE;

-- Make Stripe customer ID nullable (PayPal customers won't have one)
ALTER TABLE customers
  ALTER COLUMN stripe_customer_id DROP NOT NULL;

-- Add constraint: must have at least one payment provider ID
ALTER TABLE customers
  ADD CONSTRAINT customers_has_payment_id CHECK (
    stripe_customer_id IS NOT NULL OR paypal_payer_id IS NOT NULL
  );

-- Index for PayPal lookups
CREATE INDEX IF NOT EXISTS idx_customer_paypal_payer
  ON customers(paypal_payer_id) WHERE paypal_payer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_payment_provider
  ON customers(payment_provider);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================

-- Add payment provider discriminator
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT
    DEFAULT 'stripe'
    CHECK (payment_provider IN ('stripe', 'paypal'));

-- Add PayPal subscription fields
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paypal_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS next_billing_time TIMESTAMPTZ;

-- Make Stripe subscription ID nullable
ALTER TABLE subscriptions
  ALTER COLUMN stripe_subscription_id DROP NOT NULL;

-- Add constraint: must have at least one subscription ID
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_has_payment_id CHECK (
    stripe_subscription_id IS NOT NULL OR paypal_subscription_id IS NOT NULL
  );

-- Expand status enum for PayPal states
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (
    status IN (
      -- Common statuses
      'active', 'past_due', 'canceled',
      -- Stripe-specific
      'unpaid', 'trialing',
      -- PayPal-specific
      'approval_pending', 'approved', 'suspended', 'expired'
    )
  );

-- Indexes for PayPal lookups
CREATE INDEX IF NOT EXISTS idx_subscription_paypal_id
  ON subscriptions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payment_provider
  ON subscriptions(payment_provider);

-- ============================================================================
-- WEBHOOK EVENTS TABLE
-- ============================================================================

-- Add PayPal as valid source
ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_source_check;

ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_source_check CHECK (
    source IN ('stripe', 'telegram', 'resend', 'paypal')
  );

-- Index for source + created_at queries
CREATE INDEX IF NOT EXISTS idx_webhook_source_created
  ON webhook_events(source, created_at DESC);

COMMIT;
```

### Rollback Script

```sql
-- supabase/migrations/20260129000001_rollback_paypal_support.sql

BEGIN;

-- Remove PayPal-specific columns
ALTER TABLE customers
  DROP COLUMN IF EXISTS payment_provider,
  DROP COLUMN IF EXISTS paypal_payer_id,
  DROP CONSTRAINT IF EXISTS customers_has_payment_id;

ALTER TABLE customers
  ALTER COLUMN stripe_customer_id SET NOT NULL;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS payment_provider,
  DROP COLUMN IF EXISTS paypal_subscription_id,
  DROP COLUMN IF EXISTS paypal_plan_id,
  DROP COLUMN IF EXISTS next_billing_time,
  DROP CONSTRAINT IF EXISTS subscriptions_has_payment_id;

ALTER TABLE subscriptions
  ALTER COLUMN stripe_subscription_id SET NOT NULL;

-- Restore original status constraint
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check,
  ADD CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'past_due', 'unpaid', 'canceled', 'trialing')
  );

-- Restore original webhook source constraint
ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_source_check,
  ADD CONSTRAINT webhook_events_source_check CHECK (
    source IN ('stripe', 'telegram', 'resend')
  );

-- Drop indexes
DROP INDEX IF EXISTS idx_customer_paypal_payer;
DROP INDEX IF EXISTS idx_customer_payment_provider;
DROP INDEX IF EXISTS idx_subscription_paypal_id;
DROP INDEX IF EXISTS idx_subscription_payment_provider;
DROP INDEX IF EXISTS idx_webhook_source_created;

COMMIT;
```

---

## 3. PayPal API Integration

### PayPal Client Library

```typescript
// src/lib/integrations/paypal.ts
import crypto from 'crypto';

export interface PayPalEnv {
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_WEBHOOK_ID: string;
  PAYPAL_PLAN_ID: string;
  PAYPAL_MODE: 'sandbox' | 'live';
}

// Token cache (in-memory)
let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Get PayPal base URL based on mode
 */
export function getPayPalBaseUrl(mode: 'sandbox' | 'live'): string {
  return mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/**
 * Get OAuth access token (cached)
 */
export async function getPayPalAccessToken(env: PayPalEnv): Promise<string> {
  // Return cached token if still valid
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal OAuth failed: ${error}`);
  }

  const data = await response.json();

  // Cache with 5-minute buffer before expiry
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000
  };

  return data.access_token;
}

/**
 * Create a subscription
 */
export interface CreateSubscriptionOptions {
  planId: string;
  customId?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayPalSubscription {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

export async function createPayPalSubscription(
  env: PayPalEnv,
  options: CreateSubscriptionOptions
): Promise<PayPalSubscription> {
  const accessToken = await getPayPalAccessToken(env);
  const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

  const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID()
    },
    body: JSON.stringify({
      plan_id: options.planId,
      custom_id: options.customId,
      application_context: {
        brand_name: 'Frontier Meals',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
        },
        return_url: options.returnUrl,
        cancel_url: options.cancelUrl
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal subscription creation failed: ${error}`);
  }

  return await response.json();
}

/**
 * Verify webhook signature (RSA-SHA256)
 */
// Certificate cache (1-hour TTL)
const certCache = new Map<string, { cert: string; expiresAt: number }>();

async function fetchCertificate(certUrl: string): Promise<string> {
  // Security: Verify cert URL is from PayPal
  if (!certUrl.includes('.paypal.com')) {
    throw new Error('Invalid certificate URL');
  }

  const cached = certCache.get(certUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cert;
  }

  const response = await fetch(certUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch certificate: ${response.statusText}`);
  }

  const cert = await response.text();
  certCache.set(certUrl, { cert, expiresAt: Date.now() + 3600000 });
  return cert;
}

export async function verifyPayPalWebhook(
  body: string,
  headers: Headers,
  webhookId: string
): Promise<boolean> {
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const certUrl = headers.get('paypal-cert-url');
  const signature = headers.get('paypal-transmission-sig');
  const authAlgo = headers.get('paypal-auth-algo');

  if (!transmissionId || !transmissionTime || !certUrl || !signature || !authAlgo) {
    console.error('[PayPal] Missing webhook headers');
    return false;
  }

  if (authAlgo !== 'SHA256withRSA') {
    console.error('[PayPal] Unsupported algorithm:', authAlgo);
    return false;
  }

  try {
    // CRC32 of body (use crc package or implement)
    const { crc32 } = await import('crc');
    const bodyCrc = crc32(body).toString();

    // Build verification message
    const message = `${transmissionId}|${transmissionTime}|${webhookId}|${bodyCrc}`;

    // Fetch certificate
    const certificate = await fetchCertificate(certUrl);

    // Verify signature
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    return verifier.verify(certificate, signature, 'base64');
  } catch (error) {
    console.error('[PayPal] Signature verification error:', error);
    return false;
  }
}

/**
 * Get subscription details
 */
export async function getPayPalSubscription(
  env: PayPalEnv,
  subscriptionId: string
): Promise<any> {
  const accessToken = await getPayPalAccessToken(env);
  const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

  const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch subscription: ${error}`);
  }

  return await response.json();
}
```

---

## 4. Checkout Flow

### Create Subscription Endpoint

```typescript
// src/routes/api/paypal/create-subscription/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sha256 } from '$lib/utils/crypto';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';
import { createPayPalSubscription } from '$lib/integrations/paypal';

export const POST: RequestHandler = async (event) => {
  const { request, url, getClientAddress } = event;
  const env = await getEnv(event);
  const supabase = await getSupabaseAdmin(event);

  // Rate limiting (same as Stripe: 5 req/min per IP)
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    getClientAddress() ||
    'unknown';

  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.checkout(clientIp),
    maxRequests: 5,
    windowMinutes: 1
  });

  if (!rateLimitResult.allowed) {
    return json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
        }
      }
    );
  }

  try {
    // Generate deep link token BEFORE checkout (same pattern as Stripe)
    const deepLinkToken = randomUUID();
    const deepLinkTokenHash = await sha256(deepLinkToken);

    // Create PayPal subscription
    const subscription = await createPayPalSubscription(
      {
        PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID,
        PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET,
        PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID,
        PAYPAL_PLAN_ID: env.PAYPAL_PLAN_ID,
        PAYPAL_MODE: env.PAYPAL_MODE as 'sandbox' | 'live'
      },
      {
        planId: env.PAYPAL_PLAN_ID,
        customId: deepLinkTokenHash, // Store hash for verification
        returnUrl: `${url.origin}/success?t=${deepLinkToken}`,
        cancelUrl: `${url.origin}`
      }
    );

    // Find approval URL
    const approvalUrl = subscription.links.find(link => link.rel === 'approve')?.href;

    if (!approvalUrl) {
      throw new Error('No approval URL in PayPal response');
    }

    console.log('[PayPal] Subscription created:', {
      subscription_id: subscription.id,
      status: subscription.status
    });

    return json({ url: approvalUrl });
  } catch (error) {
    console.error('[PayPal] Error creating subscription:', error);
    return json({ error: 'Failed to create subscription' }, { status: 500 });
  }
};
```

### Success Page Update

```typescript
// src/routes/success/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  // Support both Stripe and PayPal return parameters
  const sessionId = url.searchParams.get('session_id');     // Stripe
  const subscriptionId = url.searchParams.get('subscription_id'); // PayPal (optional)
  const deepLinkToken = url.searchParams.get('t');          // Both

  const provider = sessionId ? 'stripe' : 'paypal';

  return {
    provider,
    sessionId,
    subscriptionId,
    deepLinkToken,
    deepLink: deepLinkToken ? `https://t.me/frontiermealsbot?start=${deepLinkToken}` : null
  };
};
```

---

## 5. Webhook Handler

### PayPal Webhook Endpoint

```typescript
// src/routes/api/paypal/webhook/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sha256 } from '$lib/utils/crypto';
import { verifyPayPalWebhook } from '$lib/integrations/paypal';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';

export const POST: RequestHandler = async (event) => {
  const { request } = event;
  const env = await getEnv(event);
  const supabase = await getSupabaseAdmin(event);

  const body = await request.text();

  // Verify webhook signature
  const isValid = await verifyPayPalWebhook(body, request.headers, env.PAYPAL_WEBHOOK_ID);
  if (!isValid) {
    console.error('[PayPal Webhook] Invalid signature');
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  const eventObj = JSON.parse(body);
  console.log('[PayPal Webhook] Received:', {
    event_id: eventObj.id,
    event_type: eventObj.event_type
  });

  // Idempotency check (same pattern as Stripe)
  const { error: insertError } = await supabase
    .from('webhook_events')
    .insert({
      source: 'paypal',
      event_id: eventObj.id,
      event_type: eventObj.event_type,
      status: 'processing'
    });

  if (insertError?.code === '23505') {
    console.log('[PayPal Webhook] Duplicate event, skipping:', eventObj.id);
    return json({ received: true });
  }

  try {
    switch (eventObj.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(eventObj, supabase, env);
        break;
      case 'PAYMENT.SALE.COMPLETED':
        await handlePaymentCompleted(eventObj, supabase);
        break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handlePaymentFailed(eventObj, supabase, env);
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(eventObj, supabase, env);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(eventObj, supabase, env);
        break;
      case 'BILLING.SUBSCRIPTION.UPDATED':
        await handleSubscriptionUpdated(eventObj, supabase);
        break;
      default:
        console.log('[PayPal Webhook] Unhandled:', eventObj.event_type);
    }

    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', eventObj.id);

    return json({ received: true });
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error);
    await supabase
      .from('webhook_events')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('event_id', eventObj.id);

    return json({ error: 'Webhook processing failed' }, { status: 500 });
  }
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleSubscriptionActivated(event: any, supabase: any, env: any) {
  const resource = event.resource;
  const subscriber = resource.subscriber;

  const email = subscriber.email_address;
  const name = subscriber.name
    ? `${subscriber.name.given_name || ''} ${subscriber.name.surname || ''}`.trim()
    : 'Frontier Customer';
  const paypalPayerId = subscriber.payer_id;
  const paypalSubscriptionId = resource.id;

  console.log('[PayPal] Subscription activated:', {
    payer_id: paypalPayerId,
    subscription_id: paypalSubscriptionId,
    email
  });

  // Create customer (NO telegram_handle - resolved later by bot)
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      payment_provider: 'paypal',
      paypal_payer_id: paypalPayerId,
      email,
      name,
      telegram_handle: null // Will be set by Telegram bot
    })
    .select()
    .single();

  if (customerError) {
    console.error('[PayPal] Error creating customer:', customerError);
    throw customerError;
  }

  // Extract billing dates
  const billingInfo = resource.billing_info;
  const nextBillingTime = billingInfo?.next_billing_time;
  const lastPaymentTime = billingInfo?.last_payment?.time;

  // Create subscription
  const { error: subError } = await supabase.from('subscriptions').insert({
    customer_id: customer.id,
    payment_provider: 'paypal',
    paypal_subscription_id: paypalSubscriptionId,
    paypal_plan_id: resource.plan_id,
    status: resource.status.toLowerCase(),
    current_period_start: lastPaymentTime ? new Date(lastPaymentTime).toISOString() : null,
    current_period_end: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
    next_billing_time: nextBillingTime ? new Date(nextBillingTime).toISOString() : null
  });

  if (subError) {
    console.error('[PayPal] Error creating subscription:', subError);
    throw subError;
  }

  // Initialize telegram_link_status
  await supabase.from('telegram_link_status').insert({
    customer_id: customer.id,
    is_linked: false
  });

  // Generate fresh deep link token
  const deepLinkToken = randomUUID();
  const deepLinkTokenHash = await sha256(deepLinkToken);
  const deepLink = `https://t.me/frontiermealsbot?start=${deepLinkToken}`;

  // Store token (7-day expiry)
  await supabase.from('telegram_deep_link_tokens').insert({
    customer_id: customer.id,
    token_hash: deepLinkTokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Send telegram_link email
  const emailTemplate = await renderTemplate(
    'telegram_link',
    {
      customer_name: name,
      telegram_handle: '(set up in Telegram)', // Placeholder - resolved by bot
      deep_link: deepLink
    },
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await sendEmail({
    to: email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    tags: [
      { name: 'category', value: 'telegram_link' },
      { name: 'customer_id', value: customer.id },
      { name: 'provider', value: 'paypal' }
    ],
    idempotencyKey: `telegram_link/${customer.id}`
  });

  // Audit log
  await supabase.from('audit_log').insert({
    actor: 'system',
    action: 'subscription_created',
    subject: `customer:${customer.id}`,
    metadata: {
      payment_provider: 'paypal',
      paypal_subscription_id: paypalSubscriptionId,
      email
    }
  });
}

async function handlePaymentCompleted(event: any, supabase: any) {
  const resource = event.resource;
  const billingAgreementId = resource.billing_agreement_id;

  if (!billingAgreementId) return; // Not a subscription payment

  await supabase
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('paypal_subscription_id', billingAgreementId);

  console.log('[PayPal] Payment completed for:', billingAgreementId);
}

async function handlePaymentFailed(event: any, supabase: any, env: any) {
  const resource = event.resource;
  const paypalSubscriptionId = resource.id;

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*, customers(*)')
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .single();

  if (!subscription) return;

  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('paypal_subscription_id', paypalSubscriptionId);

  const customer = Array.isArray(subscription.customers)
    ? subscription.customers[0]
    : subscription.customers;

  // Send dunning email
  const attemptCount = resource.failed_payment_count || 1;
  const emailSlug = attemptCount === 1 ? 'dunning_soft' : attemptCount === 2 ? 'dunning_retry' : 'dunning_final';

  const emailTemplate = await renderTemplate(
    emailSlug,
    {
      customer_name: customer.name,
      amount_due: resource.amount_with_breakdown?.gross_amount?.value || 'your subscription',
      update_payment_url: 'https://www.paypal.com/myaccount/autopay/'
    },
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await sendEmail({
    to: customer.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    tags: [{ name: 'category', value: emailSlug }],
    idempotencyKey: `${emailSlug}/${paypalSubscriptionId}/${attemptCount}`
  });
}

async function handleSubscriptionSuspended(event: any, supabase: any, env: any) {
  const resource = event.resource;
  const paypalSubscriptionId = resource.id;

  const { data: updated } = await supabase
    .from('subscriptions')
    .update({ status: 'suspended' })
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .select('*, customers(*)');

  if (!updated?.[0]) return;

  const customer = Array.isArray(updated[0].customers)
    ? updated[0].customers[0]
    : updated[0].customers;

  // Send suspension notice
  const emailTemplate = await renderTemplate(
    'subscription_suspended',
    {
      customer_name: customer.name,
      reactivate_url: 'https://www.paypal.com/myaccount/autopay/'
    },
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await sendEmail({
    to: customer.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    tags: [{ name: 'category', value: 'subscription_suspended' }],
    idempotencyKey: `suspended/${paypalSubscriptionId}`
  });
}

async function handleSubscriptionCancelled(event: any, supabase: any, env: any) {
  const resource = event.resource;
  const paypalSubscriptionId = resource.id;

  const { data: updated } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .select('*, customers(*)');

  if (!updated?.[0]) return;

  const customer = Array.isArray(updated[0].customers)
    ? updated[0].customers[0]
    : updated[0].customers;

  // Send cancellation notice
  const emailTemplate = await renderTemplate(
    'canceled_notice',
    { customer_name: customer.name },
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await sendEmail({
    to: customer.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    tags: [{ name: 'category', value: 'canceled_notice' }],
    idempotencyKey: `canceled/${paypalSubscriptionId}`
  });
}

async function handleSubscriptionUpdated(event: any, supabase: any) {
  const resource = event.resource;
  const paypalSubscriptionId = resource.id;
  const billingInfo = resource.billing_info;

  await supabase
    .from('subscriptions')
    .update({
      status: resource.status.toLowerCase(),
      next_billing_time: billingInfo?.next_billing_time
        ? new Date(billingInfo.next_billing_time).toISOString()
        : null
    })
    .eq('paypal_subscription_id', paypalSubscriptionId);
}
```

---

## 6. Telegram Bot Changes

### Updated /start Handler

The key change: extract `telegram_handle` from `message.from.username`:

```typescript
// In src/routes/api/telegram/webhook/+server.ts
// Update the handleStartCommand function

async function handleStartCommand(ctx: RequestContext, message: TelegramMessage) {
  const text = message.text || '';
  const parts = text.split(' ');
  const token = parts.length > 1 ? parts[1] : null;

  const telegramUserId = message.from.id;
  const telegramUsername = message.from.username;  // ← Extract username from message
  const telegramFirstName = message.from.first_name;
  const chatId = message.chat.id;

  // Check if already linked
  const { data: existingCustomer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (existingCustomer) {
    // Update last_seen and return welcome back message
    await ctx.supabase
      .from('telegram_link_status')
      .upsert({
        customer_id: existingCustomer.id,
        is_linked: true,
        last_seen_at: new Date().toISOString()
      });

    await sendMessage(ctx, chatId,
      'Hey again! You\'re all set.\n\n' +
      '/skip to manage dates\n' +
      '/status to see what\'s coming\n' +
      '/help for everything else'
    );
    return;
  }

  // Not linked - need token
  if (!token) {
    await sendMessage(ctx, chatId,
      'Hey! Welcome to Frontier.\n\n' +
      'Head to frontier-meals.com to subscribe — we\'ll send you a link to connect your account here.\n\n' +
      'Questions? Hit up @noahchonlee'
    );
    return;
  }

  // Validate token
  const tokenHash = await sha256(token);
  const { data: deepLinkToken } = await ctx.supabase
    .from('telegram_deep_link_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .single();

  if (!deepLinkToken || new Date(deepLinkToken.expires_at) < new Date()) {
    await sendMessage(ctx, chatId,
      'Hmm, that link isn\'t working — might be expired.\n\n' +
      'Check your welcome email for a fresh one, or ping @noahchonlee if you need a hand.'
    );
    return;
  }

  // ============================================================================
  // KEY CHANGE: Extract telegram_handle from message.from.username
  // ============================================================================

  const extractedHandle = telegramUsername ? `@${telegramUsername}` : null;

  if (!extractedHandle) {
    // User has no Telegram username set
    await sendMessage(ctx, chatId,
      'Looks like you don\'t have a Telegram username set.\n\n' +
      'To use Frontier Meals, please:\n\n' +
      '1. Go to Settings > Edit Profile\n' +
      '2. Set a username\n' +
      '3. Come back and click the link again\n\n' +
      'Questions? Message @noahchonlee'
    );
    return;
  }

  // Link account: set BOTH telegram_user_id AND telegram_handle
  const { error: linkError } = await ctx.supabase
    .from('customers')
    .update({
      telegram_user_id: telegramUserId,
      telegram_handle: extractedHandle  // ← Set handle from message.from
    })
    .eq('id', deepLinkToken.customer_id);

  if (linkError) {
    console.error('[Telegram] Error linking account:', linkError);
    await sendMessage(ctx, chatId,
      'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.'
    );
    return;
  }

  console.log('[Telegram] Account linked:', {
    customer_id: deepLinkToken.customer_id,
    telegram_user_id: telegramUserId,
    telegram_handle: extractedHandle
  });

  // Mark token as used
  await ctx.supabase
    .from('telegram_deep_link_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  // Update telegram_link_status
  await ctx.supabase
    .from('telegram_link_status')
    .upsert({
      customer_id: deepLinkToken.customer_id,
      is_linked: true,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    });

  // Audit log (include extracted handle)
  await ctx.supabase.from('audit_log').insert({
    actor: `customer:${deepLinkToken.customer_id}`,
    action: 'telegram_linked',
    subject: `customer:${deepLinkToken.customer_id}`,
    metadata: {
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      telegram_handle: extractedHandle,
      source: 'deep_link'
    }
  });

  // Send diet selection onboarding
  await sendDietSelectionKeyboard(ctx, chatId);
}
```

---

## 7. Email Template Updates

### Updated telegram_link Template

```typescript
// src/lib/email/templates/telegram-link.ts
// Update to handle PayPal case where telegram_handle isn't collected at checkout

export function getTelegramLinkEmail(data: {
  customer_name: string;
  telegram_handle: string;  // Now accepts placeholder
  deep_link: string;
}) {
  // ... existing template code ...

  // Change the "Your Telegram Handle" section to be more generic:
  const handleSection = data.telegram_handle.startsWith('@')
    ? `
      <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.md}; border-radius: ${tokens.radius.md}; margin: ${tokens.spacing.md} 0;">
        <strong>Your Telegram Handle:</strong>
        <code style="font-family: monospace; background: ${tokens.bg.muted}; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">
          ${data.telegram_handle}
        </code>
      </div>
    `
    : `
      <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.md}; border-radius: ${tokens.radius.md}; margin: ${tokens.spacing.md} 0;">
        <p style="margin: 0;">
          <strong>📱 Your Telegram username will be detected automatically</strong> when you click the button above.
        </p>
      </div>
    `;

  // ... rest of template ...
}
```

### New subscription_suspended Template

```typescript
// src/lib/email/templates/subscription-suspended.ts
import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  buttonStyle,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle
} from './base';

export function getSubscriptionSuspendedEmail(data: {
  customer_name: string;
  reactivate_url: string;
}) {
  const subject = 'Your Frontier Meals Subscription is Suspended';
  const scheme = brandColors.red;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
    <h1>Subscription Suspended</h1>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Your Frontier Meals subscription has been suspended due to payment issues.</p>

    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">What this means</p>
      <p style="${infoBoxTextStyle('error')}">You won't receive daily QR codes until your payment method is updated.</p>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.reactivate_url}" style="${buttonStyle(scheme)}">
            Update Payment Method
          </a>
        </td>
      </tr>
    </table>

    <p style="${styles.p}">Questions? Reply to this email or message @noahchonlee on Telegram.</p>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: 'Action required: update your payment method',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(scheme)
  });

  return { subject, html };
}
```

### Register New Template

```typescript
// src/lib/email/templates/index.ts
import { getSubscriptionSuspendedEmail } from './subscription-suspended';

const templates = {
  // ... existing templates ...
  'subscription_suspended': getSubscriptionSuspendedEmail,
};
```

---

## 8. Environment Variables

### Required Variables

```bash
# .env (local development)

# PayPal API Credentials
PAYPAL_CLIENT_ID=AX...your-client-id
PAYPAL_CLIENT_SECRET=EK...your-client-secret
PAYPAL_PLAN_ID=P-...your-plan-id
PAYPAL_WEBHOOK_ID=...your-webhook-id
PAYPAL_MODE=sandbox  # or 'live' for production
```

### Cloudflare Workers Secrets

```bash
# Set via Wrangler CLI
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_PLAN_ID
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put PAYPAL_MODE
```

### PayPal Dashboard Setup

1. **Create REST API App**: https://developer.paypal.com/dashboard/applications
2. **Create Product**: Via API or Dashboard
3. **Create Plan**: Monthly subscription plan with pricing
4. **Configure Webhook**:
   - URL: `https://frontiermeals.com/api/paypal/webhook`
   - Events: All `BILLING.SUBSCRIPTION.*` and `PAYMENT.SALE.COMPLETED`
   - Copy Webhook ID

---

## 9. Testing Strategy

### Sandbox Testing

1. **Create Sandbox Accounts**:
   - Seller account (receives payments)
   - Buyer account (for testing subscriptions)

2. **Configure Webhook for Local Development**:
   ```bash
   # Start local server
   pnpm run dev

   # Expose via ngrok
   ngrok http 5173

   # Configure PayPal webhook to ngrok URL
   # https://xxxxx.ngrok.io/api/paypal/webhook
   ```

3. **Test Full Flow**:
   - Create subscription → approve → ACTIVATED webhook
   - Wait for payment → PAYMENT.SALE.COMPLETED webhook
   - Test failure → PAYMENT.FAILED webhook
   - Cancel subscription → CANCELLED webhook

### Test Cases

```typescript
// src/routes/api/paypal/webhook/__tests__/webhook.test.ts

describe('PayPal Webhook Handler', () => {
  describe('BILLING.SUBSCRIPTION.ACTIVATED', () => {
    it('creates customer with paypal_payer_id', async () => {
      // Test implementation
    });

    it('creates subscription with paypal_subscription_id', async () => {
      // Test implementation
    });

    it('sets telegram_handle to null (resolved later by bot)', async () => {
      // Test implementation
    });

    it('sends telegram_link email', async () => {
      // Test implementation
    });

    it('handles duplicate events (idempotency)', async () => {
      // Test implementation
    });
  });

  describe('Telegram Bot /start', () => {
    it('extracts username from message.from.username', async () => {
      // Test implementation
    });

    it('handles users without username', async () => {
      // Test implementation
    });

    it('updates customer.telegram_handle', async () => {
      // Test implementation
    });
  });
});
```

---

## 10. Implementation Checklist

### Phase 1: Infrastructure (Days 1-3)

- [ ] Run database migration (`20260129000000_add_paypal_support.sql`)
- [ ] Add PayPal environment variables
- [ ] Create PayPal Sandbox accounts
- [ ] Create PayPal Product and Plan
- [ ] Configure PayPal Webhook

### Phase 2: API Implementation (Days 4-7)

- [ ] Implement `src/lib/integrations/paypal.ts`
- [ ] Implement `/api/paypal/create-subscription`
- [ ] Implement `/api/paypal/webhook`
- [ ] Update success page for both providers
- [ ] Add `subscription_suspended` email template

### Phase 3: Telegram Bot Updates (Days 8-9)

- [ ] Update `/start` handler to extract `message.from.username`
- [ ] Handle users without username (prompt to set one)
- [ ] Update `telegram_link` email template

### Phase 4: Testing (Days 10-12)

- [ ] Test full PayPal checkout flow in sandbox
- [ ] Test webhook handling for all event types
- [ ] Test Telegram username extraction
- [ ] Test dunning email flow
- [ ] Test QR code issuance for PayPal customers

### Phase 5: Launch (Day 13+)

- [ ] Switch PayPal mode from `sandbox` to `live`
- [ ] Update production secrets
- [ ] Add PayPal button to landing page
- [ ] Monitor webhook success rates
- [ ] Monitor customer conversion by provider

---

## Summary

### Key Architectural Decisions

1. **Username Resolution**: Extracted from `message.from.username` when user interacts with bot - more reliable than user input

2. **Deep Link Token**: Same pattern as Stripe - generated pre-checkout, stored in `custom_id`, returned in success URL

3. **Dual Provider Support**: Schema supports both Stripe and PayPal via `payment_provider` discriminator

4. **Idempotency**: Same `webhook_events` table pattern for both providers

5. **Self-Service**: PayPal customers directed to `paypal.com/myaccount/autopay` for billing management

### Migration Path

1. **Keep Stripe working** - no changes to existing customers
2. **Add PayPal as option** - "Subscribe with PayPal" button
3. **Monitor adoption** - track conversion by provider
4. **Optional: Phase out Stripe** - only after validating PayPal works well

### Error Handling

| Scenario | Handling |
|----------|----------|
| User has no Telegram username | Bot prompts user to set one |
| Token expired | Cron job sends reminder with fresh token |
| Webhook fails | Tracked in `webhook_events.status`, PayPal retries 25x |
| Payment fails | Dunning emails sent, subscription suspended after threshold |
