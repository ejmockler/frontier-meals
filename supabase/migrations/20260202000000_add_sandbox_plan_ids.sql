-- Add Sandbox Plan IDs to Subscription Plans
-- Enables dual-environment (sandbox/live) plan management
-- Each business plan can now map to both sandbox and live PayPal Plan IDs

BEGIN;

-- ============================================================================
-- ADD SANDBOX PLAN ID COLUMN
-- ============================================================================

-- Add sandbox plan ID column (nullable - not all plans need sandbox testing)
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS paypal_plan_id_sandbox TEXT;

-- Rename existing column for clarity
ALTER TABLE subscription_plans
  RENAME COLUMN paypal_plan_id TO paypal_plan_id_live;

-- ============================================================================
-- UPDATE CONSTRAINTS
-- ============================================================================

-- Drop old unique constraint on paypal_plan_id (now renamed)
ALTER TABLE subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_paypal_plan_id_key;

-- Add unique constraints for both columns
ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_paypal_plan_id_live_key UNIQUE (paypal_plan_id_live);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_sandbox_id
  ON subscription_plans(paypal_plan_id_sandbox) WHERE paypal_plan_id_sandbox IS NOT NULL;

-- ============================================================================
-- UPDATE INDEXES
-- ============================================================================

-- Drop old index
DROP INDEX IF EXISTS idx_subscription_plans_paypal_id;

-- Create indexes for both plan ID lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_live_id
  ON subscription_plans(paypal_plan_id_live);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_sandbox_id_lookup
  ON subscription_plans(paypal_plan_id_sandbox);

-- ============================================================================
-- UPDATE COMMENTS
-- ============================================================================

COMMENT ON COLUMN subscription_plans.paypal_plan_id_live IS
  'PayPal Plan ID for LIVE/production environment (e.g., "P-5ML4271244454362WXNWU5NQ")';

COMMENT ON COLUMN subscription_plans.paypal_plan_id_sandbox IS
  'PayPal Plan ID for SANDBOX/testing environment (nullable if not testing this plan)';

COMMIT;
