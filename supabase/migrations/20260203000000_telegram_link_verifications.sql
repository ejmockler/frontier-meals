-- ============================================================================
-- TELEGRAM LINK VERIFICATIONS TABLE
-- Security fix for C1: Account ownership verification before linking
-- ============================================================================
-- This table stores pending email verifications for Telegram account linking.
-- When a user clicks a deep link, we now require them to verify they own the
-- email address associated with the customer account before completing the link.
--
-- Flow:
-- 1. User clicks deep link with valid token
-- 2. System creates verification record with 6-digit code (hashed)
-- 3. System sends verification email to customer's email
-- 4. User enters code in Telegram
-- 5. System validates code and completes linking
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_link_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The customer being linked (from the deep link token)
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- The Telegram user attempting to link (from message.from.id)
  telegram_user_id BIGINT NOT NULL,

  -- The Telegram username at time of verification attempt
  telegram_username TEXT,

  -- SHA-256 hash of the 6-digit verification code (never store plaintext)
  code_hash TEXT NOT NULL,

  -- Reference to the deep link token being used (for audit trail)
  token_hash TEXT NOT NULL,

  -- Telegram chat ID for sending follow-up messages
  chat_id BIGINT NOT NULL,

  -- Verification state
  attempts INT DEFAULT 0,  -- Failed code entry attempts
  max_attempts INT DEFAULT 3,  -- Max attempts before invalidation

  -- Timestamps
  expires_at TIMESTAMPTZ NOT NULL,  -- Code expires after 10 minutes
  verified_at TIMESTAMPTZ,  -- When successfully verified (NULL if not yet)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one pending verification per telegram user at a time
  -- (if they try again, old one should be cleaned up first)
  UNIQUE(telegram_user_id, customer_id)
);

-- Index for fast lookup by telegram_user_id (common query pattern)
CREATE INDEX idx_telegram_link_verifications_telegram_user
ON telegram_link_verifications(telegram_user_id)
WHERE verified_at IS NULL;

-- Index for customer lookup (for admin visibility)
CREATE INDEX idx_telegram_link_verifications_customer
ON telegram_link_verifications(customer_id);

-- Index for cleanup of expired verifications
CREATE INDEX idx_telegram_link_verifications_expires
ON telegram_link_verifications(expires_at)
WHERE verified_at IS NULL;

-- Enable RLS
ALTER TABLE telegram_link_verifications ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default, no explicit policies needed for now

-- Comments
COMMENT ON TABLE telegram_link_verifications IS 'Pending email verifications for Telegram account linking. Security measure to prevent account takeover via shared deep links.';
COMMENT ON COLUMN telegram_link_verifications.code_hash IS 'SHA-256 hash of 6-digit verification code. Codes are never stored in plaintext.';
COMMENT ON COLUMN telegram_link_verifications.attempts IS 'Number of failed code entry attempts. Verification invalidated at max_attempts.';
COMMENT ON COLUMN telegram_link_verifications.expires_at IS 'Verification code expires after 10 minutes from creation.';
