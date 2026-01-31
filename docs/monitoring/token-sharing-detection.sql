-- Token Sharing Detection Queries
-- EC-3: Monitor for suspicious Telegram linking patterns
--
-- Run these queries weekly as part of ops review
-- Add to admin dashboard for real-time alerts

-- ============================================================================
-- Query 1: Detect Duplicate Telegram User IDs
-- ============================================================================
-- ALERT: Multiple customers linked to same telegram_user_id
-- This indicates token sharing or account hijacking
--
SELECT
  telegram_user_id,
  COUNT(*) as customer_count,
  ARRAY_AGG(id ORDER BY created_at) as customer_ids,
  ARRAY_AGG(email ORDER BY created_at) as emails,
  ARRAY_AGG(telegram_handle ORDER BY created_at) as handles,
  MIN(created_at) as first_customer,
  MAX(created_at) as last_customer
FROM customers
WHERE telegram_user_id IS NOT NULL
GROUP BY telegram_user_id
HAVING COUNT(*) > 1
ORDER BY customer_count DESC;

-- Expected: 0 rows (no duplicates)
-- If found: Investigate - likely token sharing or user error


-- ============================================================================
-- Query 2: Suspicious Linking Patterns (Very Fast)
-- ============================================================================
-- ALERT: Customer linked Telegram within 1 minute of signup
-- May indicate automated bot or token sharing
--
SELECT
  c.id,
  c.email,
  c.telegram_handle,
  c.telegram_user_id,
  c.created_at as customer_created,
  tls.first_seen_at as telegram_linked,
  EXTRACT(EPOCH FROM (tls.first_seen_at - c.created_at)) as seconds_to_link,
  c.payment_provider
FROM customers c
JOIN telegram_link_status tls ON c.id = tls.customer_id
WHERE tls.is_linked = true
  AND tls.first_seen_at - c.created_at < INTERVAL '1 minute'
  AND c.created_at > NOW() - INTERVAL '7 days'
ORDER BY seconds_to_link ASC;

-- Expected: Some instant links (normal for fast users)
-- Investigate: Links < 5 seconds (likely pre-shared token)


-- ============================================================================
-- Query 3: Delayed Linking (Abandoned Tokens)
-- ============================================================================
-- INFO: Customers who took >24h to link Telegram
-- May indicate token sharing or lost email
--
SELECT
  c.id,
  c.email,
  c.telegram_handle,
  c.created_at as customer_created,
  tls.first_seen_at as telegram_linked,
  EXTRACT(EPOCH FROM (tls.first_seen_at - c.created_at)) / 3600 as hours_to_link,
  c.payment_provider
FROM customers c
JOIN telegram_link_status tls ON c.id = tls.customer_id
WHERE tls.is_linked = true
  AND tls.first_seen_at - c.created_at > INTERVAL '24 hours'
  AND c.created_at > NOW() - INTERVAL '30 days'
ORDER BY hours_to_link DESC;

-- Expected: Some delays (normal - user may not check email immediately)
-- Action: None required (informational only)


-- ============================================================================
-- Query 4: Never Linked (Potential Issues)
-- ============================================================================
-- INFO: Customers who paid but never linked Telegram
-- May indicate lost email, spam folder, or checkout abandonment
--
SELECT
  c.id,
  c.email,
  c.payment_provider,
  c.created_at,
  s.status as subscription_status,
  EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400 as days_since_signup
FROM customers c
LEFT JOIN subscriptions s ON c.id = s.customer_id
LEFT JOIN telegram_link_status tls ON c.id = tls.customer_id
WHERE (tls.is_linked = false OR tls.is_linked IS NULL)
  AND s.status IN ('active', 'trialing', 'past_due')  -- Paying customers only
  AND c.created_at > NOW() - INTERVAL '30 days'
ORDER BY c.created_at DESC;

-- Expected: Few customers (most link within 24h)
-- Action: Consider outreach email after 48h


-- ============================================================================
-- Query 5: Token Usage Metrics
-- ============================================================================
-- INFO: Token lifecycle statistics for monitoring
--
SELECT
  COUNT(*) as total_tokens,
  COUNT(*) FILTER (WHERE used = true) as tokens_used,
  COUNT(*) FILTER (WHERE used = false) as tokens_unused,
  COUNT(*) FILTER (WHERE used = false AND expires_at < NOW()) as tokens_expired_unused,
  COUNT(*) FILTER (WHERE used = true AND expires_at < NOW()) as tokens_expired_used,
  COUNT(*) FILTER (WHERE paypal_custom_id IS NOT NULL) as paypal_tokens,
  COUNT(*) FILTER (WHERE paypal_custom_id IS NULL) as stripe_tokens,
  ROUND(100.0 * COUNT(*) FILTER (WHERE used = true) / NULLIF(COUNT(*), 0), 2) as usage_rate_pct
FROM telegram_deep_link_tokens;

-- Expected usage_rate_pct: >80% (most users link Telegram)
-- Alert: <50% indicates email deliverability issue


-- ============================================================================
-- Query 6: Recent Token Activity (Last 7 Days)
-- ============================================================================
-- INFO: Daily breakdown of token creation and usage
--
SELECT
  DATE(created_at) as date,
  COUNT(*) as tokens_created,
  COUNT(*) FILTER (WHERE used = true) as tokens_used,
  COUNT(*) FILTER (WHERE used = false AND expires_at < NOW()) as tokens_abandoned,
  COUNT(*) FILTER (WHERE paypal_custom_id IS NOT NULL) as paypal_tokens,
  ROUND(100.0 * COUNT(*) FILTER (WHERE used = true) / NULLIF(COUNT(*), 0), 2) as usage_rate_pct
FROM telegram_deep_link_tokens
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Expected: Consistent usage_rate_pct day-to-day
-- Alert: Sudden drop may indicate email or webhook issues


-- ============================================================================
-- Query 7: Audit Trail for Token Sharing Investigation
-- ============================================================================
-- INVESTIGATION: Full audit trail for specific customer
-- Replace 'CUSTOMER_ID' with actual UUID
--
SELECT
  al.created_at,
  al.action,
  al.actor,
  al.metadata,
  c.email,
  c.telegram_handle,
  c.telegram_user_id
FROM audit_log al
JOIN customers c ON al.subject = CONCAT('customer:', c.id)
WHERE c.id = 'CUSTOMER_ID'  -- Replace with actual ID
  AND al.action IN ('telegram_linked', 'subscription_created', 'payment_completed')
ORDER BY al.created_at;

-- Use this to investigate suspicious patterns from Query 1 or 2


-- ============================================================================
-- Recommended Alert Thresholds
-- ============================================================================
-- Set up in admin dashboard or monitoring tool:
--
-- 1. Query 1 (Duplicates): Alert if COUNT(*) > 0
--    Action: Immediate investigation required
--
-- 2. Query 2 (Fast Links): Alert if seconds_to_link < 5 for >5 customers/week
--    Action: Review for pattern, may indicate bot or exploit
--
-- 3. Query 4 (Never Linked): Alert if count > 10 for past 7 days
--    Action: Check email deliverability, consider reminder email
--
-- 4. Query 5 (Usage Rate): Alert if usage_rate_pct < 50%
--    Action: Investigate email or Telegram webhook issues
--
-- 5. Query 6 (Daily Stats): Alert if usage_rate_pct drops >20% day-over-day
--    Action: Check for webhook failures or email bounces
