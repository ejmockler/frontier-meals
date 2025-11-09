-- Add unique constraint to prevent duplicate QR codes for same customer + date
-- This prevents race conditions when multiple cron jobs run concurrently

-- Note: The table already has UNIQUE(customer_id, service_date) from schema creation
-- This migration exists to ensure the constraint is present and properly documented

-- First, verify and clean up any existing duplicates (keep the most recent one)
DELETE FROM qr_tokens
WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id, service_date)
    id
  FROM qr_tokens
  ORDER BY customer_id, service_date, issued_at DESC
);

-- The unique constraint already exists from schema creation:
-- UNIQUE(customer_id, service_date)
-- We just document it here for completeness

COMMENT ON CONSTRAINT qr_tokens_customer_id_service_date_key ON qr_tokens IS
  'Prevents duplicate QR codes for the same customer and date (race condition protection)';
