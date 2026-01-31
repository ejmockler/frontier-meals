-- DI-5: Provider/ID Consistency Constraints
-- Ensures payment_provider matches the actual ID columns set
-- Example violation: payment_provider='paypal' but only stripe_customer_id is set

BEGIN;

-- ============================================================================
-- CUSTOMERS TABLE CONSTRAINT
-- ============================================================================

-- Drop existing constraint if it exists (idempotency)
ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_provider_id_consistency;

-- Add constraint: provider must match the ID type
ALTER TABLE customers
  ADD CONSTRAINT customers_provider_id_consistency CHECK (
    (payment_provider = 'stripe' AND stripe_customer_id IS NOT NULL AND paypal_payer_id IS NULL) OR
    (payment_provider = 'paypal' AND paypal_payer_id IS NOT NULL AND stripe_customer_id IS NULL)
  );

COMMENT ON CONSTRAINT customers_provider_id_consistency ON customers
  IS 'DI-5: Ensures payment_provider matches the actual payment ID set (prevents mixed state)';

-- ============================================================================
-- SUBSCRIPTIONS TABLE CONSTRAINT
-- ============================================================================

-- Drop existing constraint if it exists (idempotency)
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_id_consistency;

-- Add constraint: provider must match the ID type
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_id_consistency CHECK (
    (payment_provider = 'stripe' AND stripe_subscription_id IS NOT NULL AND paypal_subscription_id IS NULL) OR
    (payment_provider = 'paypal' AND paypal_subscription_id IS NOT NULL AND stripe_subscription_id IS NULL)
  );

COMMENT ON CONSTRAINT subscriptions_provider_id_consistency ON subscriptions
  IS 'DI-5: Ensures payment_provider matches the actual subscription ID set (prevents mixed state)';

COMMIT;
