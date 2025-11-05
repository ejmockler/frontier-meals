-- Atomic Meal Redemption Function
-- Prevents race conditions by performing all checks and updates in a single transaction

CREATE OR REPLACE FUNCTION redeem_meal(
  p_customer_id UUID,
  p_service_date DATE,
  p_kiosk_id TEXT,
  p_qr_token_jti TEXT,
  p_kiosk_location TEXT
) RETURNS TABLE(
  success BOOLEAN,
  error_code TEXT,
  error_message TEXT,
  redemption_id UUID,
  customer_name TEXT,
  customer_dietary_flags JSONB
) AS $$
DECLARE
  v_entitlement RECORD;
  v_qr_token RECORD;
  v_customer RECORD;
  v_redemption_id UUID;
BEGIN
  -- Lock and fetch entitlement row to prevent concurrent modifications
  SELECT * INTO v_entitlement
  FROM entitlements
  WHERE customer_id = p_customer_id
    AND service_date = p_service_date
  FOR UPDATE;

  -- Check if entitlement exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_ENTITLEMENT'::TEXT,
      'No entitlement found for this date'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Check if already redeemed all allowed meals
  IF v_entitlement.meals_redeemed >= v_entitlement.meals_allowed THEN
    RETURN QUERY SELECT
      FALSE,
      'ALREADY_REDEEMED'::TEXT,
      'All meals for this date have been redeemed'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Lock and fetch QR token to prevent double redemption
  SELECT * INTO v_qr_token
  FROM qr_tokens
  WHERE jti = p_qr_token_jti
  FOR UPDATE;

  -- Check if QR token exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_TOKEN'::TEXT,
      'Invalid QR code'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Check if QR token already used
  IF v_qr_token.used_at IS NOT NULL THEN
    RETURN QUERY SELECT
      FALSE,
      'ALREADY_USED'::TEXT,
      'QR code already used'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Check if QR token expired
  IF v_qr_token.expires_at < NOW() THEN
    RETURN QUERY SELECT
      FALSE,
      'EXPIRED'::TEXT,
      'QR code expired'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- Fetch customer data
  SELECT * INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'CUSTOMER_NOT_FOUND'::TEXT,
      'Customer not found'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::JSONB;
    RETURN;
  END IF;

  -- All checks passed - perform atomic updates

  -- Insert redemption record
  INSERT INTO redemptions (
    customer_id,
    service_date,
    kiosk_id,
    qr_jti,
    redeemed_at
  ) VALUES (
    p_customer_id,
    p_service_date,
    p_kiosk_id,
    p_qr_token_jti,
    NOW()
  ) RETURNING id INTO v_redemption_id;

  -- Mark QR token as used
  UPDATE qr_tokens
  SET used_at = NOW()
  WHERE jti = p_qr_token_jti;

  -- Increment meals_redeemed counter
  UPDATE entitlements
  SET meals_redeemed = meals_redeemed + 1
  WHERE customer_id = p_customer_id
    AND service_date = p_service_date;

  -- Insert audit log
  INSERT INTO audit_log (
    actor,
    action,
    subject,
    metadata
  ) VALUES (
    'kiosk:' || p_kiosk_id,
    'meal_redeemed',
    'customer:' || p_customer_id,
    jsonb_build_object(
      'service_date', p_service_date,
      'kiosk_location', p_kiosk_location,
      'redemption_id', v_redemption_id
    )
  );

  -- Return success with customer data
  RETURN QUERY SELECT
    TRUE,
    NULL::TEXT,
    NULL::TEXT,
    v_redemption_id,
    v_customer.name,
    v_customer.dietary_flags;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION redeem_meal IS 'Atomically redeem a meal using QR code. Prevents race conditions by locking entitlement and QR token rows.';
