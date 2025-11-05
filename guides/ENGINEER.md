# Engineer — Quickstart Guide

**Role:** Implementation, migrations, cron jobs, key rotation, incident response

---

## Stack Quick Reference

| Layer | Technology | Commands |
|-------|-----------|----------|
| **App** | SvelteKit | `pnpm dev`, `pnpm build`, `pnpm preview` |
| **Database** | Supabase Postgres | `supabase migration new <name>`, `supabase db push` |
| **Payments** | Stripe | `stripe listen --forward-to localhost:5173/api/stripe/webhook` |
| **Email** | Resend | API key in `.env` |
| **Messaging** | Telegram Bot | `curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook` |
| **Infra** | Vercel + Supabase | `vercel`, `supabase start` |

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/frontier-meals/consumer-app.git
cd consumer-app
pnpm install
```

### 2. Environment Variables

**`.env.local`:**
```bash
# Supabase
PUBLIC_SUPABASE_URL=https://xyz.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_API_KEY=re_...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_SECRET_TOKEN=<random_string>

# Auth
SESSION_SECRET=<64_byte_base64>
CSRF_SECRET=<64_byte_base64>

# QR Signing (ES256)
QR_PRIVATE_KEY=<base64_encoded_pem>
QR_PUBLIC_KEY=<base64_encoded_pem>

# Kiosk Signing (ES256)
KIOSK_PRIVATE_KEY=<base64_encoded_pem>
KIOSK_PUBLIC_KEY=<base64_encoded_pem>
```

### 3. Start Supabase

```bash
supabase start
# Outputs local DB URL + anon key
```

### 4. Run Migrations

```bash
supabase db push
```

### 5. Seed Data (optional)

```bash
psql $DATABASE_URL -f seeds/staff_accounts.sql
psql $DATABASE_URL -f seeds/email_templates.sql
```

### 6. Start Dev Server

```bash
pnpm dev
# http://localhost:5173
```

### 7. Stripe Webhook Forwarding

```bash
stripe listen --forward-to localhost:5173/api/stripe/webhook
# Outputs webhook signing secret → add to .env.local
```

---

## Database Migrations

### Create New Migration

```bash
supabase migration new add_customer_notes
# Creates: supabase/migrations/20251115120000_add_customer_notes.sql
```

**Migration Template:**
```sql
-- Add customer_notes column
ALTER TABLE customers ADD COLUMN notes TEXT;

-- Rollback:
-- ALTER TABLE customers DROP COLUMN notes;
```

### Apply Migration (Local)

```bash
supabase db push
```

### Apply Migration (Production)

```bash
# Via Supabase CLI (linked to project)
supabase db push --linked

# OR via Supabase Dashboard
# → Database → Migrations → Run new migration
```

### Rollback Migration

```sql
-- Manually run rollback SQL from migration file
-- NO automated rollback; use explicit SQL commands
```

---

## Cron Jobs (Supabase + Vercel)

### Daily QR Issuance (12 PM PT)

**Supabase Edge Function + pg_cron:**

```sql
-- Schedule cron job
SELECT cron.schedule(
  'daily-qr-issuance',
  '0 12 * * *',  -- 12 PM PT (assumes DB in PT timezone)
  $$
  SELECT net.http_post(
    url := 'https://api.frontier-meals.com/api/cron/issue-qr',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
```

**API Route:** `POST /api/cron/issue-qr`

```typescript
// src/routes/api/cron/issue-qr/+server.ts
export async function POST({ request }) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Issue QRs for all active subscriptions
  const customers = await db.customers.findMany({
    where: { subscriptions: { some: { status: 'active' } } }
  });

  for (const customer of customers) {
    await issueQRForToday(customer);
  }

  return json({ success: true, count: customers.length });
}
```

### Hourly Telegram Link Check

**Supabase pg_cron:**

```sql
SELECT cron.schedule(
  'hourly-telegram-check',
  '0 * * * *',  -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://api.frontier-meals.com/api/cron/telegram-check',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
```

**Logic:**
- Find customers where `telegram_link_status.is_linked = FALSE`
- AND `subscriptions.created_at < NOW() - INTERVAL '1 hour'`
- Send `handle_confirm` email via Resend

---

## Key Generation & Rotation

### Generate New ES256 Key Pair

```bash
# QR signing key
openssl ecparam -genkey -name prime256v1 -noout -out qr-es256-private.pem
openssl ec -in qr-es256-private.pem -pubout -out qr-es256-public.pem

# Kiosk signing key
openssl ecparam -genkey -name prime256v1 -noout -out kiosk-es256-private.pem
openssl ec -in kiosk-es256-private.pem -pubout -out kiosk-es256-public.pem

# Encode for env vars
cat qr-es256-private.pem | base64
cat qr-es256-public.pem | base64
```

### Generate Symmetric Secrets

```bash
# SESSION_SECRET
openssl rand -base64 64

# CSRF_SECRET
openssl rand -base64 64
```

### Rotation Schedule (Quarterly)

**90 days before expiry:**

1. Generate new keys (append `_NEXT` suffix)
2. Deploy new keys as env vars:
   ```bash
   vercel env add QR_PRIVATE_KEY_NEXT
   vercel env add QR_PUBLIC_KEY_NEXT
   # ... etc
   ```
3. Update code to sign with `_NEXT` keys, verify with BOTH old and new
4. Deploy
5. Wait 7 days (grace period)
6. Remove old keys from env vars
7. Deploy (verification now uses only new keys)

**Code Example (Dual-Key Verification):**
```typescript
function verifyQRToken(token: string) {
  const publicKey = process.env.QR_PUBLIC_KEY;
  const publicKeyNext = process.env.QR_PUBLIC_KEY_NEXT;

  try {
    return jwt.verify(token, publicKey, { algorithms: ['ES256'] });
  } catch (err) {
    if (publicKeyNext) {
      return jwt.verify(token, publicKeyNext, { algorithms: ['ES256'] });
    }
    throw err;
  }
}
```

---

## Webhook Testing

### Stripe Webhook (Local)

```bash
# Terminal 1: Start dev server
pnpm dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:5173/api/stripe/webhook
```

**Trigger Test Event:**
```bash
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
```

### Telegram Webhook (Local)

```bash
# Use ngrok for public URL
ngrok http 5173

# Set webhook
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://abc123.ngrok.io/api/telegram/webhook \
  -d secret_token=<random_string>
```

---

## Testing Strategy

### Unit Tests (Vitest)

**Run:**
```bash
pnpm test
```

**Example:** `src/lib/qr.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { issueQRToken, verifyQRToken } from './qr';

describe('QR Token Issuance', () => {
  it('generates valid JWT with correct claims', () => {
    const customerId = 'cust-123';
    const serviceDate = '2025-11-15';

    const token = issueQRToken(customerId, serviceDate);
    const claims = verifyQRToken(token);

    expect(claims.sub).toBe(customerId);
    expect(claims.service_date).toBe(serviceDate);
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
  });
});
```

### Integration Tests (Playwright)

**Run:**
```bash
pnpm test:integration
```

**Example:** `tests/stripe-webhook.test.ts`
```typescript
import { test, expect } from '@playwright/test';
import Stripe from 'stripe';

test('checkout.session.completed creates customer', async ({ request }) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Create test checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    // ... config
  });

  // Simulate webhook
  const event = await stripe.webhooks.constructEvent(
    JSON.stringify({ type: 'checkout.session.completed', data: { object: session } }),
    'signature',
    process.env.STRIPE_WEBHOOK_SECRET
  );

  const response = await request.post('/api/stripe/webhook', {
    data: event,
    headers: { 'Stripe-Signature': 'test-sig' }
  });

  expect(response.status()).toBe(200);

  // Verify customer created in DB
  const customer = await db.customers.findOne({ stripe_customer_id: session.customer });
  expect(customer).toBeTruthy();
});
```

### E2E Tests (Playwright)

**Run:**
```bash
pnpm test:e2e
```

**Example:** `tests/qr-redemption.spec.ts`
```typescript
test('full QR redemption flow', async ({ page }) => {
  // 1. Subscribe via Stripe Checkout (use test mode)
  // 2. Complete Telegram onboarding
  // 3. Receive QR email (check test inbox)
  // 4. Navigate to /kiosk
  // 5. Scan QR (simulate camera input)
  // 6. Verify success message
  // 7. Check entitlements.meals_redeemed = 1 in DB
});
```

---

## Deployment

### Vercel (Production)

**Deploy:**
```bash
vercel --prod
```

**Environment Variables:**
```bash
vercel env add STRIPE_SECRET_KEY production
vercel env add RESEND_API_KEY production
# ... etc
```

**Domain:**
- App: `https://app.frontier-meals.com`
- API: `https://api.frontier-meals.com` (same app, different path)

### Supabase (Production)

**Link Project:**
```bash
supabase link --project-ref <project_id>
```

**Push Migrations:**
```bash
supabase db push --linked
```

---

## Monitoring & Debugging

### Vercel Logs

**Real-time:**
```bash
vercel logs --follow
```

**Filter by function:**
```bash
vercel logs --since 1h | grep '/api/stripe/webhook'
```

### Supabase Logs

**Dashboard:**
https://supabase.com/dashboard/project/<project_id>/logs

**Query:**
```sql
-- Recent webhook events
SELECT * FROM webhook_events WHERE created_at > NOW() - INTERVAL '1 hour';

-- Failed jobs
SELECT * FROM webhook_events WHERE status = 'failed';
```

### Stripe Dashboard

**Webhooks:**
https://dashboard.stripe.com/webhooks

**View attempts, errors, re-send**

---

## Incident Response

### QR Job Failure

**See:** `runbooks/QR-JOB-FAILED.md`

**Quick Fix:**
```bash
# Manually trigger job
curl -X POST https://api.frontier-meals.com/api/cron/issue-qr \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Webhook Backlog

**See:** `runbooks/WEBHOOK-BACKLOG.md`

**Check backlog:**
```sql
SELECT COUNT(*) FROM webhook_events WHERE status = 'processing' AND created_at < NOW() - INTERVAL '5 minutes';
```

**Re-process:**
```bash
node scripts/retry-webhooks.js --since=1h
```

### Key Compromise

**See:** `runbooks/KEY-COMPROMISE.md`

**Immediate Actions:**
1. Generate new key pair
2. Deploy as `*_NEXT` keys
3. Revoke old keys after 1 hour (not 7 days)
4. Audit all redemptions/sessions in compromised window

---

## Related Documents

- `specs/01-DATA-MODEL.md` — Schema, migrations
- `specs/02-API-CONTRACTS.md` — Webhook payloads
- `specs/03-AUTHENTICATION.md` — JWT signing, key rotation
- `runbooks/QR-JOB-FAILED.md` — Recovery procedures

---

**END OF ENGINEER QUICKSTART**
