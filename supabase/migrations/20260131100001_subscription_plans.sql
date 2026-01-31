-- Subscription Plans (Translation Layer)
-- Maps business-friendly names to PayPal Plan IDs
-- Admins select from this list when creating discount codes

BEGIN;

-- ============================================================================
-- SUBSCRIPTION PLANS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Business-facing fields (what admin sees)
  business_name TEXT NOT NULL,              -- "Premium - Monthly ($29/mo)"
  description TEXT,                          -- "Our most popular plan"
  price_amount DECIMAL(10,2) NOT NULL,      -- 29.00
  price_currency TEXT DEFAULT 'USD',
  billing_cycle TEXT NOT NULL,              -- 'monthly', 'annual'

  -- Technical fields (hidden from admin)
  paypal_plan_id TEXT NOT NULL UNIQUE,      -- "P-5ML4271244454362WXNWU5NQ"

  -- Metadata
  is_default BOOLEAN DEFAULT false,         -- Default plan when no code used
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_billing_cycle CHECK (billing_cycle IN ('monthly', 'annual')),
  CONSTRAINT chk_price_amount_positive CHECK (price_amount > 0)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Ensure only one default plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_default
  ON subscription_plans(is_default) WHERE is_default = true;

-- Index for active plans lookup
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON subscription_plans(is_active, sort_order);

-- Index for PayPal Plan ID lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_paypal_id
  ON subscription_plans(paypal_plan_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE subscription_plans IS
  'Translation layer mapping business plan names to PayPal Plan IDs. Admins select from this list when creating discounts.';

COMMENT ON COLUMN subscription_plans.business_name IS
  'Human-readable plan name shown in admin UI (e.g., "Premium - Monthly ($29/mo)")';

COMMENT ON COLUMN subscription_plans.paypal_plan_id IS
  'PayPal Plan ID (e.g., "P-5ML4271244454362WXNWU5NQ") - hidden from admins';

COMMENT ON COLUMN subscription_plans.is_default IS
  'Default plan used when customer does not apply a discount code';

COMMIT;
