-- Payment Failure Tracking (MT-3)
-- Adds payment_failure_count to subscriptions table for dunning management

BEGIN;

-- ============================================================================
-- SUBSCRIPTIONS TABLE - Add Failure Tracking
-- ============================================================================

-- Add payment failure counter
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_failure_count INT DEFAULT 0 NOT NULL
    CHECK (payment_failure_count >= 0);

-- Index for querying high-risk subscriptions
CREATE INDEX IF NOT EXISTS idx_subscription_payment_failures
  ON subscriptions(payment_failure_count)
  WHERE payment_failure_count > 0;

COMMENT ON COLUMN subscriptions.payment_failure_count IS
  'Number of consecutive payment failures; reset to 0 on successful payment. Used for dunning email logic.';

COMMIT;
