-- Migration: Fix telegram_deep_link_tokens unique constraint
-- Date: 2026-02-04
--
-- Problem: Migration 20260202510000 added UNIQUE(customer_id), but the system
-- needs TWO tokens per customer:
--   1. Checkout token (paypal_custom_id IS NOT NULL) - for success page deep link
--   2. Email token (paypal_custom_id IS NULL) - for welcome email deep link
--
-- The current constraint blocks email token creation, causing:
--   - INSERT fails with 23505 (duplicate key)
--   - Code silently assumes "already sent" and skips email
--   - New customers never receive onboarding email
--
-- Solution: Replace single UNIQUE with two partial unique indexes:
--   1. Allow max one checkout token per customer
--   2. Allow max one email token per customer

BEGIN;

-- Drop the overly-restrictive constraint
ALTER TABLE telegram_deep_link_tokens
  DROP CONSTRAINT IF EXISTS telegram_deep_link_tokens_customer_id_key;

-- Create partial unique index for checkout tokens (one per customer)
-- These are tokens created during checkout with paypal_custom_id set
CREATE UNIQUE INDEX IF NOT EXISTS telegram_deep_link_tokens_customer_checkout_idx
  ON telegram_deep_link_tokens (customer_id)
  WHERE paypal_custom_id IS NOT NULL;

-- Create partial unique index for email tokens (one per customer)
-- These are tokens created during webhook with paypal_custom_id NULL
CREATE UNIQUE INDEX IF NOT EXISTS telegram_deep_link_tokens_customer_email_idx
  ON telegram_deep_link_tokens (customer_id)
  WHERE paypal_custom_id IS NULL;

COMMENT ON INDEX telegram_deep_link_tokens_customer_checkout_idx IS
  'Ensures one checkout deep link token per customer (has paypal_custom_id)';

COMMENT ON INDEX telegram_deep_link_tokens_customer_email_idx IS
  'Ensures one email deep link token per customer (no paypal_custom_id)';

COMMIT;
