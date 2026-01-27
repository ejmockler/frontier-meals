-- Standardize template slugs to use underscores (matching template service CODE_TEMPLATES)
-- The template service uses underscores: qr_daily, telegram_link, etc.
-- But the seed migration used hyphens: qr-daily, telegram-link, etc.
-- This migration fixes the mismatch.

UPDATE email_templates SET slug = 'qr_daily' WHERE slug = 'qr-daily';
UPDATE email_templates SET slug = 'telegram_link' WHERE slug = 'telegram-link';
UPDATE email_templates SET slug = 'dunning_soft' WHERE slug = 'dunning-soft';
UPDATE email_templates SET slug = 'dunning_retry' WHERE slug = 'dunning-retry';
UPDATE email_templates SET slug = 'dunning_final' WHERE slug = 'dunning-final';
UPDATE email_templates SET slug = 'canceled_notice' WHERE slug = 'dunning-canceled';
UPDATE email_templates SET slug = 'admin_magic_link' WHERE slug = 'admin-magic-link';
UPDATE email_templates SET slug = 'schedule_change' WHERE slug = 'schedule-change';
-- telegram_correction already uses underscore from its seed migration
