-- Discount Codes
-- Promotional codes that unlock specific subscription plans
-- Uses reservation system to prevent race conditions on limited-use codes

BEGIN;

-- ============================================================================
-- DISCOUNT CODES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code identification
  code TEXT UNIQUE NOT NULL,

  -- What plan this code unlocks (FK to translation layer)
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  -- Structured discount info (NOT human-readable text)
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_trial')),
  discount_value DECIMAL(10,2),             -- 50 for 50%, 10.00 for $10 off
  discount_duration_months INT DEFAULT 1,   -- How many months discount applies

  -- Admin-friendly description
  admin_notes TEXT,                         -- "Summer 2025 campaign for gym partners"

  -- Usage limits
  max_uses INT,                             -- NULL = unlimited
  current_uses INT DEFAULT 0,
  reserved_uses INT DEFAULT 0,              -- Held during checkout flow

  -- Per-customer limit
  max_uses_per_customer INT DEFAULT 1,      -- Usually 1

  -- Validity window
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMPTZ,               -- When admin disabled
  grace_period_minutes INT DEFAULT 30,      -- Honor code for this long after deactivation

  -- Audit
  created_by UUID,                          -- Admin who created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_uses_non_negative CHECK (current_uses >= 0 AND reserved_uses >= 0),
  CONSTRAINT chk_uses_within_max CHECK (max_uses IS NULL OR (current_uses <= max_uses AND (current_uses + reserved_uses) <= max_uses)),
  CONSTRAINT chk_valid_date_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CONSTRAINT chk_discount_value_positive CHECK (discount_value IS NULL OR discount_value > 0),
  CONSTRAINT chk_discount_duration_positive CHECK (discount_duration_months > 0),
  CONSTRAINT chk_max_uses_per_customer_positive CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer > 0),
  CONSTRAINT chk_grace_period_positive CHECK (grace_period_minutes >= 0),
  CONSTRAINT chk_percentage_max_100 CHECK (discount_type != 'percentage' OR discount_value <= 100)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Hot path: code lookup during validation
CREATE INDEX IF NOT EXISTS idx_discount_codes_lookup
  ON discount_codes(code)
  WHERE is_active = true;

-- Admin dashboard: active codes with availability
CREATE INDEX IF NOT EXISTS idx_discount_codes_active
  ON discount_codes(is_active, valid_from, valid_until);

-- Foreign key index
CREATE INDEX IF NOT EXISTS idx_discount_codes_plan
  ON discount_codes(plan_id);

-- ============================================================================
-- CODE NORMALIZATION TRIGGER
-- ============================================================================

-- Ensure codes are always stored in uppercase
CREATE OR REPLACE FUNCTION normalize_discount_code() RETURNS TRIGGER AS $$
BEGIN
  NEW.code := UPPER(TRIM(NEW.code));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_discount_code_trigger ON discount_codes;
CREATE TRIGGER normalize_discount_code_trigger
  BEFORE INSERT OR UPDATE OF code ON discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION normalize_discount_code();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE discount_codes IS
  'Promotional codes that unlock specific subscription plans. Uses reservation system to prevent race conditions.';

COMMENT ON COLUMN discount_codes.code IS
  'Discount code entered by customer (stored in uppercase)';

COMMENT ON COLUMN discount_codes.discount_type IS
  'Type of discount: percentage (e.g., 50%), fixed_amount (e.g., $10 off), or free_trial';

COMMENT ON COLUMN discount_codes.discount_value IS
  'Discount amount: 50 for 50%, 10.00 for $10 off. NULL for free_trial type.';

COMMENT ON COLUMN discount_codes.discount_duration_months IS
  'How many months the discount applies (default: 1)';

COMMENT ON COLUMN discount_codes.reserved_uses IS
  'Number of codes currently held in checkout flow (15min TTL). Prevents overselling limited codes.';

COMMENT ON COLUMN discount_codes.grace_period_minutes IS
  'Allow code redemption for this many minutes after deactivation (default: 30)';

COMMIT;
