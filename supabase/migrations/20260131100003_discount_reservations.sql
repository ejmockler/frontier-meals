-- Discount Code Reservations
-- Temporary holds on discount codes during checkout flow
-- Prevents race conditions on limited-use codes
-- Expires after 15 minutes if not redeemed

BEGIN;

-- ============================================================================
-- DISCOUNT CODE RESERVATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_code_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  discount_code_id UUID NOT NULL REFERENCES discount_codes(id),
  customer_email TEXT NOT NULL,             -- Email from checkout form

  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,          -- 15 minutes from creation
  redeemed_at TIMESTAMPTZ,                  -- Set when webhook confirms

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Cleanup: find expired unredeemed reservations
CREATE INDEX IF NOT EXISTS idx_reservations_cleanup
  ON discount_code_reservations(expires_at)
  WHERE redeemed_at IS NULL;

-- Lookup: find reservation by customer
CREATE INDEX IF NOT EXISTS idx_reservations_customer
  ON discount_code_reservations(customer_email, discount_code_id);

-- Foreign key index
CREATE INDEX IF NOT EXISTS idx_reservations_discount_code
  ON discount_code_reservations(discount_code_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE discount_code_reservations IS
  'Temporary holds on discount codes during checkout flow. Expires after 15 minutes if not redeemed.';

COMMENT ON COLUMN discount_code_reservations.customer_email IS
  'Customer email from checkout form - used to enforce per-customer limits';

COMMENT ON COLUMN discount_code_reservations.expires_at IS
  'Reservation expires 15 minutes after creation. Cleaned up by cron job.';

COMMENT ON COLUMN discount_code_reservations.redeemed_at IS
  'Set when PayPal webhook confirms subscription activation';

COMMIT;
