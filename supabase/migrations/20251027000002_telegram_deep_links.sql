-- Telegram Deep Link Tokens Table
-- Stores one-time tokens sent in welcome email for Telegram linking

CREATE TABLE IF NOT EXISTS telegram_deep_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX idx_telegram_deep_link_tokens_token ON telegram_deep_link_tokens(token) WHERE used = FALSE;

-- Index for customer lookup
CREATE INDEX idx_telegram_deep_link_tokens_customer ON telegram_deep_link_tokens(customer_id);
