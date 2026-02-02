-- Migration: Add retry support for webhook events
-- Issue: C7 - Idempotency check causes stuck events
--
-- Problem: If processing fails, event is marked "failed" but never retried
-- because idempotency check sees the event exists and returns success.
--
-- Solution:
-- 1. Add `attempts` column to track retry count
-- 2. Modify idempotency check in webhook handlers to allow reprocessing of failed events
-- 3. Enforce maximum retry limit (3 attempts)

BEGIN;

-- Add attempts column with default of 1 (first attempt)
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;

-- Add constraint for maximum attempts (prevent infinite retries)
-- Note: This is informational - the limit is enforced in application code
-- but we add a check constraint as a safety net
ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_max_attempts CHECK (attempts >= 1 AND attempts <= 10);

-- Add index for finding failed events that need retry
CREATE INDEX IF NOT EXISTS idx_webhook_failed_events
  ON webhook_events(source, status, attempts)
  WHERE status = 'failed';

-- Add last_attempted_at column to track when the last retry occurred
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing records to set last_attempted_at from created_at
UPDATE webhook_events
  SET last_attempted_at = COALESCE(processed_at, created_at)
  WHERE last_attempted_at IS NULL;

COMMENT ON COLUMN webhook_events.attempts IS 'Number of processing attempts. Max 3 before giving up.';
COMMENT ON COLUMN webhook_events.last_attempted_at IS 'Timestamp of the most recent processing attempt.';

COMMIT;
