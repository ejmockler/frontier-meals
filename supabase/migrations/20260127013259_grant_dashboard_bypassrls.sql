-- Grant dashboard users full access to all tables via RLS policies
-- This allows org collaborators to view/edit tables in the Dashboard Table Editor
-- The dashboard_user role is reserved and can't be granted BYPASSRLS directly

-- Staff accounts
CREATE POLICY "Dashboard full access on staff_accounts" ON staff_accounts
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Customers
CREATE POLICY "Dashboard full access on customers" ON customers
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Subscriptions
CREATE POLICY "Dashboard full access on subscriptions" ON subscriptions
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Entitlements
CREATE POLICY "Dashboard full access on entitlements" ON entitlements
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Skips
CREATE POLICY "Dashboard full access on skips" ON skips
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- QR tokens
CREATE POLICY "Dashboard full access on qr_tokens" ON qr_tokens
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Redemptions
CREATE POLICY "Dashboard full access on redemptions" ON redemptions
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Email templates
CREATE POLICY "Dashboard full access on email_templates" ON email_templates
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Email template previews
CREATE POLICY "Dashboard full access on email_template_previews" ON email_template_previews
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Telegram link status
CREATE POLICY "Dashboard full access on telegram_link_status" ON telegram_link_status
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Handle update tokens
CREATE POLICY "Dashboard full access on handle_update_tokens" ON handle_update_tokens
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Audit log
CREATE POLICY "Dashboard full access on audit_log" ON audit_log
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Webhook events
CREATE POLICY "Dashboard full access on webhook_events" ON webhook_events
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Email retry
CREATE POLICY "Dashboard full access on email_retry" ON email_retry
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Service schedule config
CREATE POLICY "Dashboard full access on service_schedule_config" ON service_schedule_config
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Service exceptions
CREATE POLICY "Dashboard full access on service_exceptions" ON service_exceptions
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Rate limits
CREATE POLICY "Dashboard full access on rate_limits" ON rate_limits
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);

-- Telegram skip sessions
CREATE POLICY "Dashboard full access on telegram_skip_sessions" ON telegram_skip_sessions
  FOR ALL TO postgres, dashboard_user
  USING (true) WITH CHECK (true);
