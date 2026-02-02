-- Migration: Token Claim Race Condition Fix (C2)
--
-- Problem: Race condition in token activation where multiple Telegram users
-- could claim the same token during the 5-second polling window when
-- customer_id is NULL (PayPal flow).
--
-- Solution: Add claimed_by_telegram_user_id column for atomic claiming.
-- The webhook handler now does an atomic UPDATE that sets this column
-- ONLY IF it's NULL, ensuring only one user can claim a token.
--
-- Date: 2026-02-03

-- 1. Add claimed_by_telegram_user_id column
-- This tracks which Telegram user has claimed (but not yet completed) a token
ALTER TABLE telegram_deep_link_tokens
ADD COLUMN claimed_by_telegram_user_id BIGINT;

-- 2. Add claimed_at timestamp
-- Records when the token was claimed (for debugging/auditing)
ALTER TABLE telegram_deep_link_tokens
ADD COLUMN claimed_at TIMESTAMPTZ;

-- 3. Create index for looking up tokens by claiming user
-- This allows users to retry claiming their own token
CREATE INDEX idx_telegram_deep_link_tokens_claimed_by
ON telegram_deep_link_tokens(claimed_by_telegram_user_id)
WHERE claimed_by_telegram_user_id IS NOT NULL AND used = FALSE;

-- 4. Add comments explaining the columns
COMMENT ON COLUMN telegram_deep_link_tokens.claimed_by_telegram_user_id IS
'Telegram user ID that has claimed this token. Used for atomic claim operation to prevent race conditions where multiple users could claim the same token during PayPal webhook delay.';

COMMENT ON COLUMN telegram_deep_link_tokens.claimed_at IS
'Timestamp when the token was claimed by a Telegram user. Used for debugging and potential cleanup of stale claims.';

-- Note: The claiming logic works as follows:
-- 1. Token is created at checkout with customer_id=NULL (PayPal) or customer_id set (Stripe)
-- 2. User clicks deep link and bot attempts atomic claim:
--    UPDATE ... SET claimed_by_telegram_user_id = ?
--    WHERE token_hash = ? AND used = FALSE
--    AND (claimed_by_telegram_user_id IS NULL OR claimed_by_telegram_user_id = ?)
-- 3. Only one user can successfully claim (others get "link being processed" message)
-- 4. After linking completes, used = TRUE prevents any further claims
