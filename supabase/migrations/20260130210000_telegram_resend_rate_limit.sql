-- Telegram Resend Rate Limit Table
-- Tracks when users request /resend to prevent abuse

CREATE TABLE IF NOT EXISTS telegram_resend_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  last_resend_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by telegram_user_id
CREATE INDEX idx_telegram_resend_rate_limit_user ON telegram_resend_rate_limit(telegram_user_id);

-- Add constraint: one record per telegram user
CREATE UNIQUE INDEX idx_telegram_resend_rate_limit_unique_user ON telegram_resend_rate_limit(telegram_user_id);
