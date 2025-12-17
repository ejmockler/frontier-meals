-- Rate Limiting Table and Functions
--
-- This migration creates infrastructure for preventing brute force and DoS attacks
-- by tracking request rates per key (e.g., kiosk session, email, IP address).

-- Create rate_limits table
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_limits_key_unique UNIQUE (key),
  CONSTRAINT rate_limits_count_positive CHECK (count > 0)
);

-- Add index for cleanup operations
CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

-- Enable RLS (but allow service role to bypass)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (no policy needed - service role bypasses RLS)
-- No public access needed - only used by server-side code

COMMENT ON TABLE rate_limits IS 'Rate limiting tracking table to prevent brute force and DoS attacks';
COMMENT ON COLUMN rate_limits.key IS 'Unique identifier for rate limit scope (e.g., "kiosk:session123", "magic:email@example.com", "checkout:192.168.1.1")';
COMMENT ON COLUMN rate_limits.count IS 'Number of requests in current time window';
COMMENT ON COLUMN rate_limits.window_start IS 'Start of current rate limit time window';
COMMENT ON COLUMN rate_limits.created_at IS 'When this rate limit key was first created';

-- Function to clean up old rate limit records
-- This should be called periodically (via cron or manual cleanup)
CREATE OR REPLACE FUNCTION cleanup_rate_limits(max_age_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete records where window_start is older than max_age_hours
  DELETE FROM rate_limits
  WHERE window_start < now() - (max_age_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_rate_limits(INTEGER) IS 'Cleans up old rate limit records. Returns number of deleted records. Default: delete records older than 24 hours.';

-- Function to atomically check and increment rate limit
-- Returns JSON with: allowed (boolean), remaining (integer), reset_at (timestamptz)
CREATE OR REPLACE FUNCTION check_rate_limit(
  limit_key TEXT,
  max_requests INTEGER,
  window_minutes INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  current_record RECORD;
  window_expired BOOLEAN;
  new_count INTEGER;
  reset_at TIMESTAMPTZ;
  remaining INTEGER;
  allowed BOOLEAN;
BEGIN
  -- Try to get existing record
  SELECT * INTO current_record
  FROM rate_limits
  WHERE key = limit_key
  FOR UPDATE; -- Lock the row for update

  IF NOT FOUND THEN
    -- First request - insert new record
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (limit_key, 1, now())
    RETURNING window_start + (window_minutes || ' minutes')::INTERVAL INTO reset_at;

    RETURN json_build_object(
      'allowed', true,
      'remaining', max_requests - 1,
      'reset_at', reset_at
    );
  END IF;

  -- Check if window has expired
  window_expired := current_record.window_start + (window_minutes || ' minutes')::INTERVAL < now();

  IF window_expired THEN
    -- Window expired - reset count to 1 and start new window
    UPDATE rate_limits
    SET count = 1, window_start = now()
    WHERE key = limit_key
    RETURNING window_start + (window_minutes || ' minutes')::INTERVAL INTO reset_at;

    RETURN json_build_object(
      'allowed', true,
      'remaining', max_requests - 1,
      'reset_at', reset_at
    );
  END IF;

  -- Window still active - check if we're over the limit
  IF current_record.count >= max_requests THEN
    -- Over limit - reject
    reset_at := current_record.window_start + (window_minutes || ' minutes')::INTERVAL;

    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'reset_at', reset_at
    );
  END IF;

  -- Under limit - increment and allow
  UPDATE rate_limits
  SET count = count + 1
  WHERE key = limit_key
  RETURNING count, window_start + (window_minutes || ' minutes')::INTERVAL
  INTO new_count, reset_at;

  remaining := max_requests - new_count;

  RETURN json_build_object(
    'allowed', true,
    'remaining', remaining,
    'reset_at', reset_at
  );
END;
$$;

COMMENT ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) IS 'Atomically checks and increments rate limit. Returns JSON with allowed (boolean), remaining (integer), reset_at (timestamptz).';
