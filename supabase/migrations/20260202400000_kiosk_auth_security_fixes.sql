-- Kiosk Authentication Security Fixes
-- Migration: 20260202400000_kiosk_auth_security_fixes.sql
-- Date: 2026-02-02
-- Purpose: Critical security fixes for kiosk authentication system
--
-- Fixes included:
-- C1: Create kiosk_sessions table for token tracking and revocation
-- W1: Support token expiration tracking
-- W2: JTI tracking for replay prevention
-- W4: Audit logging for session creation/revocation

BEGIN;

-- ============================================================================
-- C1: Create kiosk_sessions table for token tracking and revocation
-- ============================================================================
-- Tracks all issued kiosk session JWTs with their JTIs.
-- Allows revocation of individual sessions without rotating the signing key.
-- Also supports tracking expiration and usage patterns.

CREATE TABLE IF NOT EXISTS kiosk_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- JWT identification
  jti TEXT NOT NULL UNIQUE,  -- JWT ID - unique identifier for this token

  -- Session metadata (from JWT claims)
  kiosk_id TEXT NOT NULL,    -- Identifier for the kiosk device
  location TEXT NOT NULL,    -- Physical location of the kiosk

  -- Lifecycle tracking
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,    -- NULL for non-expiring tokens (legacy), set for new tokens
  revoked_at TIMESTAMPTZ,    -- Set when session is revoked
  revoked_by TEXT,           -- Admin email who revoked the session
  revocation_reason TEXT,    -- Optional reason for revocation

  -- Usage tracking
  last_used_at TIMESTAMPTZ,  -- Updated on each successful validation
  use_count INTEGER NOT NULL DEFAULT 0,  -- Number of times token was validated

  -- Audit
  created_by TEXT NOT NULL,  -- Admin email who created the session

  -- Indexes
  CONSTRAINT kiosk_sessions_jti_unique UNIQUE (jti)
);

-- Index for quick lookup by kiosk_id (for listing sessions per kiosk)
CREATE INDEX IF NOT EXISTS kiosk_sessions_kiosk_id_idx ON kiosk_sessions(kiosk_id);

-- Index for finding active (non-revoked, non-expired) sessions
CREATE INDEX IF NOT EXISTS kiosk_sessions_active_idx ON kiosk_sessions(revoked_at)
  WHERE revoked_at IS NULL;

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS kiosk_sessions_expires_idx ON kiosk_sessions(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE kiosk_sessions IS 'Tracks kiosk session JWTs for revocation capability and audit logging (C1, W1, W2, W4)';
COMMENT ON COLUMN kiosk_sessions.jti IS 'JWT ID claim - unique identifier from the token';
COMMENT ON COLUMN kiosk_sessions.revoked_at IS 'When set, the session is no longer valid regardless of expiration';
COMMENT ON COLUMN kiosk_sessions.use_count IS 'Number of successful validations - helps detect suspicious usage patterns';

-- ============================================================================
-- Function: validate_kiosk_session
-- ============================================================================
-- Validates a kiosk session JWT by checking the kiosk_sessions table.
-- Returns session details if valid, NULL if revoked/expired/not found.
-- Also updates last_used_at and use_count for tracking.

CREATE OR REPLACE FUNCTION validate_kiosk_session(
  p_jti TEXT
) RETURNS TABLE(
  valid BOOLEAN,
  kiosk_id TEXT,
  location TEXT,
  error_code TEXT
) AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Look up session by JTI
  SELECT * INTO v_session
  FROM kiosk_sessions
  WHERE jti = p_jti
  FOR UPDATE;  -- Lock row during validation

  -- Check if session exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'SESSION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Check if session is revoked
  IF v_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'SESSION_REVOKED'::TEXT;
    RETURN;
  END IF;

  -- Check if session is expired
  IF v_session.expires_at IS NOT NULL AND v_session.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'SESSION_EXPIRED'::TEXT;
    RETURN;
  END IF;

  -- Session is valid - update usage tracking
  UPDATE kiosk_sessions
  SET
    last_used_at = NOW(),
    use_count = use_count + 1
  WHERE jti = p_jti;

  RETURN QUERY SELECT
    TRUE,
    v_session.kiosk_id,
    v_session.location,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_kiosk_session IS 'Validates kiosk session and updates usage tracking. Returns error_code if invalid.';

-- ============================================================================
-- Function: revoke_kiosk_session
-- ============================================================================
-- Revokes a kiosk session by JTI.

CREATE OR REPLACE FUNCTION revoke_kiosk_session(
  p_jti TEXT,
  p_revoked_by TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE kiosk_sessions
  SET
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revocation_reason = p_reason
  WHERE jti = p_jti
    AND revoked_at IS NULL;  -- Only revoke if not already revoked

  v_updated := FOUND;

  -- Audit log the revocation
  IF v_updated THEN
    INSERT INTO audit_log (actor, action, subject, metadata)
    VALUES (
      p_revoked_by,
      'kiosk_session_revoked',
      'kiosk_session:' || p_jti,
      jsonb_build_object(
        'reason', p_reason
      )
    );
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_kiosk_session IS 'Revokes a kiosk session and logs the action';

-- ============================================================================
-- Function: revoke_all_kiosk_sessions
-- ============================================================================
-- Revokes all active sessions for a specific kiosk (emergency use).

CREATE OR REPLACE FUNCTION revoke_all_kiosk_sessions(
  p_kiosk_id TEXT,
  p_revoked_by TEXT,
  p_reason TEXT DEFAULT 'Bulk revocation'
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE kiosk_sessions
  SET
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revocation_reason = p_reason
  WHERE kiosk_id = p_kiosk_id
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Audit log the bulk revocation
  IF v_count > 0 THEN
    INSERT INTO audit_log (actor, action, subject, metadata)
    VALUES (
      p_revoked_by,
      'kiosk_sessions_bulk_revoked',
      'kiosk:' || p_kiosk_id,
      jsonb_build_object(
        'count', v_count,
        'reason', p_reason
      )
    );
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_all_kiosk_sessions IS 'Revokes all sessions for a kiosk (emergency key compromise response)';

-- ============================================================================
-- RLS Policies
-- ============================================================================
-- Enable RLS on kiosk_sessions table

ALTER TABLE kiosk_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API endpoints)
CREATE POLICY kiosk_sessions_service_all ON kiosk_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users (admin API calls) can read sessions
CREATE POLICY kiosk_sessions_authenticated_read ON kiosk_sessions
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
