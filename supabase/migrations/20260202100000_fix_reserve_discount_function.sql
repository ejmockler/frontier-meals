-- Fix reserve_discount_code to use renamed plan ID columns
--
-- The subscription_plans table was updated to have separate columns for
-- sandbox and live PayPal Plan IDs:
--   paypal_plan_id -> paypal_plan_id_live
--   (new) paypal_plan_id_sandbox
--
-- The reserve_discount_code function was still referencing the old column name.

BEGIN;

DROP FUNCTION IF EXISTS reserve_discount_code(TEXT, TEXT);

CREATE FUNCTION reserve_discount_code(
  p_code TEXT,
  p_customer_email TEXT
) RETURNS TABLE(
  success BOOLEAN,
  reservation_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_price DECIMAL,
  plan_billing_cycle TEXT,
  paypal_plan_id_live TEXT,
  paypal_plan_id_sandbox TEXT,
  default_plan_price DECIMAL,
  error_code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_code RECORD;
  v_plan RECORD;
  v_default_plan RECORD;
  v_reservation_id UUID;
  v_existing_reservation RECORD;
BEGIN
  -- Lock the code row to prevent concurrent modifications
  SELECT * INTO v_code
  FROM discount_codes
  WHERE code = UPPER(TRIM(p_code))
  FOR UPDATE NOWAIT;

  -- Check if code exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'INVALID_CODE'::TEXT, 'Code not found'::TEXT;
    RETURN;
  END IF;

  -- Check if active (with grace period)
  IF NOT v_code.is_active AND (
    v_code.deactivated_at IS NULL OR
    v_code.deactivated_at + make_interval(mins => v_code.grace_period_minutes) < NOW()
  ) THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'INACTIVE'::TEXT, 'Code is no longer active'::TEXT;
    RETURN;
  END IF;

  -- Check validity window
  IF v_code.valid_from IS NOT NULL AND v_code.valid_from > NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'NOT_YET_VALID'::TEXT, 'Code is not yet valid'::TEXT;
    RETURN;
  END IF;

  IF v_code.valid_until IS NOT NULL AND v_code.valid_until < NOW() THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'EXPIRED'::TEXT, format('Code expired on %s', to_char(v_code.valid_until, 'Mon DD, YYYY'))::TEXT;
    RETURN;
  END IF;

  -- Get discount plan details (needed for both existing and new reservations)
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_code.plan_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'PLAN_UNAVAILABLE'::TEXT, 'The plan for this code is no longer available'::TEXT;
    RETURN;
  END IF;

  -- Get default plan price for delta calculation
  SELECT price_amount INTO v_default_plan
  FROM subscription_plans
  WHERE is_default = true AND is_active = true
  LIMIT 1;

  -- IDEMPOTENT: Check for existing active reservation and return it if found
  SELECT * INTO v_existing_reservation
  FROM discount_code_reservations
  WHERE discount_code_id = v_code.id
    AND customer_email = p_customer_email
    AND redeemed_at IS NULL
    AND expires_at > NOW();

  IF FOUND THEN
    -- Return existing reservation (idempotent behavior)
    RETURN QUERY SELECT
      TRUE,
      v_existing_reservation.id,
      v_plan.id,
      v_plan.business_name,
      v_plan.price_amount,
      v_plan.billing_cycle,
      v_plan.paypal_plan_id_live,
      v_plan.paypal_plan_id_sandbox,
      COALESCE(v_default_plan.price_amount, v_plan.price_amount),
      NULL::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  -- Check usage limits (current + reserved) - only for NEW reservations
  IF v_code.max_uses IS NOT NULL AND (v_code.current_uses + v_code.reserved_uses) >= v_code.max_uses THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
      'MAX_USES'::TEXT, 'Code has reached its usage limit'::TEXT;
    RETURN;
  END IF;

  -- Check per-customer limit (completed redemptions)
  IF v_code.max_uses_per_customer IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM discount_code_redemptions dcr
      JOIN customers c ON c.id = dcr.customer_id
      WHERE dcr.discount_code_id = v_code.id
        AND c.email = p_customer_email
      HAVING COUNT(*) >= v_code.max_uses_per_customer
    ) THEN
      RETURN QUERY SELECT
        FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DECIMAL, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::DECIMAL,
        'ALREADY_USED'::TEXT, 'You have already used this code'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- All checks passed - create NEW reservation
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

  -- Return success with both plan IDs for environment-aware selection
  RETURN QUERY SELECT
    TRUE,
    v_reservation_id,
    v_plan.id,
    v_plan.business_name,
    v_plan.price_amount,
    v_plan.billing_cycle,
    v_plan.paypal_plan_id_live,
    v_plan.paypal_plan_id_sandbox,
    COALESCE(v_default_plan.price_amount, v_plan.price_amount),
    NULL::TEXT,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reserve_discount_code IS
  'Atomically validates and reserves a discount code. IDEMPOTENT: Returns existing valid reservation if one exists for this email+code. Returns both live and sandbox PayPal Plan IDs for environment-aware selection. Reservation expires in 15 minutes.';

COMMIT;
