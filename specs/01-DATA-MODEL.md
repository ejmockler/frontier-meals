# Frontier Meals — Data Model Specification

**Version:** 1.0
**Date:** 2025-10-26
**Scope:** Consumer-handling slice only

---

## Schema Overview

```
[staff_accounts]            ← Admin-only auth
[customers]                 ← Subscriber identity (Stripe + Telegram)
[subscriptions]             ← Stripe subscription lifecycle
[entitlements]              ← Daily meal allowances
[skips]                     ← User-requested skip dates
[qr_tokens]                 ← Daily QR codes (ES256 JWT metadata)
[redemptions]               ← Kiosk scan history
[email_templates]           ← Versioned Resend templates
[email_template_previews]   ← Preview/audit trail
[telegram_link_status]      ← Bot onboarding state
[handle_update_tokens]      ← Passwordless correction links
[audit_log]                 ← Security events
[webhook_events]            ← Stripe/Telegram idempotency
```

---

## Table Definitions

### staff_accounts

**Purpose:** Admin-only authentication (passwordless magic link)

```sql
CREATE TABLE staff_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ops')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_staff_email ON staff_accounts(email);
```

**RLS:**
- Service role only (no public access)

---

### customers

**Purpose:** Subscriber identity; links Stripe + Telegram

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  telegram_handle TEXT,
  telegram_user_id BIGINT UNIQUE,
  dietary_flags JSONB DEFAULT '{}',
  allergies BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_stripe_id ON customers(stripe_customer_id);
CREATE INDEX idx_customer_telegram_id ON customers(telegram_user_id);
CREATE INDEX idx_customer_email ON customers(email);

COMMENT ON COLUMN customers.dietary_flags IS '{"diet": "vegan", "dairy_free": true, "gluten_free": false}';
COMMENT ON COLUMN customers.allergies IS 'If true, customer must DM @noahchonlee';
```

**RLS:**
- Service role: full access
- Customer (future API): read own row via `auth.uid() = id`

---

### subscriptions

**Purpose:** Stripe subscription lifecycle tracking

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'unpaid', 'canceled', 'trialing')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscription_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscription_status ON subscriptions(status);
```

**RLS:**
- Service role: full access
- Customer: read own via `customer_id = auth.uid()`

**Lifecycle:**
1. `checkout.session.completed` → INSERT with `status = 'active'`
2. `invoice.payment_failed` → UPDATE `status = 'past_due'`
3. `customer.subscription.updated` → UPDATE `status`, `current_period_*`
4. `customer.subscription.deleted` → UPDATE `status = 'canceled'`

---

### entitlements

**Purpose:** Daily meal allowances (upserted by cron at 08:00 PT)

```sql
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  meals_allowed INT DEFAULT 1,
  meals_redeemed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, service_date)
);

CREATE INDEX idx_entitlement_customer_date ON entitlements(customer_id, service_date);
CREATE INDEX idx_entitlement_service_date ON entitlements(service_date);
```

**RLS:**
- Service role: full access
- Customer: read own via `customer_id = auth.uid()`

**Logic:**
- Upserted daily for active subscriptions (status = 'active')
- Skipped dates get `meals_allowed = 0`
- Kiosk increments `meals_redeemed` on valid scan

---

### skips

**Purpose:** User-requested skip dates (from Telegram /skip)

```sql
CREATE TABLE skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  skip_date DATE NOT NULL,
  source TEXT DEFAULT 'telegram' CHECK (source IN ('telegram', 'admin')),
  eligible_for_reimbursement BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, skip_date)
);

CREATE INDEX idx_skip_customer_date ON skips(customer_id, skip_date);
CREATE INDEX idx_skip_eligible ON skips(eligible_for_reimbursement) WHERE eligible_for_reimbursement = TRUE;
```

**RLS:**
- Service role: full access
- Customer: read own via `customer_id = auth.uid()`

**Business Logic:**
- `eligible_for_reimbursement = TRUE` when skip is for weeks **after** current Friday 09:00 PT
- Week boundary: Friday 09:00 PT → next Friday 08:59:59 PT
- Telegram bot enforces validation before INSERT

**Example:**
```
Current week: 2025-11-14 (Fri 09:00 PT) → 2025-11-21 (Fri 08:59:59 PT)
User skips 2025-11-24 (Mon) → eligible_for_reimbursement = TRUE ✅
User skips 2025-11-18 (Tue) → REJECTED by bot (current week) ❌
```

---

### qr_tokens

**Purpose:** Daily QR code metadata (JWT claims stored for audit)

```sql
CREATE TABLE qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  jti TEXT UNIQUE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  UNIQUE(customer_id, service_date)
);

CREATE INDEX idx_qr_customer_date ON qr_tokens(customer_id, service_date);
CREATE INDEX idx_qr_jti ON qr_tokens(jti);
CREATE INDEX idx_qr_expires ON qr_tokens(expires_at);
```

**RLS:**
- Service role: full access

**Claims (ES256 JWT):**
```json
{
  "iss": "frontier-meals-kiosk",
  "sub": "<customer_id>",
  "jti": "<uuid>",
  "iat": 1730390400,
  "exp": 1730433540,
  "service_date": "2025-11-01"
}
```

**Rotation:**
- Daily at 12:00 PM PT: generate new JWT, INSERT row, send via Resend
- Expires 11:59 PM PT same day
- Old tokens remain in table (audit trail)

---

### redemptions

**Purpose:** Kiosk scan history

```sql
CREATE TABLE redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  kiosk_id TEXT,
  qr_jti TEXT NOT NULL REFERENCES qr_tokens(jti),
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_redemption_customer_date ON redemptions(customer_id, service_date);
CREATE INDEX idx_redemption_kiosk ON redemptions(kiosk_id);
CREATE INDEX idx_redemption_qr ON redemptions(qr_jti);
```

**RLS:**
- Service role: full access

**Flow:**
1. Kiosk verifies JWT signature + expiry
2. Check `entitlements.meals_redeemed < meals_allowed`
3. INSERT redemption, UPDATE entitlements.meals_redeemed += 1
4. Mark qr_tokens.used_at = NOW()

---

### email_templates

**Purpose:** Versioned Resend templates (dunning, QR, announcements)

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff_accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, version)
);

CREATE INDEX idx_template_slug_active ON email_templates(slug, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_template_slug_version ON email_templates(slug, version DESC);

COMMENT ON COLUMN email_templates.slug IS 'dunning_soft | dunning_retry | dunning_final | canceled_notice | qr_daily | handle_confirm';
```

**RLS:**
- Service role: full access
- Admin: read/write

**Versioning Logic:**
- Each edit creates new row with incremented `version`
- Only one `is_active = TRUE` per slug
- Admin UI shows version history + preview

**Example Slugs:**
- `dunning_soft` — First failed payment (T+0)
- `dunning_retry` — Retry attempt (T+24-48h)
- `dunning_final` — Final warning (T+72-96h)
- `canceled_notice` — Subscription canceled
- `qr_daily` — Daily QR email (12 PM PT)
- `handle_confirm` — 60-minute Telegram setup check

---

### email_template_previews

**Purpose:** Preview/audit trail for template testing

```sql
CREATE TABLE email_template_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  preview_to TEXT NOT NULL,
  preview_context JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_preview_template ON email_template_previews(template_id);
```

**RLS:**
- Admin: read/write

**Usage:**
Admin clicks "Preview" → sends test email with sample context (customer name, dates, etc.)

---

### telegram_link_status

**Purpose:** Track whether customer has interacted with bot

```sql
CREATE TABLE telegram_link_status (
  customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_linked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_telegram_linked ON telegram_link_status(is_linked);
```

**RLS:**
- Service role: full access

**Logic:**
- On first `/start` (deep link): INSERT with `first_seen_at = NOW()`, `is_linked = TRUE`
- Hourly job checks: if `is_linked = FALSE` 60 minutes after subscription, send handle_confirm email

---

### handle_update_tokens

**Purpose:** Passwordless correction links (48h validity)

```sql
CREATE TABLE handle_update_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handle_token_hash ON handle_update_tokens(token_hash);
CREATE INDEX idx_handle_token_expires ON handle_update_tokens(expires_at);
```

**RLS:**
- Service role: full access

**Flow:**
1. System generates UUID token, hashes with SHA256
2. INSERT with `expires_at = NOW() + 48 hours`
3. Email link: `https://app.frontier-meals.com/handle/update/:token`
4. On form submit: verify `token_hash`, check `expires_at`, `used_at IS NULL`
5. UPDATE customers.telegram_handle, SET used_at = NOW(), write audit_log

---

### audit_log

**Purpose:** Security events, handle updates, admin actions

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

COMMENT ON COLUMN audit_log.actor IS 'staff:email | system | customer:id';
COMMENT ON COLUMN audit_log.action IS 'handle_updated | qr_redeemed | email_sent | subscription_canceled';
```

**RLS:**
- Admin: read-only
- Service role: write

**Retention:** 90 days

**Example Rows:**
```json
{"actor": "customer:123", "action": "handle_updated", "subject": "telegram_handle", "metadata": {"old": "@oldhandle", "new": "@newhandle"}}
{"actor": "system", "action": "qr_redeemed", "subject": "customer:123", "metadata": {"service_date": "2025-11-15", "kiosk_id": "kiosk-01"}}
{"actor": "staff:noah@frontier.com", "action": "email_sent", "subject": "dunning_final", "metadata": {"template_version": 3, "recipient": "user@example.com"}}
```

---

### webhook_events

**Purpose:** Idempotency for Stripe + Telegram webhooks

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('stripe', 'telegram', 'resend')),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_status ON webhook_events(status);
CREATE INDEX idx_webhook_created ON webhook_events(created_at);
```

**RLS:**
- Service role: full access

**Deduplication Logic:**
```sql
-- Before processing webhook:
INSERT INTO webhook_events (source, event_id, event_type, status)
VALUES ('stripe', 'evt_123ABC', 'invoice.paid', 'processing')
ON CONFLICT (event_id) DO NOTHING
RETURNING id;

-- If RETURNING id IS NULL → already processed, skip
```

**Retention:** 30 days (TTL cleanup job)

---

## RLS Policies (Examples)

### customers

```sql
-- Service role: unrestricted
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Future: customer API reads own row
CREATE POLICY customer_read_own ON customers
  FOR SELECT
  USING (auth.uid() = id);
```

### subscriptions

```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_read_own_subscription ON subscriptions
  FOR SELECT
  USING (customer_id = auth.uid());
```

### skips

```sql
ALTER TABLE skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_read_own_skips ON skips
  FOR SELECT
  USING (customer_id = auth.uid());
```

---

## Migrations Strategy

**Tooling:** Supabase CLI migrations (`supabase migration new <name>`)

**Naming Convention:**
```
20251026120000_create_customers.sql
20251026120100_create_subscriptions.sql
20251026120200_create_entitlements.sql
```

**Rollback Plan:**
- Each migration includes `-- rollback` section at top
- Never drop columns with data (use `ALTER TABLE ... DROP COLUMN IF EXISTS ... CASCADE` only in dev)

**Data Seeding:**
- `seeds/` folder for test data (staff accounts, sample templates)

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| customers | stripe_customer_id, telegram_user_id, email | Lookup by external ID |
| subscriptions | customer_id, stripe_subscription_id, status | Webhook processing |
| entitlements | (customer_id, service_date), service_date | Daily cron, redemption check |
| skips | (customer_id, skip_date), eligible_for_reimbursement | Telegram queries, accounting |
| qr_tokens | (customer_id, service_date), jti, expires_at | Kiosk verification |
| redemptions | customer_id, kiosk_id, qr_jti | Audit, analytics |
| email_templates | (slug, is_active), (slug, version DESC) | Active template lookup, history |
| telegram_link_status | is_linked | Hourly monitor job |
| handle_update_tokens | token_hash, expires_at | Correction link validation |
| audit_log | actor, action, created_at DESC | Admin queries, compliance |
| webhook_events | event_id, status, created_at | Idempotency, monitoring |

---

## Related Documents

- `specs/02-API-CONTRACTS.md` — Webhook payload shapes
- `specs/03-AUTHENTICATION.md` — RLS + session cookies
- `guides/ENGINEER.md` — Migration commands, key rotation

---

**END OF DATA MODEL SPECIFICATION**
