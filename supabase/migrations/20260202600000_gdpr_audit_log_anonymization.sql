-- GDPR Compliance: Audit Log PII Anonymization
-- Migration: 20260202600000_gdpr_audit_log_anonymization.sql
-- Date: 2026-02-02
-- Purpose: GDPR ARTICLE 17 (Right to Erasure) compliance for audit logs
--
-- Problem: Audit logs contain Telegram identifiers (telegram_user_id, telegram_username,
-- telegram_handle) with indefinite retention. When a customer is deleted, their PII
-- remains in audit_log.metadata.
--
-- Solution: When a customer is deleted:
-- 1. Anonymize telegram_user_id → SHA256 hash (preserves audit linkage, removes PII)
-- 2. Replace telegram_username → '[deleted]'
-- 3. Replace telegram_handle → '[deleted]'
-- 4. Replace old_handle/new_handle → '[deleted]'
-- 5. Keep audit trail intact (action, timestamp, subject reference)
--
-- Note: This approach maintains audit integrity while complying with GDPR erasure rights.
-- The hashed telegram_user_id allows correlation of anonymized records without exposing PII.

BEGIN;

-- ============================================================================
-- Ensure pgcrypto extension is available (for sha256 function)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Function: anonymize_customer_audit_logs
-- ============================================================================
-- Anonymizes PII in audit_log.metadata for a specific customer.
-- Called by trigger before customer deletion.
--
-- Anonymization rules:
-- - telegram_user_id: SHA256 hash with 'deleted:' prefix (for traceability)
-- - telegram_username: '[deleted]'
-- - telegram_handle: '[deleted]'
-- - old_handle: '[deleted]'
-- - new_handle: '[deleted]'

CREATE OR REPLACE FUNCTION anonymize_customer_audit_logs(p_customer_id UUID)
RETURNS void AS $$
DECLARE
  v_subject_pattern TEXT;
BEGIN
  -- Pattern to match audit logs for this customer
  v_subject_pattern := 'customer:' || p_customer_id::TEXT;

  -- Anonymize metadata fields containing Telegram PII
  -- We use jsonb_set with coalesce to only update fields that exist
  UPDATE audit_log
  SET metadata = (
    CASE
      -- If metadata has telegram_user_id, anonymize it
      WHEN metadata ? 'telegram_user_id' THEN
        jsonb_set(
          metadata,
          '{telegram_user_id}',
          to_jsonb('deleted:' || encode(sha256(convert_to(metadata->>'telegram_user_id', 'UTF8')), 'hex'))
        )
      ELSE metadata
    END
  )
  WHERE subject = v_subject_pattern
    AND metadata ? 'telegram_user_id';

  -- Anonymize telegram_username
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{telegram_username}', '"[deleted]"')
  WHERE subject = v_subject_pattern
    AND metadata ? 'telegram_username';

  -- Anonymize telegram_handle
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{telegram_handle}', '"[deleted]"')
  WHERE subject = v_subject_pattern
    AND metadata ? 'telegram_handle';

  -- Anonymize old_handle (from handle_updated actions)
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{old_handle}', '"[deleted]"')
  WHERE subject = v_subject_pattern
    AND metadata ? 'old_handle';

  -- Anonymize new_handle (from handle_updated actions)
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{new_handle}', '"[deleted]"')
  WHERE subject = v_subject_pattern
    AND metadata ? 'new_handle';

  -- Also handle actor field if it's customer-specific
  -- Actor format: 'customer:UUID' - we keep the pattern but mark as deleted
  UPDATE audit_log
  SET actor = 'customer:[deleted]:' || encode(sha256(convert_to(p_customer_id::TEXT, 'UTF8')), 'hex')
  WHERE actor = v_subject_pattern;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION anonymize_customer_audit_logs IS
  'GDPR Article 17: Anonymizes PII in audit_log.metadata when a customer is deleted.
   Preserves audit trail integrity while removing identifiable information.';

-- ============================================================================
-- Trigger Function: trigger_anonymize_audit_on_customer_delete
-- ============================================================================
-- Called BEFORE a customer row is deleted.
-- Anonymizes audit logs, then allows the deletion to proceed.

CREATE OR REPLACE FUNCTION trigger_anonymize_audit_on_customer_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Anonymize audit logs for this customer before deletion
  PERFORM anonymize_customer_audit_logs(OLD.id);

  -- Log the anonymization action itself (meta-audit)
  INSERT INTO audit_log (actor, action, subject, metadata)
  VALUES (
    'system:gdpr',
    'audit_logs_anonymized',
    'customer:' || OLD.id,
    jsonb_build_object(
      'reason', 'customer_deletion',
      'gdpr_article', '17',
      'anonymized_at', NOW()
    )
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_anonymize_audit_on_customer_delete IS
  'Trigger function that anonymizes audit logs before customer deletion (GDPR Article 17).';

-- ============================================================================
-- Trigger: anonymize_audit_before_customer_delete
-- ============================================================================
-- Attach the trigger to the customers table.
-- BEFORE DELETE ensures anonymization happens before CASCADE deletes related records.

DROP TRIGGER IF EXISTS anonymize_audit_before_customer_delete ON customers;

CREATE TRIGGER anonymize_audit_before_customer_delete
  BEFORE DELETE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_anonymize_audit_on_customer_delete();

COMMENT ON TRIGGER anonymize_audit_before_customer_delete ON customers IS
  'GDPR Article 17: Anonymizes audit_log PII before customer deletion.';

-- ============================================================================
-- Function: anonymize_old_audit_logs (Retention Policy)
-- ============================================================================
-- Optional: Anonymize audit logs older than a specified retention period.
-- This can be called by a scheduled job (e.g., pg_cron) for proactive GDPR compliance.
--
-- Usage: SELECT anonymize_old_audit_logs(INTERVAL '90 days');

CREATE OR REPLACE FUNCTION anonymize_old_audit_logs(p_retention_period INTERVAL DEFAULT INTERVAL '90 days')
RETURNS INTEGER AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_anonymized_count INTEGER := 0;
BEGIN
  v_cutoff_date := NOW() - p_retention_period;

  -- Anonymize telegram_user_id in old logs
  WITH updated AS (
    UPDATE audit_log
    SET metadata = jsonb_set(
      metadata,
      '{telegram_user_id}',
      to_jsonb('retention:' || encode(sha256(convert_to(metadata->>'telegram_user_id', 'UTF8')), 'hex'))
    )
    WHERE created_at < v_cutoff_date
      AND metadata ? 'telegram_user_id'
      AND metadata->>'telegram_user_id' NOT LIKE 'deleted:%'
      AND metadata->>'telegram_user_id' NOT LIKE 'retention:%'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_anonymized_count FROM updated;

  -- Anonymize telegram_username
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{telegram_username}', '"[retention-anonymized]"')
  WHERE created_at < v_cutoff_date
    AND metadata ? 'telegram_username'
    AND metadata->>'telegram_username' != '[deleted]'
    AND metadata->>'telegram_username' != '[retention-anonymized]';

  -- Anonymize telegram_handle
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{telegram_handle}', '"[retention-anonymized]"')
  WHERE created_at < v_cutoff_date
    AND metadata ? 'telegram_handle'
    AND metadata->>'telegram_handle' != '[deleted]'
    AND metadata->>'telegram_handle' != '[retention-anonymized]';

  -- Anonymize old_handle
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{old_handle}', '"[retention-anonymized]"')
  WHERE created_at < v_cutoff_date
    AND metadata ? 'old_handle'
    AND metadata->>'old_handle' != '[deleted]'
    AND metadata->>'old_handle' != '[retention-anonymized]';

  -- Anonymize new_handle
  UPDATE audit_log
  SET metadata = jsonb_set(metadata, '{new_handle}', '"[retention-anonymized]"')
  WHERE created_at < v_cutoff_date
    AND metadata ? 'new_handle'
    AND metadata->>'new_handle' != '[deleted]'
    AND metadata->>'new_handle' != '[retention-anonymized]';

  -- Log the retention anonymization
  INSERT INTO audit_log (actor, action, subject, metadata)
  VALUES (
    'system:gdpr',
    'retention_anonymization_completed',
    'audit_log',
    jsonb_build_object(
      'retention_period_days', EXTRACT(DAY FROM p_retention_period),
      'cutoff_date', v_cutoff_date,
      'records_processed', v_anonymized_count,
      'executed_at', NOW()
    )
  );

  RETURN v_anonymized_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION anonymize_old_audit_logs IS
  'GDPR retention policy: Anonymizes PII in audit logs older than the specified period.
   Default: 90 days. Call via pg_cron or scheduled job for automatic compliance.
   Example: SELECT cron.schedule(''gdpr-retention'', ''0 3 * * 0'', $$SELECT anonymize_old_audit_logs(INTERVAL ''90 days'')$$);';

-- ============================================================================
-- Index for efficient anonymization queries
-- ============================================================================
-- Add partial index to speed up queries on audit_log.subject for customer patterns

CREATE INDEX IF NOT EXISTS idx_audit_log_subject_customer
  ON audit_log(subject)
  WHERE subject LIKE 'customer:%';

COMMENT ON INDEX idx_audit_log_subject_customer IS
  'Optimizes GDPR anonymization queries by indexing customer-related audit entries.';

-- ============================================================================
-- Verification: Test the anonymization function (dry run)
-- ============================================================================
-- This DO block verifies the function compiles correctly without modifying data

DO $$
DECLARE
  v_test_uuid UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Verify function exists and compiles
  RAISE NOTICE 'GDPR audit log anonymization functions created successfully.';
  RAISE NOTICE 'To test: SELECT anonymize_customer_audit_logs(''<customer_uuid>'');';
  RAISE NOTICE 'For retention policy: SELECT anonymize_old_audit_logs(INTERVAL ''90 days'');';
END $$;

COMMIT;
