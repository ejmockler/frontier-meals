-- Email Template Schema Fix
-- Fixes column name mismatch and adds new columns for template system overhaul
-- Date: 2026-01-27

-- ============================================================================
-- 1. RENAME COLUMN: body → html_body
-- ============================================================================
-- The code consistently uses 'html_body' but the schema defined 'body'
-- This brings the schema in line with the codebase

ALTER TABLE email_templates
  RENAME COLUMN body TO html_body;

COMMENT ON COLUMN email_templates.html_body IS 'HTML content with variable placeholders (e.g., {{customer_name}}, {{qr_url}})';

-- ============================================================================
-- 2. ADD is_system COLUMN
-- ============================================================================
-- Distinguishes between system-provided templates and custom admin-created ones
-- System templates (like qr_daily, dunning_soft) should not be deleted

ALTER TABLE email_templates
  ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;

CREATE INDEX idx_template_is_system ON email_templates(is_system) WHERE is_system = TRUE;

COMMENT ON COLUMN email_templates.is_system IS 'TRUE for built-in system templates (qr_daily, dunning_*, etc). System templates cannot be deleted, only versioned.';

-- ============================================================================
-- 3. ADD variables_schema COLUMN
-- ============================================================================
-- Stores the expected variable structure for validation and documentation
-- Example: {"customer_name": "string", "qr_url": "url", "service_date": "date"}

ALTER TABLE email_templates
  ADD COLUMN variables_schema JSONB DEFAULT '{}'::jsonb NOT NULL;

-- GIN index for efficient JSONB queries (e.g., finding all templates using a specific variable)
CREATE INDEX idx_template_variables_schema ON email_templates USING gin (variables_schema jsonb_path_ops);

COMMENT ON COLUMN email_templates.variables_schema IS 'JSON schema defining expected variables. Format: {"variable_name": "type", ...}. Types: string, number, url, date, boolean';

-- ============================================================================
-- 4. VERIFY EXISTING INDEXES
-- ============================================================================
-- Existing indexes from original schema are optimal:
-- - idx_template_slug_active: Fast lookup of active template by slug
-- - idx_template_slug_version: Version history ordering
-- No changes needed to existing indexes

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- This migration is safe to run on existing data:
-- 1. Column rename (body → html_body) preserves all existing data
-- 2. is_system defaults to FALSE for existing templates (correct assumption)
-- 3. variables_schema defaults to empty object (can be populated later)
-- 4. No changes to RLS policies required - they reference table, not columns
