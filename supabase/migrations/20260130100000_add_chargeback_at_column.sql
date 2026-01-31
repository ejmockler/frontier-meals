-- Add chargeback_at column to subscriptions table for PayPal dispute tracking
-- Migration: 20260130100000_add_chargeback_at_column.sql
-- Context: PayPal webhook handler sets chargeback_at when PAYMENT.SALE.REVERSED occurs

BEGIN;

-- Add chargeback_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions'
    AND column_name = 'chargeback_at'
  ) THEN
    ALTER TABLE subscriptions
    ADD COLUMN chargeback_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add CHECK constraint: if chargeback_at is set, status must be 'suspended'
-- Drop existing constraint if present (for idempotency)
ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS chargeback_requires_suspended_status;

ALTER TABLE subscriptions
ADD CONSTRAINT chargeback_requires_suspended_status
CHECK (
  chargeback_at IS NULL OR status = 'suspended'
);

-- Add index for querying chargebacks (admin dashboard, reporting)
CREATE INDEX IF NOT EXISTS idx_subscriptions_chargeback_at
ON subscriptions(chargeback_at)
WHERE chargeback_at IS NOT NULL;

-- Document the column purpose
COMMENT ON COLUMN subscriptions.chargeback_at IS
'Timestamp when a chargeback/payment reversal was detected (primarily for PayPal PAYMENT.SALE.REVERSED webhooks). When set, subscription status must be suspended.';

COMMIT;
