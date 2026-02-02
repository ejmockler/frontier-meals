-- Fix Critical Security Issues in redeem_discount_code
--
-- This migration addresses three critical vulnerabilities:
-- 1. No expiry check on reservation lookup
-- 2. No validation that discount code is still active/valid
-- 3. No max_uses overflow protection on UPDATE
--
-- These are payment-critical fixes that prevent:
-- - Redeeming expired reservations
-- - Using deactivated/expired codes
-- - Exceeding max_uses limits
--

BEGIN;

-- ============================================================================
-- DROP AND RECREATE redeem_discount_code WITH SECURITY FIXES
-- ============================================================================

DROP FUNCTION IF EXISTS redeem_discount_code(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION redeem_discount_code(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_paypal_subscription_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_reservation RECORD;
  v_code RECORD;
  v_code_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- ========================================================================
  -- IDEMPOTENCY CHECK
  -- ========================================================================
  -- Check idempotency first to prevent double-processing
  IF EXISTS (
    SELECT 1 FROM discount_code_redemptions
    WHERE paypal_subscription_id = p_paypal_subscription_id
  ) THEN
    RETURN TRUE; -- Already processed, idempotent success
  END IF;

  -- ========================================================================
  -- FIX #1: ADD EXPIRY CHECK TO RESERVATION LOOKUP
  -- ========================================================================
  -- Find and lock reservation, ensuring it hasn't expired
  SELECT * INTO v_reservation
  FROM discount_code_reservations
  WHERE id = p_reservation_id
    AND redeemed_at IS NULL
    AND expires_at > v_now  -- CRITICAL FIX: Verify reservation hasn't expired
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found, already redeemed, or expired';
  END IF;

  v_code_id := v_reservation.discount_code_id;

  -- ========================================================================
  -- FIX #2: VALIDATE DISCOUNT CODE IS STILL VALID
  -- ========================================================================
  -- Fetch and validate the discount code before redemption
  SELECT * INTO v_code
  FROM discount_codes
  WHERE id = v_code_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discount code not found';
  END IF;

  -- Check if code is active (or within grace period if deactivated)
  IF v_code.is_active = FALSE THEN
    -- If deactivated, check if we're within grace period
    IF v_code.deactivated_at IS NULL OR
       v_code.deactivated_at + (v_code.grace_period_minutes || ' minutes')::INTERVAL < v_now THEN
      RAISE EXCEPTION 'Discount code is no longer active';
    END IF;
    -- If we reach here, we're within grace period - allow redemption
  END IF;

  -- Check valid_from date (if set)
  IF v_code.valid_from IS NOT NULL AND v_code.valid_from > v_now THEN
    RAISE EXCEPTION 'Discount code is not yet valid';
  END IF;

  -- Check valid_until date (if set)
  IF v_code.valid_until IS NOT NULL AND v_code.valid_until < v_now THEN
    RAISE EXCEPTION 'Discount code has expired';
  END IF;

  -- ========================================================================
  -- CONVERT RESERVATION TO REDEMPTION
  -- ========================================================================
  -- Mark reservation as redeemed
  UPDATE discount_code_reservations
  SET redeemed_at = v_now
  WHERE id = p_reservation_id;

  -- ========================================================================
  -- FIX #3: ADD MAX_USES OVERFLOW PROTECTION
  -- ========================================================================
  -- Update code counters with WHERE clause to prevent exceeding max_uses
  UPDATE discount_codes
  SET reserved_uses = GREATEST(0, reserved_uses - 1),
      current_uses = current_uses + 1,
      updated_at = v_now
  WHERE id = v_code_id
    AND (max_uses IS NULL OR current_uses < max_uses);  -- CRITICAL FIX: Prevent overflow

  -- If UPDATE didn't affect any rows, max_uses was exceeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discount code has reached maximum uses';
  END IF;

  -- ========================================================================
  -- CREATE AUDIT TRAIL
  -- ========================================================================
  -- Create redemption record for audit and tracking
  INSERT INTO discount_code_redemptions (
    discount_code_id,
    customer_id,
    reservation_id,
    paypal_subscription_id
  ) VALUES (
    v_code_id,
    p_customer_id,
    p_reservation_id,
    p_paypal_subscription_id
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION METADATA
-- ============================================================================

COMMENT ON FUNCTION redeem_discount_code IS
  'Finalizes discount code redemption after payment confirmation.
  Idempotent via paypal_subscription_id.
  Security fixes: expiry check, code validation, max_uses protection.
  Called by PayPal webhook handler.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these manually to verify the fix works:
--
-- 1. Test expired reservation rejection:
--    SELECT redeem_discount_code(
--      '<expired_reservation_id>'::UUID,
--      '<customer_id>'::UUID,
--      'test_sub_123'
--    );
--    Expected: ERROR: Reservation not found, already redeemed, or expired
--
-- 2. Test deactivated code rejection:
--    UPDATE discount_codes SET is_active = false WHERE code = 'TESTCODE';
--    SELECT redeem_discount_code(...);
--    Expected: ERROR: Discount code is no longer active
--
-- 3. Test max_uses overflow protection:
--    UPDATE discount_codes SET max_uses = 5, current_uses = 5 WHERE code = 'TESTCODE';
--    SELECT redeem_discount_code(...);
--    Expected: ERROR: Discount code has reached maximum uses
--

COMMIT;
