# PayPal Migration Analysis: Stripe → PayPal

**Generated:** 2026-01-29
**Status:** Research Complete - Awaiting Decision
**Recommendation:** **Do NOT migrate** (see Executive Summary)

---

## Executive Summary

After comprehensive research across API architecture, data models, user flows, webhooks, and migration strategies, **we recommend against migrating from Stripe to PayPal** for Frontier Meals.

### Key Findings

| Dimension | Stripe (Current) | PayPal | Impact |
|-----------|------------------|--------|--------|
| **Custom Fields** | ✅ Native (telegram_handle inline) | ❌ None (must collect separately) | **Critical** - breaks UX |
| **Guest Checkout** | ✅ Yes (card only) | ❌ No (PayPal account required) | **High** - conversion loss |
| **Customer ID** | ✅ Stable (`cus_xxx`) | ❌ Email-based (can change) | **High** - schema complexity |
| **Billing Portal** | ✅ Branded, embeddable | ❌ PayPal.com only | **Medium** - UX degradation |
| **Webhook DX** | ✅ Stripe CLI, local testing | ❌ Web simulator, tunneling | **Medium** - dev friction |
| **Analytics** | ✅ MRR, cohorts, AI insights | ⚠️ Basic reports only | **Medium** - visibility loss |
| **Dunning** | ✅ Custom emails, Smart Retries | ⚠️ Fixed 5-day schedule | **Medium** - less control |
| **SDK** | ✅ Active, well-documented | ⚠️ Node SDK deprecated | **Medium** - maintenance |

### The Verdict

**If you must support PayPal users:** Add PayPal as a payment method *through Stripe* (`payment_method_types: ['card', 'paypal']`). This gives you:
- PayPal acceptance for customers who want it
- All Stripe analytics and tooling retained
- Single webhook handler, single reconciliation flow
- No migration risk or customer churn

**Do NOT do a full migration** unless there's a compelling business reason (investor requirement, target market demands PayPal-only).

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [PayPal API Architecture](#2-paypal-api-architecture)
3. [Data Model Comparison](#3-data-model-comparison)
4. [Webhook Architecture](#4-webhook-architecture)
5. [User Flow Comparison](#5-user-flow-comparison)
6. [Migration Strategy](#6-migration-strategy)
7. [Implementation Checklist](#7-implementation-checklist)
8. [Decision Matrix](#8-decision-matrix)

---

## 1. Current Architecture

### Stripe Integration Points

```
src/routes/api/stripe/
├── create-checkout/+server.ts    # Checkout session creation
└── webhook/+server.ts            # 5 event handlers

Handles:
├── checkout.session.completed    → Create customer, subscription, telegram link
├── invoice.paid                  → Update subscription period dates
├── invoice.payment_failed        → Dunning emails (soft → retry → final)
├── customer.subscription.updated → Sync status changes
└── customer.subscription.deleted → Mark canceled, send notice
```

### Database Schema (Current)

```sql
customers
├── stripe_customer_id TEXT UNIQUE NOT NULL
├── email TEXT NOT NULL
├── telegram_handle TEXT
└── telegram_user_id BIGINT UNIQUE

subscriptions
├── stripe_subscription_id TEXT UNIQUE NOT NULL
├── status TEXT CHECK (active|past_due|unpaid|canceled|trialing)
├── current_period_start TIMESTAMPTZ
└── current_period_end TIMESTAMPTZ

webhook_events
├── source TEXT CHECK (stripe|telegram|resend)
├── event_id TEXT UNIQUE NOT NULL
└── status TEXT CHECK (processing|processed|failed)
```

### Key Business Logic

1. **Telegram Handle Collection**: Collected inline during Stripe checkout via `custom_fields`
2. **Deep Link Token**: Generated pre-checkout, passed via `metadata`, returned in success URL
3. **Period Tracking**: Fetched from `subscription.items.data[0].current_period_start/end`
4. **Idempotency**: PostgreSQL unique constraint on `webhook_events.event_id`

---

## 2. PayPal API Architecture

### API Structure

PayPal uses a **three-tier hierarchy** (similar to Stripe):

| PayPal | Stripe | Description |
|--------|--------|-------------|
| Product | Product | The offering (e.g., "Frontier Meals Monthly") |
| Plan | Price | Billing cycles, pricing, trials, setup fees |
| Subscription | Subscription | Customer's active billing agreement |

### SDK Status

**Critical:** The official PayPal Node.js SDK is **deprecated**.

**Recommended approach:** Direct REST API calls via `fetch` or `axios`:

```typescript
// PayPal REST API (no SDK)
const response = await fetch('https://api-m.paypal.com/v1/billing/subscriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plan_id: 'P-XXXXX',
    custom_id: 'your-identifier',
    application_context: {
      return_url: 'https://frontiermeals.com/success',
      cancel_url: 'https://frontiermeals.com'
    }
  })
});
```

### Authentication

OAuth 2.0 client credentials flow:
- Exchange `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` for access token
- Tokens expire in 15 minutes to 8 hours
- Must refresh before expiry

### Base URLs

- **Sandbox:** `https://api-m.sandbox.paypal.com`
- **Production:** `https://api-m.paypal.com`

---

## 3. Data Model Comparison

### Subscription States

| PayPal Status | Stripe Equivalent | Description |
|---------------|-------------------|-------------|
| `APPROVAL_PENDING` | *(none)* | Awaiting customer approval |
| `APPROVED` | `trialing` | Approved but not yet active |
| `ACTIVE` | `active` | Billing normally |
| `SUSPENDED` | `past_due` | Payment failures exceeded threshold |
| `CANCELLED` | `canceled` | Permanently terminated |
| `EXPIRED` | *(none)* | Finite plan completed all cycles |

### Period Tracking

**Critical Difference:** PayPal does NOT have `current_period_start`/`current_period_end` on subscriptions.

| Data Point | Stripe | PayPal |
|------------|--------|--------|
| Period Start | `items.data[0].current_period_start` | `billing_info.last_payment.time` |
| Period End | `items.data[0].current_period_end` | `billing_info.next_billing_time` |
| Format | Unix seconds (integer) | ISO 8601 string |

### Timestamps

```javascript
// Stripe (Unix seconds)
current_period_start: 1730390400

// PayPal (ISO 8601)
next_billing_time: "2026-02-15T10:00:00Z"
```

PostgreSQL handles both natively - no conversion needed for ISO 8601.

### IDs to Persist

| PayPal ID | Format | Purpose |
|-----------|--------|---------|
| `subscription_id` | `I-XXXXXXXXX` | Primary subscription identifier |
| `plan_id` | `P-XXXXXXXXX` | References billing plan template |
| `payer_id` | `XXXXXXXXX` | Customer's PayPal account (optional) |

**Critical:** PayPal has no stable customer ID like Stripe's `cus_xxx`. Use email as fallback.

### Recommended Schema Changes

```sql
-- Add PayPal support to existing tables
ALTER TABLE customers
  ADD COLUMN payment_provider TEXT CHECK (payment_provider IN ('stripe', 'paypal')),
  ADD COLUMN paypal_payer_id TEXT UNIQUE,
  ALTER COLUMN stripe_customer_id DROP NOT NULL;

ALTER TABLE subscriptions
  ADD COLUMN payment_provider TEXT CHECK (payment_provider IN ('stripe', 'paypal')),
  ADD COLUMN paypal_subscription_id TEXT UNIQUE,
  ADD COLUMN paypal_plan_id TEXT,
  ADD COLUMN next_billing_time TIMESTAMPTZ,
  ADD COLUMN outstanding_balance NUMERIC(10,2) DEFAULT 0,
  ALTER COLUMN stripe_subscription_id DROP NOT NULL,
  DROP CONSTRAINT subscriptions_status_check,
  ADD CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'past_due', 'unpaid', 'canceled', 'trialing',
               'approval_pending', 'approved', 'suspended', 'expired')
  );

ALTER TABLE webhook_events
  DROP CONSTRAINT webhook_events_source_check,
  ADD CONSTRAINT webhook_events_source_check CHECK (
    source IN ('stripe', 'telegram', 'resend', 'paypal')
  );

CREATE INDEX idx_subscription_paypal_id ON subscriptions(paypal_subscription_id);
CREATE INDEX idx_subscription_provider ON subscriptions(payment_provider);
```

---

## 4. Webhook Architecture

### Event Mapping

| PayPal Event | Stripe Equivalent | Handler Action |
|--------------|-------------------|----------------|
| `BILLING.SUBSCRIPTION.ACTIVATED` | `checkout.session.completed` | Create customer, subscription, send telegram link |
| `PAYMENT.SALE.COMPLETED` | `invoice.paid` | Update period dates, track payment |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | `invoice.payment_failed` | Dunning emails, set status |
| `BILLING.SUBSCRIPTION.UPDATED` | `customer.subscription.updated` | Sync status changes |
| `BILLING.SUBSCRIPTION.SUSPENDED` | *(new)* | Handle suspension state |
| `BILLING.SUBSCRIPTION.CANCELLED` | `customer.subscription.deleted` | Mark canceled, send notice |

### Signature Verification

**Critical Difference:** PayPal uses RSA-SHA256 (asymmetric) vs Stripe's HMAC-SHA256 (symmetric).

```typescript
// Stripe (current)
const event = await stripe.webhooks.constructEventAsync(body, signature, secret);

// PayPal (new)
async function verifyPayPalWebhook(body: string, headers: Headers): Promise<boolean> {
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const certUrl = headers.get('paypal-cert-url');
  const signature = headers.get('paypal-transmission-sig');

  // Security: Verify cert URL is from PayPal
  if (!certUrl?.includes('.paypal.com')) {
    throw new Error('Invalid certificate URL');
  }

  // Compute CRC32 of raw body
  const crc = crc32(Buffer.from(body)).toString();

  // Build verification message
  const message = `${transmissionId}|${transmissionTime}|${PAYPAL_WEBHOOK_ID}|${crc}`;

  // Fetch and cache certificate (1-hour TTL)
  const certificate = await fetchCertificate(certUrl);

  // Verify RSA-SHA256 signature
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(message);
  return verifier.verify(certificate, signature, 'base64');
}
```

### Retry Policy

| Aspect | Stripe | PayPal |
|--------|--------|--------|
| Max Attempts | ~60 over 3 days | 25 over 3 days |
| Backoff | Exponential (1h, 2h, 4h...) | Exponential (undocumented) |
| Success Code | Any 2xx | Any 2xx |

### Idempotency

Same pattern works for both - track `event_id` in `webhook_events` table with unique constraint.

### Dunning Flow

| Day | Stripe | PayPal |
|-----|--------|--------|
| 0 | Payment fails, Smart Retry queued | Payment fails |
| 1-3 | First retry (ML-optimized timing) | - |
| 5 | Second retry | First retry |
| 7 | Third retry | - |
| 10 | Fourth retry | Second retry |
| 10+ | `past_due` → `unpaid` → `canceled` | `SUSPENDED` (reactivatable) |

**PayPal advantage:** Suspended subscriptions can be reactivated without re-subscribing.
**Stripe advantage:** Custom dunning emails, Smart Retries adapt to decline reason.

---

## 5. User Flow Comparison

### Checkout Experience

| Aspect | Stripe | PayPal |
|--------|--------|--------|
| **Flow** | Full-page redirect to checkout.stripe.com | Popup (desktop) / Redirect (mobile) |
| **Custom Fields** | ✅ Up to 3 fields inline | ❌ Must collect before/after |
| **Guest Checkout** | ✅ Card without account | ❌ PayPal account required |
| **Terms Checkbox** | ✅ Custom message + link | ❌ Generic PayPal terms |
| **Return URL Params** | ✅ Custom (`&t=uuid`) | ❌ PayPal-controlled only |

### Deep Link Token Flow

**Current (Stripe):**
```
1. Generate UUID token before checkout
2. Pass in metadata: { deep_link_token: uuid }
3. Success URL: /success?session_id={ID}&t={uuid}
4. Success page displays link immediately (no API call)
```

**PayPal (would require):**
```
1. Collect telegram_handle on landing page (pre-checkout)
2. Generate token, store in DB
3. Create subscription with custom_id: { token_hash }
4. Success URL: /success?subscription_id={ID}
5. Success page must call API to retrieve token (adds latency)
```

### Self-Service Portal

| Feature | Stripe | PayPal |
|---------|--------|--------|
| **Location** | Merchant-generated link | PayPal.com |
| **Branding** | ✅ Customizable | ❌ PayPal branding |
| **Cancel** | ✅ Immediate or period end | ✅ Via PayPal.com |
| **Update Payment** | ✅ Add/remove cards | ✅ Via PayPal.com |
| **Invoices** | ✅ Download PDFs | ❌ Must contact merchant |

**Impact:** Current Telegram bot sends Stripe portal link. With PayPal, would need to say "Log into PayPal.com → Settings → Subscriptions" - worse UX.

---

## 6. Migration Strategy

### If Migration is Required

**DO NOT do a hard cutover.** Follow this approach:

#### Phase 1: Parallel Implementation (Weeks 1-4)
- Add PayPal webhook handler at `/api/paypal/webhook`
- Update database schema for dual-provider support
- Implement PayPal checkout flow (with pre-checkout telegram handle form)
- Test in sandbox environment

#### Phase 2: Soft Launch (Weeks 5-8)
- Offer PayPal as secondary option for new signups
- "Subscribe with Card" (primary) + "Subscribe with PayPal" (secondary)
- Monitor conversion rates, webhook reliability

#### Phase 3: Customer Communication (Weeks 9-12)
- Send 60-day advance notice to existing Stripe customers
- Explain why, what they need to do, offer incentive for early migration
- **Expect 10-20% churn** from customers who won't re-authenticate

#### Phase 4: Migration Window (Weeks 13-16)
- Existing customers migrate by re-entering payment info
- Cancel Stripe subscriptions at period end
- Create new PayPal subscriptions

#### Phase 5: Deprecation (Week 17+)
- Stop accepting new Stripe subscriptions
- Continue processing existing Stripe customers until natural churn
- Maintain both webhook handlers indefinitely

### What Cannot Be Migrated

| Data | Transferable? |
|------|---------------|
| Customer email, name | ✅ Yes (from your DB) |
| Telegram handle | ✅ Yes (from your DB) |
| Payment methods | ❌ No (must re-enter) |
| Subscription history | ✅ Yes (for records) |
| Billing agreement | ❌ No (must re-authorize) |

### Legal/Compliance

- [ ] Update Terms of Service to reference PayPal
- [ ] Update Privacy Policy (PayPal data sharing)
- [ ] Update refund policy (PayPal's 180-day dispute window)
- [ ] Review California auto-renewal laws compliance

---

## 7. Implementation Checklist

### If Adding PayPal Support

#### Environment Variables
```bash
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
PAYPAL_WEBHOOK_ID=xxx
PAYPAL_MODE=sandbox|live
```

#### New Files
```
src/routes/api/paypal/
├── create-subscription/+server.ts
└── webhook/+server.ts

src/lib/integrations/
└── paypal.ts  # OAuth, API helpers
```

#### Database Migration
```bash
supabase migration new add_paypal_support
# Apply schema changes from Section 3
```

#### Webhook Handlers
- [ ] `handleSubscriptionActivated` (create customer, subscription, telegram link)
- [ ] `handlePaymentCompleted` (update period dates)
- [ ] `handlePaymentFailed` (dunning emails)
- [ ] `handleSubscriptionUpdated` (sync status)
- [ ] `handleSubscriptionSuspended` (new state)
- [ ] `handleSubscriptionCancelled` (mark canceled)

#### Testing
- [ ] PayPal sandbox account setup
- [ ] Webhook configuration in Developer Dashboard
- [ ] Full lifecycle test: activation → payment → failure → suspension → cancellation
- [ ] Idempotency test (duplicate events)
- [ ] Out-of-order event handling

---

## 8. Decision Matrix

### When to Stay with Stripe (Recommended)

| Criterion | Score |
|-----------|-------|
| Need inline custom field collection | +10 |
| Want guest checkout (no account) | +8 |
| Value developer experience | +7 |
| Need branded self-service portal | +6 |
| Want advanced analytics (MRR, cohorts) | +5 |
| Prefer predictable dunning control | +4 |
| **Total** | **+40** |

### When to Add PayPal

| Criterion | Score |
|-----------|-------|
| Customers explicitly demand PayPal | +8 |
| Target market prefers PayPal (EU, LATAM) | +6 |
| Brand trust important (PayPal recognition) | +4 |
| Slightly lower international fees | +2 |
| **Total** | **+20** |

### Recommendation Matrix

| Scenario | Recommendation |
|----------|----------------|
| No specific PayPal demand | **Stay Stripe-only** |
| Some customers ask for PayPal | **Add PayPal through Stripe** (`payment_method_types: ['card', 'paypal']`) |
| Majority prefer PayPal | **Dual implementation** (Stripe primary, PayPal secondary) |
| Investor/regulatory requires PayPal-only | **Full migration** (accept UX trade-offs) |

---

## Appendix: Key Sources

### PayPal Documentation
- [Subscriptions API v1](https://developer.paypal.com/docs/api/subscriptions/v1/)
- [Webhooks Event Names](https://developer.paypal.com/api/rest/webhooks/event-names/)
- [Signature Verification](https://developer.paypal.com/api/rest/webhooks/)
- [Payment Failure Retry](https://developer.paypal.com/docs/subscriptions/customize/payment-failure-retry/)

### Stripe Documentation
- [Add PayPal to Stripe](https://docs.stripe.com/payments/paypal)
- [PayPal Payout Reconciliation](https://docs.stripe.com/payments/paypal/payout-reconciliation)

### Migration Case Studies
- [Baremetrics: PayPal to Stripe Migration](https://baremetrics.com/blog/how-to-migrate-customer-data-from-paypal-to-stripe-everything-you-need-to-know)
- [DepositFix: Migration Guide](https://www.depositfix.com/blog/how-to-migrate-from-paypal-to-stripe)

---

## Conclusion

**For Frontier Meals specifically:**

1. **Telegram handle collection** is critical to your user flow. PayPal's lack of custom fields would require a pre-checkout form, degrading UX.

2. **Deep link on success page** works seamlessly with Stripe's custom URL parameters. PayPal would require an API call, adding latency.

3. **Self-service via Telegram bot** integrates cleanly with Stripe's portal. PayPal would redirect users to PayPal.com.

4. **Your codebase** is already well-architected for Stripe with idempotent webhooks, period date validation, and race condition handling. Replicating this for PayPal is significant effort.

**Recommendation:** Stay with Stripe. If PayPal acceptance is needed, use Stripe's built-in PayPal integration to get the best of both worlds.
