# Discount Code System - Implementation Specification

**Status:** ✅ Implementation Complete
**Created:** 2026-01-31
**Last Updated:** 2026-01-31

> **Implementation Summary:** Phases 1-4 complete. All core functionality implemented and verified.
> Build passing. Ready for production deployment and plan seeding.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Admin UI](#4-admin-ui)
5. [Customer Checkout UX](#5-customer-checkout-ux)
6. [API Endpoints](#6-api-endpoints)
7. [Error Handling](#7-error-handling)
8. [Edge Cases](#8-edge-cases)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Overview

### 1.1 Business Requirements

Enable promotional discount codes that:
- Apply different PayPal subscription plans based on code entered
- Support limited-use codes (first N customers)
- Support time-limited codes (valid until date)
- Track redemptions for analytics
- Allow admins to create/manage codes without technical knowledge

### 1.2 Key Design Principles

**From Perceptual Engineering Validation:**

1. **Translation Layer Pattern**: Admins work with business entities (subscription tiers), not PayPal Plan IDs
2. **Reservation System**: Prevent race conditions on limited-use codes
3. **User-Centric Error Handling**: Every error provides a forward path
4. **Stealthy but Perceptible**: Discount option visible but doesn't create "coupon anxiety"

---

## 2. Architecture

### 2.1 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Complete Flow (Reservation System)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. POST /api/discount/reserve                                   │
│    └─> reserve_discount_code(code, customer_email)              │
│        ├─> Atomically: current_uses + reserved_uses < max       │
│        ├─> Increment reserved_uses                              │
│        ├─> Create reservation (15min TTL)                       │
│        └─> Return: reservation_id, plan_id, discount_display    │
│                                                                 │
│ 2. POST /api/paypal/create-subscription                         │
│    └─> Uses plan_id from reservation (not default)              │
│    └─> Stores reservation_id in PayPal custom_id field          │
│                                                                 │
│ 3. User completes PayPal checkout                               │
│                                                                 │
│ 4. Webhook: BILLING.SUBSCRIPTION.ACTIVATED                      │
│    └─> redeem_via_webhook(reservation_id, subscription_id)      │
│        ├─> Check idempotency (subscription_id unique)           │
│        ├─> Convert reservation → redemption                     │
│        ├─> Decrement reserved_uses, increment current_uses      │
│        └─> Store subscription_id for idempotency                │
│                                                                 │
│ 5. Cron job (every 5 minutes)                                   │
│    └─> cleanup_expired_reservations()                           │
│        └─> Release expired reservations, decrement reserved_uses│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Translation Layer

**Critical Design Decision**: Admins never interact with PayPal Plan IDs directly.

```
┌─────────────────────────────────────────────────────────────────┐
│         Admin Interface (Business Domain)                        │
│  "Premium Monthly"  "50% off"  "Expires Q1"                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│          Translation Layer (subscription_plans table)            │
│  • Maps business names → PayPal Plan IDs                        │
│  • Caches plan metadata (name, price)                           │
│  • Admin sees dropdown of business entities                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│         PayPal API (Technical Domain)                            │
│  Plan P-5ML42...  billing_cycles  agreements                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Migration: Subscription Plans (Translation Layer)

```sql
-- Migration: 20260131_001_subscription_plans.sql
-- Translation layer: business entities → PayPal Plan IDs

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Business-facing fields (what admin sees)
  business_name TEXT NOT NULL,              -- "Premium - Monthly ($29/mo)"
  description TEXT,                          -- "Our most popular plan"
  price_amount DECIMAL(10,2) NOT NULL,      -- 29.00
  price_currency TEXT DEFAULT 'USD',
  billing_cycle TEXT NOT NULL,              -- 'monthly', 'annual'

  -- Technical fields (hidden from admin)
  paypal_plan_id TEXT NOT NULL UNIQUE,      -- "P-5ML4271244454362WXNWU5NQ"

  -- Metadata
  is_default BOOLEAN DEFAULT false,         -- Default plan when no code used
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default plan
CREATE UNIQUE INDEX idx_subscription_plans_default
  ON subscription_plans(is_default) WHERE is_default = true;

-- Index for active plans lookup
CREATE INDEX idx_subscription_plans_active
  ON subscription_plans(is_active, sort_order);

COMMENT ON TABLE subscription_plans IS
  'Translation layer mapping business plan names to PayPal Plan IDs. Admins select from this list when creating discounts.';
```

### 3.2 Migration: Discount Codes

```sql
-- Migration: 20260131_002_discount_codes.sql
-- Discount code management with structured discount data

CREATE TABLE discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code identification
  code TEXT UNIQUE NOT NULL,

  -- What plan this code unlocks (FK to translation layer)
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  -- Structured discount info (NOT human-readable text)
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_trial')),
  discount_value DECIMAL(10,2),             -- 50 for 50%, 10.00 for $10 off
  discount_duration_months INT DEFAULT 1,   -- How many months discount applies

  -- Admin-friendly description
  admin_notes TEXT,                         -- "Summer 2025 campaign for gym partners"

  -- Usage limits
  max_uses INT,                             -- NULL = unlimited
  current_uses INT DEFAULT 0,
  reserved_uses INT DEFAULT 0,              -- Held during checkout flow

  -- Per-customer limit
  max_uses_per_customer INT DEFAULT 1,      -- Usually 1

  -- Validity window
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMPTZ,               -- When admin disabled
  grace_period_minutes INT DEFAULT 30,      -- Honor code for this long after deactivation

  -- Audit
  created_by UUID,                          -- Admin who created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_uses_non_negative CHECK (current_uses >= 0 AND reserved_uses >= 0),
  CONSTRAINT chk_uses_within_max CHECK (max_uses IS NULL OR current_uses <= max_uses),
  CONSTRAINT chk_valid_date_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CONSTRAINT chk_discount_value_positive CHECK (discount_value IS NULL OR discount_value > 0)
);

-- Hot path: code lookup during validation
CREATE INDEX idx_discount_codes_lookup
  ON discount_codes(code)
  WHERE is_active = true;

-- Admin dashboard: active codes with availability
CREATE INDEX idx_discount_codes_active
  ON discount_codes(is_active, valid_from, valid_until);

COMMENT ON TABLE discount_codes IS
  'Promotional codes that unlock specific subscription plans. Uses reservation system to prevent race conditions.';
```

### 3.3 Migration: Reservations (Race Condition Prevention)

```sql
-- Migration: 20260131_003_discount_reservations.sql
-- Reservation system prevents double-redemption of limited-use codes

CREATE TABLE discount_code_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  discount_code_id UUID NOT NULL REFERENCES discount_codes(id),
  customer_email TEXT NOT NULL,             -- Email from checkout form

  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,          -- 15 minutes from creation
  redeemed_at TIMESTAMPTZ,                  -- Set when webhook confirms

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleanup: find expired unredeemed reservations
CREATE INDEX idx_reservations_cleanup
  ON discount_code_reservations(expires_at)
  WHERE redeemed_at IS NULL;

-- Lookup: find reservation by customer
CREATE INDEX idx_reservations_customer
  ON discount_code_reservations(customer_email, discount_code_id);

COMMENT ON TABLE discount_code_reservations IS
  'Temporary holds on discount codes during checkout flow. Expires after 15 minutes if not redeemed.';
```

### 3.4 Migration: Redemptions (Final Record)

```sql
-- Migration: 20260131_004_discount_redemptions.sql
-- Permanent record of code redemptions with idempotency

CREATE TABLE discount_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  discount_code_id UUID NOT NULL REFERENCES discount_codes(id),
  customer_id UUID REFERENCES customers(id),
  reservation_id UUID REFERENCES discount_code_reservations(id),

  -- Idempotency key: prevents duplicate webhook processing
  paypal_subscription_id TEXT UNIQUE,

  -- Audit
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

-- One redemption per customer per code
CREATE UNIQUE INDEX idx_one_redemption_per_customer
  ON discount_code_redemptions(discount_code_id, customer_id);

-- Analytics: redemptions over time
CREATE INDEX idx_redemptions_analytics
  ON discount_code_redemptions(discount_code_id, redeemed_at);

COMMENT ON TABLE discount_code_redemptions IS
  'Permanent record of successful discount code redemptions. paypal_subscription_id ensures idempotent webhook handling.';
```

### 3.5 Migration: Atomic Functions

```sql
-- Migration: 20260131_005_discount_functions.sql
-- Atomic functions for discount code operations

-- Function: Reserve a discount code
CREATE OR REPLACE FUNCTION reserve_discount_code(
  p_code TEXT,
  p_customer_email TEXT
) RETURNS TABLE(
  success BOOLEAN,
  reservation_id UUID,
  plan_id UUID,
  paypal_plan_id TEXT,
  discount_type TEXT,
  discount_value DECIMAL,
  discount_duration_months INT,
  error_code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_code RECORD;
  v_plan RECORD;
  v_reservation_id UUID;
BEGIN
  -- Lock the code row to prevent concurrent modifications
  SELECT * INTO v_code
  FROM discount_codes
  WHERE code = UPPER(TRIM(p_code))
  FOR UPDATE NOWAIT;

  -- Check if code exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'INVALID_CODE'::TEXT, 'Code not found'::TEXT;
    RETURN;
  END IF;

  -- Check if active (with grace period)
  IF NOT v_code.is_active AND (
    v_code.deactivated_at IS NULL OR
    v_code.deactivated_at + (v_code.grace_period_minutes || ' minutes')::INTERVAL < NOW()
  ) THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'INACTIVE'::TEXT, 'Code is no longer active'::TEXT;
    RETURN;
  END IF;

  -- Check validity window
  IF v_code.valid_from IS NOT NULL AND v_code.valid_from > NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'NOT_YET_VALID'::TEXT, 'Code is not yet valid'::TEXT;
    RETURN;
  END IF;

  IF v_code.valid_until IS NOT NULL AND v_code.valid_until < NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'EXPIRED'::TEXT, format('Code expired on %s', to_char(v_code.valid_until, 'Mon DD, YYYY'))::TEXT;
    RETURN;
  END IF;

  -- Check usage limits (current + reserved)
  IF v_code.max_uses IS NOT NULL AND (v_code.current_uses + v_code.reserved_uses) >= v_code.max_uses THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'MAX_USES'::TEXT, 'Code has reached its usage limit'::TEXT;
    RETURN;
  END IF;

  -- Check per-customer limit
  IF v_code.max_uses_per_customer IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM discount_code_redemptions dcr
      JOIN customers c ON c.id = dcr.customer_id
      WHERE dcr.discount_code_id = v_code.id
        AND c.email = p_customer_email
      HAVING COUNT(*) >= v_code.max_uses_per_customer
    ) THEN
      RETURN QUERY SELECT
        FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
        'ALREADY_USED'::TEXT, 'You have already used this code'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Get plan details
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_code.plan_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'PLAN_UNAVAILABLE'::TEXT, 'The plan for this code is no longer available'::TEXT;
    RETURN;
  END IF;

  -- All checks passed - create reservation
  UPDATE discount_codes
  SET reserved_uses = reserved_uses + 1,
      updated_at = NOW()
  WHERE id = v_code.id;

  INSERT INTO discount_code_reservations (
    discount_code_id,
    customer_email,
    expires_at
  ) VALUES (
    v_code.id,
    p_customer_email,
    NOW() + INTERVAL '15 minutes'
  ) RETURNING id INTO v_reservation_id;

  -- Return success
  RETURN QUERY SELECT
    TRUE,
    v_reservation_id,
    v_plan.id,
    v_plan.paypal_plan_id,
    v_code.discount_type,
    v_code.discount_value,
    v_code.discount_duration_months,
    NULL::TEXT,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;


-- Function: Redeem via webhook (with idempotency)
CREATE OR REPLACE FUNCTION redeem_discount_code(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_paypal_subscription_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_reservation RECORD;
  v_code_id UUID;
BEGIN
  -- Check idempotency first
  IF EXISTS (
    SELECT 1 FROM discount_code_redemptions
    WHERE paypal_subscription_id = p_paypal_subscription_id
  ) THEN
    RETURN TRUE; -- Already processed, idempotent success
  END IF;

  -- Find and lock reservation
  SELECT * INTO v_reservation
  FROM discount_code_reservations
  WHERE id = p_reservation_id
    AND redeemed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found or already redeemed';
  END IF;

  v_code_id := v_reservation.discount_code_id;

  -- Convert reservation to redemption
  UPDATE discount_code_reservations
  SET redeemed_at = NOW()
  WHERE id = p_reservation_id;

  -- Update code counters
  UPDATE discount_codes
  SET reserved_uses = GREATEST(0, reserved_uses - 1),
      current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = v_code_id;

  -- Create redemption record
  INSERT INTO discount_code_redemptions (
    discount_code_id,
    customer_id,
    reservation_id,
    paypal_subscription_id
  ) VALUES (
    v_code_id,
    p_customer_id,
    p_reservation_id,
    p_paypal_subscription_id
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- Function: Cleanup expired reservations (cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_reservations() RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    DELETE FROM discount_code_reservations
    WHERE expires_at < NOW()
      AND redeemed_at IS NULL
    RETURNING discount_code_id
  ),
  counts AS (
    SELECT discount_code_id, COUNT(*) as cnt
    FROM expired
    GROUP BY discount_code_id
  )
  UPDATE discount_codes dc
  SET reserved_uses = GREATEST(0, reserved_uses - c.cnt),
      updated_at = NOW()
  FROM counts c
  WHERE dc.id = c.discount_code_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;


-- Function: Get discount display text (computed, not stored)
CREATE OR REPLACE FUNCTION get_discount_display(
  p_discount_type TEXT,
  p_discount_value DECIMAL,
  p_duration_months INT
) RETURNS TEXT AS $$
BEGIN
  IF p_discount_type = 'percentage' THEN
    IF p_duration_months = 1 THEN
      RETURN format('%s%% off first month', p_discount_value::INT);
    ELSE
      RETURN format('%s%% off first %s months', p_discount_value::INT, p_duration_months);
    END IF;
  ELSIF p_discount_type = 'fixed_amount' THEN
    IF p_duration_months = 1 THEN
      RETURN format('$%s off first month', p_discount_value);
    ELSE
      RETURN format('$%s off first %s months', p_discount_value, p_duration_months);
    END IF;
  ELSIF p_discount_type = 'free_trial' THEN
    RETURN format('%s month free trial', p_duration_months);
  ELSE
    RETURN 'Special discount';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION reserve_discount_code IS
  'Atomically validates and reserves a discount code. Returns plan details or error. Reservation expires in 15 minutes.';
COMMENT ON FUNCTION redeem_discount_code IS
  'Called by webhook to finalize redemption. Idempotent via paypal_subscription_id.';
COMMENT ON FUNCTION cleanup_expired_reservations IS
  'Cron job function to release expired reservations. Run every 5 minutes.';
```

### 3.6 Migration: Audit Logging

```sql
-- Migration: 20260131_006_discount_audit.sql
-- Audit trail for discount code changes

CREATE TABLE discount_code_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID REFERENCES discount_codes(id),
  action TEXT NOT NULL, -- 'created', 'updated', 'activated', 'deactivated', 'exhausted'
  changed_by UUID,      -- Admin user ID
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX idx_discount_audit_code ON discount_code_audit(discount_code_id, changed_at);

-- Trigger function for automatic auditing
CREATE OR REPLACE FUNCTION audit_discount_code_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO discount_code_audit (discount_code_id, action, new_values)
    VALUES (NEW.id, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO discount_code_audit (discount_code_id, action, old_values, new_values)
    VALUES (
      NEW.id,
      CASE
        WHEN OLD.is_active AND NOT NEW.is_active THEN 'deactivated'
        WHEN NOT OLD.is_active AND NEW.is_active THEN 'activated'
        WHEN NEW.current_uses >= COALESCE(NEW.max_uses, NEW.current_uses + 1) THEN 'exhausted'
        ELSE 'updated'
      END,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discount_codes_audit
  AFTER INSERT OR UPDATE ON discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION audit_discount_code_change();
```

---

## 4. Admin UI

### 4.1 Design Principles

**From Perceptual Engineering Validation:**

1. **No Plan ID Exposure**: Admins select from business entities, not technical IDs
2. **Full-Page Form**: Side panels are insufficient for this complexity
3. **Live Preview**: Show customer impact as form is filled
4. **Status at a Glance**: Color-coded status indicators

### 4.2 Navigation

Add to admin sidebar:
```
Marketing
  └─ Discounts (new)
```

Route: `/admin/discounts`

### 4.3 Discounts List Page

```
┌─ Discounts ───────────────────────────────────────────────────────────────┐
│                                                                            │
│  [+ Create Discount]                                        [Sync Plans]   │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ 🟢 SUMMER50    │ Premium Monthly │ 50% off  │ 12/50 │ Mar 31 │ Edit │   │
│  │ 🔴 WINTER23    │ Basic Annual    │ $10 off  │ 50/50 │ Expired│ View │   │
│  │ 🟡 PARTNER2026 │ Premium Annual  │ 25% off  │ 0/100 │ Jun 30 │ Edit │   │
│  │ ⚫ LEGACY2025  │ [Deleted Plan]  │ —        │ —     │ —      │ —    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  Legend: 🟢 Active  🟡 Unused  🔴 Exhausted/Expired  ⚫ Error              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Status Logic:**
- 🟢 Active: `is_active AND current_uses < max_uses AND valid_until > NOW()`
- 🟡 Unused: Active but `current_uses = 0` (potential issue - created but not distributed?)
- 🔴 Exhausted/Expired: `current_uses >= max_uses OR valid_until < NOW()`
- ⚫ Error: Referenced plan no longer exists

### 4.4 Create/Edit Discount Page

**Route:** `/admin/discounts/new` or `/admin/discounts/[id]/edit`

**Layout:** Two-column (60% form, 40% preview)

```
┌─ Create Discount ─────────────────────────────────────────────────────────┐
│                                                                            │
│  ┌─── Form ────────────────────────┐  ┌─── Customer Preview ────────────┐ │
│  │                                  │  │                                  │ │
│  │  Discount Code                   │  │  When customer enters: SUMMER50 │ │
│  │  ┌──────────────────┐ [Generate] │  │                                  │ │
│  │  │ SUMMER50         │            │  │  ┌────────────────────────────┐ │ │
│  │  └──────────────────┘            │  │  │ ✓ Discount applied!        │ │ │
│  │                                  │  │  │                            │ │ │
│  │  Apply to Plan                   │  │  │ Premium Monthly            │ │ │
│  │  ┌──────────────────────────▼┐   │  │  │ $29.00 → $14.50/month     │ │ │
│  │  │ Premium - Monthly ($29)   │   │  │  │                            │ │ │
│  │  └───────────────────────────┘   │  │  │ You save: $14.50/month    │ │ │
│  │                                  │  │  └────────────────────────────┘ │ │
│  │  Discount Type                   │  │                                  │ │
│  │  ○ Percentage  ● Fixed Amount    │  │                                  │ │
│  │                                  │  │                                  │ │
│  │  Discount Value                  │  │                                  │ │
│  │  ┌────────────┐                  │  │                                  │ │
│  │  │ 50        │ %                 │  │                                  │ │
│  │  └────────────┘                  │  │                                  │ │
│  │                                  │  │                                  │ │
│  │  Duration                        │  │                                  │ │
│  │  ┌────────────┐ months           │  │                                  │ │
│  │  │ 1          │                  │  │                                  │ │
│  │  └────────────┘                  │  │                                  │ │
│  │                                  │  │                                  │ │
│  │  ▼ Limits (optional)             │  │                                  │ │
│  │  ┌────────────────────────────┐  │  │                                  │ │
│  │  │ Max uses: [50]             │  │  │                                  │ │
│  │  │ Expires: [2026-03-31]      │  │  │                                  │ │
│  │  │ Per customer: [1]          │  │  │                                  │ │
│  │  └────────────────────────────┘  │  │                                  │ │
│  │                                  │  │                                  │ │
│  │  Admin Notes                     │  │                                  │ │
│  │  ┌────────────────────────────┐  │  │                                  │ │
│  │  │ Summer 2026 gym partner    │  │  │                                  │ │
│  │  │ campaign                   │  │  │                                  │ │
│  │  └────────────────────────────┘  │  │                                  │ │
│  │                                  │  │                                  │ │
│  │        [Cancel]  [Create]        │  │                                  │ │
│  └──────────────────────────────────┘  └──────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Plan Sync Utility

**Route:** `/admin/discounts/sync-plans`

One-time admin task to import PayPal plans:

```
┌─ Sync Subscription Plans ─────────────────────────────────────────────────┐
│                                                                            │
│  This utility imports your PayPal subscription plans so you can create     │
│  discount codes for them.                                                  │
│                                                                            │
│  ┌─ Add New Plan ─────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  Paste PayPal plan URL or button embed code:                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ https://www.paypal.com/webapps/billing/plans/subscribe?...  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ✓ Found Plan: P-5ML4271244454362WXNWU5NQ                         │   │
│  │                                                                     │   │
│  │  Give it a friendly name:                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Premium - Monthly ($29/mo)                                  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  Price: $[29.00] / [monthly ▼]                                     │   │
│  │                                                                     │   │
│  │  [ ] Set as default plan (used when no discount code)              │   │
│  │                                                                     │   │
│  │                                          [Cancel]  [Add Plan]      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─ Your Plans ───────────────────────────────────────────────────────┐   │
│  │ ✓ Premium - Monthly ($29/mo)          P-5ML42...        [Default]  │   │
│  │ ✓ Premium - Annual ($290/yr)          P-8KN91...        [Edit]     │   │
│  │ ✓ Basic - Monthly ($9/mo)             P-2JF83...        [Edit]     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Customer Checkout UX

### 5.1 Design Decision: Always-Visible Optional Input

**From Perceptual Engineering Validation:**

The "Have a code?" collapsible pattern is **perceptually underweight** for a meal subscription service where codes may drive partnerships.

**Recommendation:**
- **Desktop/Tablet:** Always-visible optional input integrated into pricing summary
- **Mobile:** Collapsible with enhanced affordances (larger tap targets)

### 5.2 Desktop Layout

```
┌─────────────────────────────────────┐
│  Order Summary                      │
│  ───────────────────────────────    │
│  Premium Monthly Plan    $29/month  │
│  ───────────────────────────────    │
│                                     │
│  Promo Code (optional)              │
│  ┌──────────────────────┐ [Apply]   │
│  │                      │           │
│  └──────────────────────┘           │
│  ───────────────────────────────    │
│  Total                   $29/month  │
│  ───────────────────────────────    │
│                                     │
│        [Continue to PayPal]         │
└─────────────────────────────────────┘
```

### 5.3 Mobile Layout

```
┌─────────────────────────┐
│ Order Summary           │
│─────────────────────────│
│ Premium Monthly $29/mo  │
│─────────────────────────│
│ Have a promo code?      │
│     [Tap to enter]      │  ← Full-width tap target (min 44×44pt)
│─────────────────────────│
│ Total         $29/mo    │
│                         │
│  [Continue to PayPal]   │
└─────────────────────────┘

[After tap - expands inline]
┌─────────────────────────┐
│ ┌─────────────────────┐ │
│ │ Enter code          │ │ ← Auto-focus keyboard
│ └─────────────────────┘ │
│     [Apply Code]        │ ← Full-width button
└─────────────────────────┘
```

### 5.4 Validation States

**Validating:**
```
┌──────────────────────┐
│ SUMMER50            │ [⏳]
└──────────────────────┘
Checking code...
```

**Success:**
```
┌──────────────────────┐
│ ✓ SUMMER50          │ [✕]  ← Option to remove
└──────────────────────┘
✓ 50% off first month applied!

Premium Monthly
$29.00 → $14.50/month
You save: $14.50
```

**Error:**
```
┌──────────────────────┐
│ ⚠ WELC0ME           │ [✕]
└──────────────────────┘
Code not found. Did you mean 'WELCOME50'?
[Apply WELCOME50] [Try different code]
```

### 5.5 Animation Specifications

**Price Update Animation (on successful code):**
```css
.price-updating {
  animation: price-highlight 200ms ease-out;
}

@keyframes price-highlight {
  0% { background: transparent; }
  50% { background: #fef3c7; transform: scale(1.05); }
  100% { background: transparent; transform: scale(1); }
}

.price-original {
  text-decoration: line-through;
  color: #9ca3af;
}

.price-discounted {
  color: #059669;
  font-weight: 600;
}

.savings-badge {
  animation: badge-appear 300ms ease-out;
  background: #d1fae5;
  color: #059669;
  padding: 4px 8px;
  border-radius: 4px;
}

@keyframes badge-appear {
  0% { opacity: 0; transform: translateY(-10px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

---

## 6. API Endpoints

### 6.1 POST /api/discount/reserve

**Request:**
```typescript
{
  code: string;
  email: string;
}
```

**Success Response (200):**
```typescript
{
  success: true;
  reservation_id: string;
  plan: {
    id: string;
    name: string;
    price: number;
    billing_cycle: string;
  };
  discount: {
    type: 'percentage' | 'fixed_amount' | 'free_trial';
    value: number;
    duration_months: number;
    display: string;  // "50% off first month"
  };
  discounted_price: number;
  savings: number;
}
```

**Error Response (400):**
```typescript
{
  success: false;
  error: {
    code: 'INVALID_CODE' | 'EXPIRED' | 'MAX_USES' | 'ALREADY_USED' | 'INACTIVE';
    message: string;
    suggestion?: string;  // "Did you mean 'WELCOME50'?"
    expires_at?: string;  // For EXPIRED errors
  };
}
```

### 6.2 POST /api/paypal/create-subscription (Modified)

**Request (with discount):**
```typescript
{
  email: string;
  name: string;
  reservation_id?: string;  // NEW: From /api/discount/reserve
}
```

**Logic:**
```typescript
// If reservation_id provided, use the discounted plan
if (reservation_id) {
  const reservation = await getReservation(reservation_id);
  plan_id = reservation.paypal_plan_id;
  custom_id = JSON.stringify({
    reservation_id,
    email
  });
} else {
  // Use default plan
  plan_id = await getDefaultPlanId();
  custom_id = JSON.stringify({ email });
}
```

### 6.3 Webhook Handler (Modified)

**In BILLING.SUBSCRIPTION.ACTIVATED handler:**
```typescript
// Extract custom_id from webhook
const customData = JSON.parse(resource.custom_id);

if (customData.reservation_id) {
  // Redeem the discount code
  await supabase.rpc('redeem_discount_code', {
    p_reservation_id: customData.reservation_id,
    p_customer_id: customer.id,
    p_paypal_subscription_id: resource.id
  });
}
```

### 6.4 GET /api/admin/discounts

**Response:**
```typescript
{
  discounts: Array<{
    id: string;
    code: string;
    plan: {
      id: string;
      name: string;
      price: number;
    };
    discount: {
      type: string;
      value: number;
      duration_months: number;
      display: string;
    };
    usage: {
      current: number;
      reserved: number;
      max: number | null;
    };
    validity: {
      from: string | null;
      until: string | null;
    };
    status: 'active' | 'unused' | 'exhausted' | 'expired' | 'inactive' | 'error';
    admin_notes: string | null;
    created_at: string;
  }>;
}
```

---

## 7. Error Handling

### 7.1 Error Message Design

**Principle:** Every error provides:
1. What happened (clear, blame-free)
2. Why it happened (educational)
3. What to do next (actionable forward path)

### 7.2 Error Codes and Messages

| Code | System Message | User-Facing Message |
|------|---------------|---------------------|
| `INVALID_CODE` | Code not found | "Code not found. Check for typos or try another code." |
| `EXPIRED` | Code validity window passed | "This code expired on {date}. Check your email for current offers." |
| `MAX_USES` | Global usage limit reached | "This code has reached its usage limit. It was limited to {max} uses." |
| `ALREADY_USED` | Customer already used | "You've already used this code on {date}." |
| `INACTIVE` | Admin deactivated | "This code is no longer available." |
| `NOT_YET_VALID` | Before valid_from date | "This code isn't active yet. It starts on {date}." |
| `PLAN_UNAVAILABLE` | Referenced plan deleted | "This code's offer is no longer available." |

### 7.3 Typo Detection

Implement Levenshtein distance matching:
```typescript
function findSimilarCodes(input: string, activeCodes: string[]): string | null {
  const normalized = input.toUpperCase().trim();

  for (const code of activeCodes) {
    const distance = levenshtein(normalized, code);
    // If 1-2 character difference, suggest
    if (distance <= 2 && distance < normalized.length * 0.3) {
      return code;
    }
  }

  return null;
}
```

### 7.4 Error Recovery Flows

**Expired Code:**
```
┌─────────────────────────────────────────┐
│ ⏱️ Code 'SUMMER50' expired on Aug 31    │
│                                         │
│ Check for current offers →              │
│                                         │
│ [View offers] [Try another code]        │
└─────────────────────────────────────────┘
```

**Typo Detected:**
```
┌─────────────────────────────────────────┐
│ ❌ Code 'WELC0ME' not found             │
│                                         │
│ Did you mean 'WELCOME'?                 │
│                                         │
│ [Apply WELCOME] [Try different code]    │
└─────────────────────────────────────────┘
```

---

## 8. Edge Cases

### 8.1 Code Expires During Checkout

**Scenario:** User validates code at 11:58 PM, code expires at midnight, user completes checkout at 12:02 AM.

**Solution:** Reservation system with 15-minute grace period.

- Code validated → reservation created with 15min TTL
- Reservation holds the "slot" even if code expires
- Webhook can redeem as long as reservation is valid

### 8.2 PayPal Checkout Fails After Validation

**Scenario:** User validates code → clicks PayPal → PayPal API error → user returns to site.

**Solution:** Persist validated code in session.

```typescript
// On successful reservation
sessionStorage.setItem('discount_reservation', JSON.stringify({
  code: 'SUMMER50',
  reservation_id: 'uuid',
  display: '50% off first month',
  expires_at: reservation.expires_at
}));

// On page load, check for existing reservation
const stored = sessionStorage.getItem('discount_reservation');
if (stored) {
  const reservation = JSON.parse(stored);
  if (new Date(reservation.expires_at) > new Date()) {
    // Restore UI state
    showAppliedDiscount(reservation);
  } else {
    sessionStorage.removeItem('discount_reservation');
  }
}
```

### 8.3 Multiple Browser Tabs

**Scenario:** User opens checkout in 100 tabs, all validate same limited-use code.

**Solution:** Reservation system increments `reserved_uses`.

- First tab validates → reservation created, reserved_uses = 1
- Subsequent tabs see `current_uses + reserved_uses >= max_uses`
- Only first reservation can be redeemed

### 8.4 Admin Deactivates Code Mid-Checkout

**Scenario:** Admin deactivates code while user is completing checkout.

**Solution:** Grace period on deactivation.

- `deactivated_at` timestamp stored
- Validation checks: `is_active OR (deactivated_at + grace_period > NOW())`
- Default grace period: 30 minutes

### 8.5 Code URL Parameters

**Scenario:** User clicks email link with `?code=SUMMER50` pre-filled.

**Solution:** Auto-apply from URL.

```typescript
// In checkout page load
const urlCode = new URL(window.location.href).searchParams.get('code');
if (urlCode) {
  await validateAndApply(urlCode);
}
```

---

## 9. Implementation Checklist

### Phase 1: Database & Core (P0 - Required for Launch) ✅ COMPLETE

- [x] Create migration: `subscription_plans` table → `20260131100001_subscription_plans.sql`
- [x] Create migration: `discount_codes` table → `20260131100002_discount_codes.sql`
- [x] Create migration: `discount_code_reservations` table → `20260131100003_discount_reservations.sql`
- [x] Create migration: `discount_code_redemptions` table → `20260131100004_discount_redemptions.sql`
- [x] Create migration: Atomic functions → `20260131100005_discount_functions.sql`
- [x] Create migration: Audit logging → `20260131100006_discount_audit.sql`
- [x] Create TypeScript types → `src/lib/types/discount.ts`
- [x] Add cron job → `src/lib/cron/cleanup-discount-reservations.ts`
- [ ] Seed initial subscription plans from existing PayPal Plan IDs (manual step after deploy)

### Phase 2: API Endpoints (P0) ✅ COMPLETE

- [x] Create `POST /api/discount/reserve` endpoint → `src/routes/api/discount/reserve/+server.ts`
- [x] Modify `POST /api/paypal/create-subscription` to accept `reservation_id`
- [x] Modify PayPal webhook handler to call `redeem_discount_code`
- [x] Add typo detection (Levenshtein distance) in reserve endpoint
- [x] Fixed review issues: column name mismatch, interval construction, overselling constraint

### Phase 3: Customer Checkout UI (P0) ✅ COMPLETE

- [x] Add discount code input to checkout page (desktop layout)
- [x] Add discount code input to checkout page (mobile layout)
- [x] Implement validation states (loading, success, error)
- [x] Add price animation on successful code
- [x] Add session persistence for reservation
- [x] Handle URL parameter `?code=`
- [x] Created `DiscountCodeInput.svelte` component
- [x] Integrated with `SubscriptionCheckout.svelte`

### Phase 4: Admin UI (P1) ✅ COMPLETE

- [x] Create `/admin/discounts` list page with status indicators
- [x] Create `/admin/discounts/new` form page with live preview
- [x] Create `/admin/discounts/[id]/edit` form page
- [x] Create `/admin/discounts/sync-plans` utility for PayPal Plan ID import
- [x] Add status indicators (color-coded: 🟢 Active, 🟡 Unused, 🔴 Exhausted, ⚫ Error)
- [x] Add live preview in form showing customer view
- [x] Add code generator (8-char alphanumeric)

### Phase 5: Polish (P2)

- [ ] A/B test: always-visible vs. collapsible discount input
- [ ] Add discount analytics dashboard
- [ ] Add bulk actions (deactivate multiple, clone)
- [ ] Add export functionality (CSV of redemptions)
- [ ] Add "best available code" suggestions

---

## Appendix A: Environment Variables

```env
# No new environment variables required
# Discount codes use existing Supabase connection
```

## Appendix B: TypeScript Types

```typescript
// src/lib/types/discount.ts

export interface SubscriptionPlan {
  id: string;
  business_name: string;
  description: string | null;
  price_amount: number;
  price_currency: string;
  billing_cycle: 'monthly' | 'annual';
  paypal_plan_id: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface DiscountCode {
  id: string;
  code: string;
  plan_id: string;
  plan?: SubscriptionPlan;
  discount_type: 'percentage' | 'fixed_amount' | 'free_trial';
  discount_value: number | null;
  discount_duration_months: number;
  admin_notes: string | null;
  max_uses: number | null;
  current_uses: number;
  reserved_uses: number;
  max_uses_per_customer: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  grace_period_minutes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountReservation {
  id: string;
  discount_code_id: string;
  customer_email: string;
  expires_at: string;
  redeemed_at: string | null;
  created_at: string;
}

export interface DiscountRedemption {
  id: string;
  discount_code_id: string;
  customer_id: string;
  reservation_id: string | null;
  paypal_subscription_id: string;
  redeemed_at: string;
}

export type DiscountStatus =
  | 'active'
  | 'unused'
  | 'exhausted'
  | 'expired'
  | 'inactive'
  | 'error';

export interface DiscountValidationResult {
  success: boolean;
  reservation_id?: string;
  plan?: {
    id: string;
    name: string;
    price: number;
    billing_cycle: string;
  };
  discount?: {
    type: DiscountCode['discount_type'];
    value: number;
    duration_months: number;
    display: string;
  };
  discounted_price?: number;
  savings?: number;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
    expires_at?: string;
  };
}
```

---

**Document Revision History:**
- 2026-01-31: Initial specification incorporating perceptual engineering validation findings
- 2026-01-31: Implementation complete - All 4 phases verified and build passing
- 2026-01-31: Code review fixes applied:
  - Fixed column name mismatch (`reserved_at` → `expires_at`) in cron cleanup
  - Added missing error codes to TypeScript types (`RESERVATION_EXISTS`, `INVALID_REQUEST`, etc.)
  - Added input length validation (DoS protection) in reserve endpoint
  - Fixed SQL interval construction using `make_interval()`
  - Fixed constraint to prevent overselling: `(current_uses + reserved_uses) <= max_uses`
  - Fixed `{@const}` placement error for Svelte 5 compatibility
  - Added active reservation check to prevent duplicate reservations per customer
