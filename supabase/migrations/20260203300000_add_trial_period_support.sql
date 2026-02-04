-- Add trial period support to subscription plans
--
-- Supports the case: N months at lower cost, then regular monthly billing.
-- Trial info is auto-extracted from PayPal billing cycles at plan sync time.
-- NULL trial fields = no trial period (backward compatible).

BEGIN;

-- Add trial period columns
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS trial_price_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS trial_duration_months INT;

-- Constraint: both null or both non-null
ALTER TABLE subscription_plans
  ADD CONSTRAINT chk_trial_fields_together
    CHECK (
      (trial_price_amount IS NULL AND trial_duration_months IS NULL) OR
      (trial_price_amount IS NOT NULL AND trial_duration_months IS NOT NULL)
    );

-- Trial price can be 0 (free trial) but not negative
ALTER TABLE subscription_plans
  ADD CONSTRAINT chk_trial_price_non_negative
    CHECK (trial_price_amount IS NULL OR trial_price_amount >= 0);

-- Trial duration must be positive
ALTER TABLE subscription_plans
  ADD CONSTRAINT chk_trial_duration_positive
    CHECK (trial_duration_months IS NULL OR trial_duration_months > 0);

-- Comments
COMMENT ON COLUMN subscription_plans.trial_price_amount IS
  'Monthly price during trial period (can be 0 for free trial). NULL if no trial.';

COMMENT ON COLUMN subscription_plans.trial_duration_months IS
  'Number of months the trial lasts. NULL if no trial.';

COMMIT;
