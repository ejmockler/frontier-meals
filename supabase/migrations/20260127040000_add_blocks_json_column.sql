-- Migration: Add blocks_json column to email_templates table
-- Purpose: Support block editor mode for visual email template editing
--
-- When blocks_json is NULL: Template uses HTML-only mode (legacy/manual HTML editing)
-- When blocks_json is NOT NULL: Template uses block editor mode (structured JSON blocks)

ALTER TABLE email_templates
ADD COLUMN blocks_json JSONB DEFAULT NULL;

COMMENT ON COLUMN email_templates.blocks_json IS 'JSON representation of email template blocks for the visual block editor. NULL indicates HTML-only mode, non-NULL indicates block editor mode.';
