-- QR Audit Database Fixes
-- Migration: 20260202300000_qr_audit_database_fixes.sql
-- Date: 2026-02-02
-- Purpose: Critical security and data integrity fixes for QR redemption system
--
-- Fixes included:
-- C1: Add UNIQUE constraint on redemptions.qr_jti (prevents double-redemption at DB level)
-- C2: Add CHECK constraint on entitlements.meals_redeemed (enforces invariant)
-- C3: Add customer ownership validation in redeem_meal() (prevents token theft)
-- W4: Add FOR SHARE lock on subscription check (prevents phantom reads)
-- W14: Handle multiple subscriptions by using most recent one

BEGIN;

-- ============================================================================
-- C1: Add UNIQUE constraint on redemptions.qr_jti
-- ============================================================================
-- Prevents the same QR code (identified by jti) from being redeemed twice.
-- This is a defense-in-depth measure - the application already checks used_at
-- on qr_tokens, but this constraint provides database-level enforcement.

ALTER TABLE redemptions
  ADD CONSTRAINT redemptions_qr_jti_unique UNIQUE(qr_jti);

COMMENT ON CONSTRAINT redemptions_qr_jti_unique ON redemptions IS
  'C1: Prevents double-redemption of the same QR code at database level';

-- ============================================================================
-- C2: Add CHECK constraint on entitlements.meals_redeemed
-- ============================================================================
-- Enforces the invariant that meals_redeemed must be:
-- 1. Non-negative (cannot redeem negative meals)
-- 2. At most meals_allowed (cannot over-redeem)
-- This catches any logic bugs that might violate the business rule.

ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_meals_check
  CHECK (meals_redeemed >= 0 AND meals_redeemed <= meals_allowed);

COMMENT ON CONSTRAINT entitlements_meals_check ON entitlements IS
  'C2: Enforces meals_redeemed is between 0 and meals_allowed';

-- ============================================================================
-- C3, W4, W14: Recreate redeem_meal() function with security fixes
-- ============================================================================
-- C3: Add customer ownership validation - ensures QR token belongs to the
--     customer trying to redeem (prevents one customer using another's QR)
-- W4: Add FOR SHARE lock on subscription check - prevents phantom reads where
--     subscription status could change mid-transaction
-- W14: Handle multiple subscriptions by selecting the most recent active one

DROP FUNCTION IF EXISTS redeem_meal(UUID, DATE, TEXT, TEXT, TEXT);

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
  v_sub_status TEXT;
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

  -- ============================================================================
  -- C3: Customer ownership validation
  -- ============================================================================
  -- Ensures the QR token belongs to the customer trying to redeem it.
  -- Prevents token theft attacks where attacker obtains another customer's QR.
  IF v_qr_token.customer_id != p_customer_id THEN
    RETURN QUERY SELECT
      FALSE,
      'TOKEN_MISMATCH'::TEXT,
      'QR code does not belong to this customer'::TEXT,
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

  -- ============================================================================
  -- W4 & W14: Subscription check with FOR SHARE lock and most recent selection
  -- ============================================================================
  -- W4: FOR SHARE lock prevents the subscription status from being modified
  --     by another transaction while we're checking it (phantom read protection).
  -- W14: ORDER BY created_at DESC LIMIT 1 ensures we use the most recent
  --      subscription if a customer has multiple (e.g., after cancellation/resubscribe).
  -- Only active and trialing subscriptions are allowed to redeem meals.
  -- Prevents suspended customers (chargebacks, payment failures) from accessing service.
  SELECT status INTO v_sub_status
  FROM subscriptions
  WHERE customer_id = p_customer_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'SUBSCRIPTION_INACTIVE'::TEXT,
      'Your subscription is not active. Please resolve any payment issues.'::TEXT,
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

COMMENT ON FUNCTION redeem_meal IS 'Atomically redeem a meal using QR code. Includes: (C3) customer ownership validation, (W4) FOR SHARE lock on subscription, (W14) most recent subscription selection. Prevents race conditions, token theft, and phantom reads.';

COMMIT;
