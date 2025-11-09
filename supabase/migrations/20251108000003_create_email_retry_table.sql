-- Email Retry Queue Table
-- Stores failed email sends for exponential backoff retry

CREATE TABLE IF NOT EXISTS email_retry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Email metadata
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  category TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,

  -- Retry tracking
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 4,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,

  -- Timestamps
  first_attempted_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'retrying', 'completed', 'failed')) DEFAULT 'pending',

  -- Original context (for debugging)
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

-- Indexes for efficient queries
CREATE INDEX idx_email_retry_status ON email_retry(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_email_retry_next ON email_retry(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX idx_email_retry_category ON email_retry(category);
CREATE INDEX idx_email_retry_idempotency ON email_retry(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Enable RLS
ALTER TABLE email_retry ENABLE ROW LEVEL SECURITY;

-- Comments
COMMENT ON TABLE email_retry IS 'Email delivery retry queue with exponential backoff';
COMMENT ON COLUMN email_retry.attempt_count IS 'Number of send attempts (0 = first attempt pending)';
COMMENT ON COLUMN email_retry.next_retry_at IS 'Calculated exponential backoff time: 5min, 15min, 60min, 240min';
COMMENT ON COLUMN email_retry.idempotency_key IS 'Resend idempotency key to prevent duplicate sends';
COMMENT ON COLUMN email_retry.status IS 'pending = never tried | retrying = in backoff | completed = sent | failed = max attempts reached';
