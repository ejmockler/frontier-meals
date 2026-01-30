-- PayPal Integration Support
-- Adds dual-payment-provider support for Stripe and PayPal

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
