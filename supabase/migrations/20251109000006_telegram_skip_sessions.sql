-- Telegram Skip Sessions
-- Stores temporary session state for multi-select skip flow
-- Replaces in-memory Map storage to persist across deployments

CREATE TABLE telegram_skip_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  selected_dates TEXT[] NOT NULL DEFAULT '{}',
  message_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient cleanup of expired sessions
CREATE INDEX idx_telegram_skip_sessions_expires ON telegram_skip_sessions(expires_at);

-- Index for customer_id lookups
CREATE INDEX idx_telegram_skip_sessions_customer ON telegram_skip_sessions(customer_id);

COMMENT ON TABLE telegram_skip_sessions IS 'Temporary session state for Telegram /skip multi-select flow (5 minute TTL)';
COMMENT ON COLUMN telegram_skip_sessions.selected_dates IS 'Array of ISO date strings (YYYY-MM-DD) selected by user';
COMMENT ON COLUMN telegram_skip_sessions.message_id IS 'Telegram message ID for calendar UI updates';
COMMENT ON COLUMN telegram_skip_sessions.expires_at IS 'Session expiry time (5 minutes from creation)';

-- RLS Policies
ALTER TABLE telegram_skip_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (webhook uses service role key)
CREATE POLICY "Service role has full access to skip sessions"
  ON telegram_skip_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view sessions (for debugging)
CREATE POLICY "Admins can view skip sessions"
  ON telegram_skip_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Function to cleanup expired sessions
-- This can be called by a scheduled job or on-demand
CREATE OR REPLACE FUNCTION cleanup_expired_skip_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_skip_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_skip_sessions() IS 'Deletes expired skip sessions. Returns number of sessions deleted.';
