-- Migration: Hash Magic Link Tokens
-- Issue #2: Security fix to store hashed tokens instead of plaintext
-- Date: 2025-10-28

-- Rename token column to token_hash in admin_magic_links
ALTER TABLE admin_magic_links
RENAME COLUMN token TO token_hash;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_admin_magic_links_token;
CREATE INDEX idx_admin_magic_links_token_hash ON admin_magic_links(token_hash) WHERE used = FALSE;

-- Add comment explaining the security improvement
COMMENT ON COLUMN admin_magic_links.token_hash IS 'SHA-256 hash of magic link token (tokens never stored in plaintext)';

-- Rename token column to token_hash in telegram_deep_link_tokens
ALTER TABLE telegram_deep_link_tokens
RENAME COLUMN token TO token_hash;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_telegram_deep_link_tokens_token;
CREATE INDEX idx_telegram_deep_link_tokens_token_hash ON telegram_deep_link_tokens(token_hash) WHERE used = FALSE;

-- Add comment explaining the security improvement
COMMENT ON COLUMN telegram_deep_link_tokens.token_hash IS 'SHA-256 hash of deep link token (tokens never stored in plaintext)';

-- Note: Existing unhashed tokens in the database will no longer work after this migration
-- This is intentional for security. All existing tokens will expire and users will need new ones.
