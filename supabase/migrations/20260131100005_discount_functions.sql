-- Discount Code Atomic Functions
-- Core business logic for discount code reservation and redemption
-- Designed to prevent race conditions and ensure data consistency

BEGIN;

-- ============================================================================
-- FUNCTION: Reserve a discount code
-- ============================================================================

CREATE OR REPLACE FUNCTION reserve_discount_code(
  p_code TEXT,
  p_customer_email TEXT
) RETURNS TABLE(
  success BOOLEAN,
  reservation_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_price DECIMAL,
  plan_billing_cycle TEXT,
  paypal_plan_id TEXT,
  discount_type TEXT,
  discount_value DECIMAL,
  discount_duration_months INT,
  error_code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_code RECORD;
  v_plan RECORD;
  v_reservation_id UUID;
BEGIN
  -- Lock the code row to prevent concurrent modifications
  SELECT * INTO v_code
  FROM discount_codes
  WHERE code = UPPER(TRIM(p_code))
  FOR UPDATE NOWAIT;

  -- Check if code exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'INVALID_CODE'::TEXT, 'Code not found'::TEXT;
    RETURN;
  END IF;

  -- Check if active (with grace period)
  IF NOT v_code.is_active AND (
    v_code.deactivated_at IS NULL OR
    v_code.deactivated_at + make_interval(mins => v_code.grace_period_minutes) < NOW()
  ) THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'INACTIVE'::TEXT, 'Code is no longer active'::TEXT;
    RETURN;
  END IF;

  -- Check validity window
  IF v_code.valid_from IS NOT NULL AND v_code.valid_from > NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'NOT_YET_VALID'::TEXT, 'Code is not yet valid'::TEXT;
    RETURN;
  END IF;

  IF v_code.valid_until IS NOT NULL AND v_code.valid_until < NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'EXPIRED'::TEXT, format('Code expired on %s', to_char(v_code.valid_until, 'Mon DD, YYYY'))::TEXT;
    RETURN;
  END IF;

  -- Check usage limits (current + reserved)
  IF v_code.max_uses IS NOT NULL AND (v_code.current_uses + v_code.reserved_uses) >= v_code.max_uses THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'MAX_USES'::TEXT, 'Code has reached its usage limit'::TEXT;
    RETURN;
  END IF;

  -- Check per-customer limit (both active reservations and completed redemptions)
  IF v_code.max_uses_per_customer IS NOT NULL THEN
    -- Check for existing active reservations by this customer email
    IF EXISTS (
      SELECT 1 FROM discount_code_reservations
      WHERE discount_code_id = v_code.id
        AND customer_email = p_customer_email
        AND redeemed_at IS NULL
        AND expires_at > NOW()
    ) THEN
      RETURN QUERY SELECT
        FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
        'RESERVATION_EXISTS'::TEXT, 'You already have a pending reservation for this code'::TEXT;
      RETURN;
    END IF;

    -- Check for completed redemptions
    IF EXISTS (
      SELECT 1 FROM discount_code_redemptions dcr
      JOIN customers c ON c.id = dcr.customer_id
      WHERE dcr.discount_code_id = v_code.id
        AND c.email = p_customer_email
      HAVING COUNT(*) >= v_code.max_uses_per_customer
    ) THEN
      RETURN QUERY SELECT
        FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
        'ALREADY_USED'::TEXT, 'You have already used this code'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Get plan details
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_code.plan_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL, NULL::INT,
      'PLAN_UNAVAILABLE'::TEXT, 'The plan for this code is no longer available'::TEXT;
    RETURN;
  END IF;

  -- All checks passed - create reservation
  UPDATE discount_codes
  SET reserved_uses = reserved_uses + 1,
      updated_at = NOW()
  WHERE id = v_code.id;

  INSERT INTO discount_code_reservations (
    discount_code_id,
    customer_email,
    expires_at
  ) VALUES (
    v_code.id,
    p_customer_email,
    NOW() + INTERVAL '15 minutes'
  ) RETURNING id INTO v_reservation_id;

  -- Return success
  RETURN QUERY SELECT
    TRUE,
    v_reservation_id,
    v_plan.id,
    v_plan.business_name,
    v_plan.price_amount,
    v_plan.billing_cycle,
    v_plan.paypal_plan_id,
    v_code.discount_type,
    v_code.discount_value,
    v_code.discount_duration_months,
    NULL::TEXT,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reserve_discount_code IS
  'Atomically validates and reserves a discount code. Returns plan details or error. Reservation expires in 15 minutes.';

-- ============================================================================
-- FUNCTION: Redeem via webhook (with idempotency)
-- ============================================================================

CREATE OR REPLACE FUNCTION redeem_discount_code(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_paypal_subscription_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_reservation RECORD;
  v_code_id UUID;
BEGIN
  -- Check idempotency first
  IF EXISTS (
    SELECT 1 FROM discount_code_redemptions
    WHERE paypal_subscription_id = p_paypal_subscription_id
  ) THEN
    RETURN TRUE; -- Already processed, idempotent success
  END IF;

  -- Find and lock reservation
  SELECT * INTO v_reservation
  FROM discount_code_reservations
  WHERE id = p_reservation_id
    AND redeemed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found or already redeemed';
  END IF;

  v_code_id := v_reservation.discount_code_id;

  -- Convert reservation to redemption
  UPDATE discount_code_reservations
  SET redeemed_at = NOW()
  WHERE id = p_reservation_id;

  -- Update code counters
  UPDATE discount_codes
  SET reserved_uses = GREATEST(0, reserved_uses - 1),
      current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = v_code_id;

  -- Create redemption record
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

COMMENT ON FUNCTION redeem_discount_code IS
  'Called by webhook to finalize redemption. Idempotent via paypal_subscription_id.';

-- ============================================================================
-- FUNCTION: Cleanup expired reservations (cron job)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_reservations() RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    DELETE FROM discount_code_reservations
    WHERE expires_at < NOW()
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
  'Cron job function to release expired reservations. Run every 5 minutes.';

-- ============================================================================
-- FUNCTION: Get discount display text (computed, not stored)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_discount_display(
  p_discount_type TEXT,
  p_discount_value DECIMAL,
  p_duration_months INT
) RETURNS TEXT AS $$
BEGIN
  IF p_discount_type = 'percentage' THEN
    IF p_duration_months = 1 THEN
      RETURN format('%s%% off first month', p_discount_value::INT);
    ELSE
      RETURN format('%s%% off first %s months', p_discount_value::INT, p_duration_months);
    END IF;
  ELSIF p_discount_type = 'fixed_amount' THEN
    IF p_duration_months = 1 THEN
      RETURN format('$%s off first month', p_discount_value);
    ELSE
      RETURN format('$%s off first %s months', p_discount_value, p_duration_months);
    END IF;
  ELSIF p_discount_type = 'free_trial' THEN
    RETURN format('%s month free trial', p_duration_months);
  ELSE
    RETURN 'Special discount';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_discount_display IS
  'Generates human-readable discount display text (e.g., "50% off first month")';

COMMIT;
