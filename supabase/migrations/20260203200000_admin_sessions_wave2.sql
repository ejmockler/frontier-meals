-- Admin Authentication Security Fixes - Wave 2
-- Migration: 20260203200000_admin_sessions_wave2.sql
-- Date: 2026-02-03
-- Purpose: Database-backed session tracking for admin authentication
--
-- Fixes included:
-- C2: Create admin_sessions table for token tracking and revocation
-- C7: Enable RLS on admin_magic_links table
-- C9: Support maximum session limit per admin (via revocation)
-- Provides audit trail for session creation/revocation

BEGIN;

-- ============================================================================
-- C7: Enable RLS on admin_magic_links table
-- ============================================================================
-- Previously, the table was queryable by anyone with anon key, leaking token hashes.
-- Only service_role should have access to this table.

ALTER TABLE admin_magic_links ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API endpoints)
CREATE POLICY admin_magic_links_service_all ON admin_magic_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE admin_magic_links IS 'One-time tokens for passwordless admin authentication. RLS enabled - service_role only.';

-- ============================================================================
-- C2: Create admin_sessions table for session tracking and revocation
-- ============================================================================
-- Tracks all issued admin session JWTs with their JTIs.
-- Allows revocation of individual sessions without rotating the signing key.
-- Also supports tracking expiration and usage patterns.

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Admin identification (email-based, matches admin_magic_links pattern)
  admin_email TEXT NOT NULL,

  -- JWT identification
  jti TEXT NOT NULL UNIQUE,  -- JWT ID - unique identifier for this token

  -- Lifecycle tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- Session expiration (7 days from creation)
  revoked_at TIMESTAMPTZ,           -- Set when session is revoked
  revoked_by TEXT,                  -- Admin email who revoked the session
  revocation_reason TEXT,           -- Optional reason for revocation

  -- Audit metadata
  ip_address TEXT,                  -- Client IP at session creation
  user_agent TEXT,                  -- Browser/client user agent

  -- Usage tracking
  last_used_at TIMESTAMPTZ,         -- Updated on each successful validation
  use_count INTEGER NOT NULL DEFAULT 0,  -- Number of times session was validated

  -- Derived flag for quick filtering
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,

  -- Constraints
  CONSTRAINT admin_sessions_jti_unique UNIQUE (jti)
);

-- Index for quick lookup by admin_email (for listing sessions per admin)
CREATE INDEX IF NOT EXISTS admin_sessions_admin_email_idx ON admin_sessions(admin_email);

-- Index for finding active (non-revoked, non-expired) sessions
CREATE INDEX IF NOT EXISTS admin_sessions_active_idx ON admin_sessions(is_revoked, expires_at)
  WHERE is_revoked = FALSE;

-- Index for JTI lookups (session validation)
CREATE INDEX IF NOT EXISTS admin_sessions_jti_idx ON admin_sessions(jti);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at);

COMMENT ON TABLE admin_sessions IS 'Tracks admin session JWTs for revocation capability and audit logging (C2, C7, C9)';
COMMENT ON COLUMN admin_sessions.jti IS 'JWT ID claim - unique identifier from the token, used for revocation checking';
COMMENT ON COLUMN admin_sessions.revoked_at IS 'When set, the session is no longer valid regardless of expiration';
COMMENT ON COLUMN admin_sessions.is_revoked IS 'Denormalized flag for quick filtering. Set TRUE when revoked_at is set.';
COMMENT ON COLUMN admin_sessions.use_count IS 'Number of successful validations - helps detect suspicious usage patterns';
COMMENT ON COLUMN admin_sessions.ip_address IS 'Client IP address at session creation for audit trail';
COMMENT ON COLUMN admin_sessions.user_agent IS 'Browser user agent at session creation for audit trail';

-- ============================================================================
-- Function: validate_admin_session
-- ============================================================================
-- Validates an admin session JWT by checking the admin_sessions table.
-- Returns session details if valid, NULL if revoked/expired/not found.
-- Also updates last_used_at and use_count for tracking.

CREATE OR REPLACE FUNCTION validate_admin_session(
  p_jti TEXT
) RETURNS TABLE(
  valid BOOLEAN,
  admin_email TEXT,
  error_code TEXT
) AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Look up session by JTI
  SELECT * INTO v_session
  FROM admin_sessions s
  WHERE s.jti = p_jti
  FOR UPDATE;  -- Lock row during validation

  -- Check if session exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'SESSION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Check if session is revoked
  IF v_session.is_revoked OR v_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'SESSION_REVOKED'::TEXT;
    RETURN;
  END IF;

  -- Check if session is expired
  IF v_session.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'SESSION_EXPIRED'::TEXT;
    RETURN;
  END IF;

  -- Session is valid - update usage tracking
  UPDATE admin_sessions
  SET
    last_used_at = NOW(),
    use_count = use_count + 1
  WHERE jti = p_jti;

  RETURN QUERY SELECT
    TRUE,
    v_session.admin_email,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_admin_session IS 'Validates admin session and updates usage tracking. Returns error_code if invalid.';

-- ============================================================================
-- Function: revoke_admin_session
-- ============================================================================
-- Revokes an admin session by JTI.

CREATE OR REPLACE FUNCTION revoke_admin_session(
  p_jti TEXT,
  p_revoked_by TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
  v_admin_email TEXT;
BEGIN
  -- Get admin email for audit log
  SELECT admin_email INTO v_admin_email
  FROM admin_sessions
  WHERE jti = p_jti;

  UPDATE admin_sessions
  SET
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revocation_reason = p_reason,
    is_revoked = TRUE
  WHERE jti = p_jti
    AND is_revoked = FALSE;  -- Only revoke if not already revoked

  v_updated := FOUND;

  -- Audit log the revocation
  IF v_updated THEN
    INSERT INTO audit_log (actor, action, subject, metadata)
    VALUES (
      p_revoked_by,
      'admin_session_revoked',
      'admin_session:' || p_jti,
      jsonb_build_object(
        'admin_email', v_admin_email,
        'reason', p_reason
      )
    );
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION revoke_admin_session IS 'Revokes an admin session and logs the action';

-- ============================================================================
-- Function: revoke_all_admin_sessions
-- ============================================================================
-- Revokes all active sessions for a specific admin (emergency use or logout all).

CREATE OR REPLACE FUNCTION revoke_all_admin_sessions(
  p_admin_email TEXT,
  p_revoked_by TEXT,
  p_reason TEXT DEFAULT 'Bulk revocation'
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE admin_sessions
  SET
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revocation_reason = p_reason,
    is_revoked = TRUE
  WHERE admin_email = p_admin_email
    AND is_revoked = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Audit log the bulk revocation
  IF v_count > 0 THEN
    INSERT INTO audit_log (actor, action, subject, metadata)
    VALUES (
      p_revoked_by,
      'admin_sessions_bulk_revoked',
      'admin:' || p_admin_email,
      jsonb_build_object(
        'count', v_count,
        'reason', p_reason
      )
    );
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION revoke_all_admin_sessions IS 'Revokes all sessions for an admin (emergency key compromise response or logout all)';

-- ============================================================================
-- Function: get_active_admin_sessions
-- ============================================================================
-- Returns all active sessions for an admin (for session management UI).

CREATE OR REPLACE FUNCTION get_active_admin_sessions(
  p_admin_email TEXT
) RETURNS TABLE(
  id UUID,
  jti TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.jti,
    s.created_at,
    s.expires_at,
    s.ip_address,
    s.user_agent,
    s.last_used_at,
    s.use_count
  FROM admin_sessions s
  WHERE s.admin_email = p_admin_email
    AND s.is_revoked = FALSE
    AND s.expires_at > NOW()
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_active_admin_sessions IS 'Returns all active sessions for an admin for session management UI';

-- ============================================================================
-- Function: count_active_admin_sessions
-- ============================================================================
-- Returns count of active sessions for an admin (for session limit enforcement).

CREATE OR REPLACE FUNCTION count_active_admin_sessions(
  p_admin_email TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM admin_sessions
  WHERE admin_email = p_admin_email
    AND is_revoked = FALSE
    AND expires_at > NOW();

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION count_active_admin_sessions IS 'Returns count of active sessions for session limit enforcement (C9)';

-- ============================================================================
-- Function: cleanup_expired_admin_sessions
-- ============================================================================
-- Deletes sessions that have been expired for more than 30 days.
-- Can be called by a cron job.

CREATE OR REPLACE FUNCTION cleanup_expired_admin_sessions() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM admin_sessions
  WHERE expires_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO audit_log (actor, action, subject, metadata)
    VALUES (
      'system',
      'admin_sessions_cleanup',
      'admin_sessions',
      jsonb_build_object('deleted_count', v_count)
    );
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_admin_sessions IS 'Cleanup job to delete sessions expired more than 30 days ago';

-- ============================================================================
-- RLS Policies for admin_sessions
-- ============================================================================
-- Enable RLS on admin_sessions table

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API endpoints)
CREATE POLICY admin_sessions_service_all ON admin_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users (admin API calls) can read sessions
CREATE POLICY admin_sessions_authenticated_read ON admin_sessions
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
