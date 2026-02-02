-- Fix reservation cleanup issues
-- 1. Add grace period to cleanup function to handle delayed webhooks
-- 2. Add function to cancel reservation on PayPal failure

BEGIN;

-- ============================================================================
-- FUNCTION: Cleanup expired reservations with grace period
-- ============================================================================
-- Problem: PayPal webhooks can be delayed. If cleanup runs before webhook arrives,
-- the reservation is deleted and redemption fails silently.
-- Solution: Add 5-minute grace period after expiry before cleanup.

CREATE OR REPLACE FUNCTION cleanup_expired_reservations() RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    DELETE FROM discount_code_reservations
    WHERE expires_at < (NOW() - INTERVAL '5 minutes')  -- 5min grace period
      AND redeemed_at IS NULL
    RETURNING discount_code_id
  ),
  counts AS (
    SELECT discount_code_id, COUNT(*) as cnt
    FROM expired
    GROUP BY discount_code_id
  )
  UPDATE discount_codes dc
  SET reserved_uses = GREATEST(0, reserved_uses - c.cnt),
      updated_at = NOW()
  FROM counts c
  WHERE dc.id = c.discount_code_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_reservations IS
  'Cron job function to release expired reservations. Includes 5-minute grace period for delayed webhooks. Run every 5 minutes.';

-- ============================================================================
-- FUNCTION: Cancel discount reservation (cleanup on PayPal failure)
-- ============================================================================
-- Called when PayPal subscription creation fails to clean up the reservation
-- and decrement the reserved_uses counter. Idempotent - no error if reservation
-- doesn't exist.

CREATE OR REPLACE FUNCTION cancel_discount_reservation(
  p_reservation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_code_id UUID;
BEGIN
  -- Check if reservation exists and hasn't been redeemed
  SELECT discount_code_id INTO v_code_id
  FROM discount_code_reservations
  WHERE id = p_reservation_id
    AND redeemed_at IS NULL;

  -- If reservation doesn't exist or already redeemed, return success (idempotent)
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  -- Delete the reservation
  DELETE FROM discount_code_reservations
  WHERE id = p_reservation_id;

  -- Decrement reserved_uses counter
  UPDATE discount_codes
  SET reserved_uses = GREATEST(0, reserved_uses - 1),
      updated_at = NOW()
  WHERE id = v_code_id;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but return false instead of raising exception
    RAISE WARNING 'Failed to cancel reservation %: %', p_reservation_id, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_discount_reservation IS
  'Cancels a discount code reservation and decrements reserved_uses. Called when PayPal subscription creation fails. Idempotent.';

COMMIT;
