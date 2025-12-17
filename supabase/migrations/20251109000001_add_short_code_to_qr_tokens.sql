-- Add short_code column to qr_tokens table for easier QR scanning
-- This allows us to use short codes (8-12 chars) instead of full JWTs in QR codes

ALTER TABLE qr_tokens ADD COLUMN short_code TEXT;

-- Make short_code unique to prevent collisions
CREATE UNIQUE INDEX idx_qr_tokens_short_code ON qr_tokens(short_code) WHERE short_code IS NOT NULL;

-- Add jwt_token column to store the full JWT
ALTER TABLE qr_tokens ADD COLUMN jwt_token TEXT;

-- Add index for fast JWT lookups
CREATE INDEX idx_qr_tokens_jwt_token ON qr_tokens(jwt_token) WHERE jwt_token IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN qr_tokens.short_code IS 'Short scannable code (8-12 chars) used in QR code for easier scanning';
COMMENT ON COLUMN qr_tokens.jwt_token IS 'Full JWT token for validation, looked up via short_code';
