-- Add PayPal custom_id tracking to telegram_deep_link_tokens
-- This allows us to link tokens created at checkout to customers created at webhook
-- Fixes race condition where success page token differs from email token
-- Date: 2026-01-30

-- 1. Make customer_id nullable (needed for tokens created before customer exists)
ALTER TABLE telegram_deep_link_tokens
ALTER COLUMN customer_id DROP NOT NULL;

-- 2. Add paypal_custom_id column for linking tokens to subscriptions before customer creation
ALTER TABLE telegram_deep_link_tokens
ADD COLUMN paypal_custom_id TEXT;

-- 3. Create index for fast lookup by custom_id during webhook processing
CREATE INDEX idx_telegram_deep_link_tokens_paypal_custom_id
ON telegram_deep_link_tokens(paypal_custom_id)
WHERE paypal_custom_id IS NOT NULL AND used = FALSE;

-- 4. Add comment explaining the purpose
COMMENT ON COLUMN telegram_deep_link_tokens.paypal_custom_id IS
'PayPal subscription custom_id (token_hash) used to link checkout token to webhook customer creation. Enables unified token flow where success page and email use the same token.';
