-- Migration: Add unique constraint on telegram_deep_link_tokens.customer_id
-- Issue: Webhook UPSERT uses onConflict: 'customer_id' but no unique constraint exists
--
-- Problem: The handleCheckoutCompleted webhook uses:
--   supabase.from('telegram_deep_link_tokens').upsert(..., { onConflict: 'customer_id' })
-- But the table only has an INDEX on customer_id, not a UNIQUE constraint.
-- This causes Supabase to INSERT duplicate rows instead of updating.
--
-- Solution: Add unique constraint to match the UPSERT pattern

BEGIN;

-- First, remove any duplicate tokens (keep the most recent one per customer)
-- This is needed before we can add the UNIQUE constraint
DELETE FROM telegram_deep_link_tokens
WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id) id
  FROM telegram_deep_link_tokens
  ORDER BY customer_id, created_at DESC
);

-- Add unique constraint on customer_id
-- This allows the webhook UPSERT with onConflict: 'customer_id' to work correctly
ALTER TABLE telegram_deep_link_tokens
  ADD CONSTRAINT telegram_deep_link_tokens_customer_id_key UNIQUE (customer_id);

-- Drop the redundant index (unique constraint creates an implicit index)
DROP INDEX IF EXISTS idx_telegram_deep_link_tokens_customer;

COMMENT ON CONSTRAINT telegram_deep_link_tokens_customer_id_key ON telegram_deep_link_tokens IS
  'Ensures one deep link token per customer. Webhook UPSERT depends on this for idempotency.';

COMMIT;
