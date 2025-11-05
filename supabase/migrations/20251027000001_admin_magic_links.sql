-- Admin Magic Links Table
-- Stores one-time tokens for passwordless admin authentication

CREATE TABLE IF NOT EXISTS admin_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX idx_admin_magic_links_token ON admin_magic_links(token) WHERE used = FALSE;

-- Index for cleanup queries
CREATE INDEX idx_admin_magic_links_expires ON admin_magic_links(expires_at);

-- Auto-delete expired links after 24 hours (cleanup job)
-- This keeps the table clean without manual intervention
