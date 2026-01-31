-- Discount Code Audit Logging
-- Tracks all changes to discount codes for compliance and debugging
-- Automatically triggered on INSERT/UPDATE to discount_codes table

BEGIN;

-- ============================================================================
-- DISCOUNT CODE AUDIT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_code_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID REFERENCES discount_codes(id),
  action TEXT NOT NULL, -- 'created', 'updated', 'activated', 'deactivated', 'exhausted'
  changed_by UUID,      -- Admin user ID
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  old_values JSONB,
  new_values JSONB,

  -- Constraints
  CONSTRAINT chk_audit_action CHECK (
    action IN ('created', 'updated', 'activated', 'deactivated', 'exhausted')
  )
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_discount_audit_code
  ON discount_code_audit(discount_code_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_discount_audit_action
  ON discount_code_audit(action, changed_at DESC);

-- ============================================================================
-- TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_discount_code_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO discount_code_audit (discount_code_id, action, new_values)
    VALUES (NEW.id, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO discount_code_audit (discount_code_id, action, old_values, new_values)
    VALUES (
      NEW.id,
      CASE
        WHEN OLD.is_active AND NOT NEW.is_active THEN 'deactivated'
        WHEN NOT OLD.is_active AND NEW.is_active THEN 'activated'
        WHEN NEW.current_uses >= COALESCE(NEW.max_uses, NEW.current_uses + 1) THEN 'exhausted'
        ELSE 'updated'
      END,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit_discount_code_change IS
  'Automatically logs all changes to discount_codes table for audit trail';

-- ============================================================================
-- TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS discount_codes_audit ON discount_codes;

CREATE TRIGGER discount_codes_audit
  AFTER INSERT OR UPDATE ON discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION audit_discount_code_change();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE discount_code_audit IS
  'Audit trail for discount code changes. Tracks creation, updates, activation/deactivation, and exhaustion.';

COMMENT ON COLUMN discount_code_audit.action IS
  'Type of change: created, updated, activated, deactivated, or exhausted';

COMMENT ON COLUMN discount_code_audit.changed_by IS
  'Admin user ID who made the change (NULL for system changes)';

COMMENT ON COLUMN discount_code_audit.old_values IS
  'Full JSONB snapshot of row before change (NULL for INSERT)';

COMMENT ON COLUMN discount_code_audit.new_values IS
  'Full JSONB snapshot of row after change';

COMMIT;
