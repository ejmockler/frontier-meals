-- Frontier Meals - Consumer Handling Schema
-- Version: 1.0
-- Date: 2025-10-27

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STAFF ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ops')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_staff_email ON staff_accounts(email);

COMMENT ON TABLE staff_accounts IS 'Admin-only authentication (passwordless magic link)';

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  telegram_handle TEXT,
  telegram_user_id BIGINT UNIQUE,
  dietary_flags JSONB DEFAULT '{}',
  allergies BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_stripe_id ON customers(stripe_customer_id);
CREATE INDEX idx_customer_telegram_id ON customers(telegram_user_id);
CREATE INDEX idx_customer_email ON customers(email);

COMMENT ON TABLE customers IS 'Subscriber identity; links Stripe + Telegram';
COMMENT ON COLUMN customers.dietary_flags IS '{"diet": "vegan", "dairy_free": true, "gluten_free": false}';
COMMENT ON COLUMN customers.allergies IS 'If true, customer must DM @noahchonlee';

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'unpaid', 'canceled', 'trialing')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscription_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscription_status ON subscriptions(status);

COMMENT ON TABLE subscriptions IS 'Stripe subscription lifecycle tracking';

-- ============================================================================
-- ENTITLEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  meals_allowed INT DEFAULT 1,
  meals_redeemed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, service_date)
);

CREATE INDEX idx_entitlement_customer_date ON entitlements(customer_id, service_date);
CREATE INDEX idx_entitlement_service_date ON entitlements(service_date);

COMMENT ON TABLE entitlements IS 'Daily meal allowances (upserted by cron at 12:00 PM PT)';

-- ============================================================================
-- SKIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  skip_date DATE NOT NULL,
  source TEXT DEFAULT 'telegram' CHECK (source IN ('telegram', 'admin')),
  eligible_for_reimbursement BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, skip_date)
);

CREATE INDEX idx_skip_customer_date ON skips(customer_id, skip_date);
CREATE INDEX idx_skip_eligible ON skips(eligible_for_reimbursement) WHERE eligible_for_reimbursement = TRUE;

COMMENT ON TABLE skips IS 'User-requested skip dates (from Telegram /skip)';
COMMENT ON COLUMN skips.eligible_for_reimbursement IS 'TRUE when skip is for weeks after current Friday 09:00 PT';

-- ============================================================================
-- QR TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  jti TEXT UNIQUE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  UNIQUE(customer_id, service_date)
);

CREATE INDEX idx_qr_customer_date ON qr_tokens(customer_id, service_date);
CREATE INDEX idx_qr_jti ON qr_tokens(jti);
CREATE INDEX idx_qr_expires ON qr_tokens(expires_at);

COMMENT ON TABLE qr_tokens IS 'Daily QR code metadata (JWT claims stored for audit)';

-- ============================================================================
-- REDEMPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  kiosk_id TEXT,
  qr_jti TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_redemption_customer_date ON redemptions(customer_id, service_date);
CREATE INDEX idx_redemption_kiosk ON redemptions(kiosk_id);
CREATE INDEX idx_redemption_qr ON redemptions(qr_jti);

COMMENT ON TABLE redemptions IS 'Kiosk scan history';

-- ============================================================================
-- EMAIL TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff_accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, version)
);

CREATE INDEX idx_template_slug_active ON email_templates(slug, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_template_slug_version ON email_templates(slug, version DESC);

COMMENT ON TABLE email_templates IS 'Versioned Resend templates (dunning, QR, announcements)';
COMMENT ON COLUMN email_templates.slug IS 'dunning_soft | dunning_retry | dunning_final | canceled_notice | qr_daily | handle_confirm';

-- ============================================================================
-- EMAIL TEMPLATE PREVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_template_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  preview_to TEXT NOT NULL,
  preview_context JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_preview_template ON email_template_previews(template_id);

COMMENT ON TABLE email_template_previews IS 'Preview/audit trail for template testing';

-- ============================================================================
-- TELEGRAM LINK STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_link_status (
  customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_linked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_telegram_linked ON telegram_link_status(is_linked);

COMMENT ON TABLE telegram_link_status IS 'Track whether customer has interacted with bot';

-- ============================================================================
-- HANDLE UPDATE TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS handle_update_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handle_token_hash ON handle_update_tokens(token_hash);
CREATE INDEX idx_handle_token_expires ON handle_update_tokens(expires_at);

COMMENT ON TABLE handle_update_tokens IS 'Passwordless correction links (48h validity)';

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Security events, handle updates, admin actions';
COMMENT ON COLUMN audit_log.actor IS 'staff:email | system | customer:id';
COMMENT ON COLUMN audit_log.action IS 'handle_updated | qr_redeemed | email_sent | subscription_canceled';

-- ============================================================================
-- WEBHOOK EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('stripe', 'telegram', 'resend')),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_status ON webhook_events(status);
CREATE INDEX idx_webhook_created ON webhook_events(created_at);

COMMENT ON TABLE webhook_events IS 'Idempotency for Stripe + Telegram webhooks';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE skips ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_link_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE handle_update_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (bypasses RLS by default)

-- Customer policies (for future customer API)
CREATE POLICY customer_read_own ON customers
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY customer_read_own_subscription ON subscriptions
  FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY customer_read_own_entitlements ON entitlements
  FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY customer_read_own_skips ON skips
  FOR SELECT
  USING (customer_id = auth.uid());

-- Admin policies (for staff)
-- Note: Admins use session-based auth, not Supabase auth.uid()
-- Actual implementation will need custom claims or service role
