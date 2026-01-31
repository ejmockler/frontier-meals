-- Discount Code Redemptions
-- Permanent record of successful discount code redemptions
-- paypal_subscription_id ensures idempotent webhook handling

BEGIN;

-- ============================================================================
-- DISCOUNT CODE REDEMPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  discount_code_id UUID NOT NULL REFERENCES discount_codes(id),
  customer_id UUID REFERENCES customers(id),
  reservation_id UUID REFERENCES discount_code_reservations(id),

  -- Idempotency key: prevents duplicate webhook processing
  paypal_subscription_id TEXT UNIQUE,

  -- Audit
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- One redemption per customer per code
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_redemption_per_customer
  ON discount_code_redemptions(discount_code_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- Analytics: redemptions over time
CREATE INDEX IF NOT EXISTS idx_redemptions_analytics
  ON discount_code_redemptions(discount_code_id, redeemed_at);

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_redemptions_customer
  ON discount_code_redemptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_redemptions_reservation
  ON discount_code_redemptions(reservation_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE discount_code_redemptions IS
  'Permanent record of successful discount code redemptions. paypal_subscription_id ensures idempotent webhook handling.';

COMMENT ON COLUMN discount_code_redemptions.paypal_subscription_id IS
  'PayPal subscription ID - ensures idempotency if webhook fires multiple times';

COMMENT ON COLUMN discount_code_redemptions.customer_id IS
  'Customer ID (may be NULL if customer record not yet created when redemption occurs)';

COMMENT ON COLUMN discount_code_redemptions.reservation_id IS
  'Link back to the reservation that was converted to this redemption';

COMMIT;
