# Admin — Quickstart Guide

**Role:** Staff with access to email composer, kiosk session launcher, customer tools

---

## Getting Started

### 1. Log In

1. Visit https://app.frontier-meals.com/admin
2. Enter your email (must be in `staff_accounts` table)
3. Check your email for magic link (expires in 15 minutes)
4. Click link → logged in for 24 hours

**Troubleshooting:**
- Link expired? Request a new one
- Email not arriving? Check spam folder or contact @noahchonlee

---

## Email Composer

**Path:** `/admin/emails`

### Create or Edit Template

1. Select template slug from dropdown:
   - `qr_daily` — Daily QR emails
   - `dunning_soft` — First payment failure
   - `dunning_retry` — Second attempt
   - `dunning_final` — Final warning
   - `canceled_notice` — Subscription canceled
   - `handle_confirm` — Telegram setup check

2. Click **Edit** → opens editor with current active version

3. Update **Subject** and **Body**:
   - Use variables in `{{double_braces}}`
   - Available variables listed in right sidebar
   - Example: `Hi {{customer_name}}, your payment of {{amount_due}} didn't go through.`

4. Click **Preview**:
   - Enter your email
   - Provide sample context (customer_name, amount_due, etc.)
   - Email sent via Resend → check inbox

5. Click **Publish**:
   - Increments version (e.g., v2 → v3)
   - Sets new version as `is_active = TRUE`
   - Old version remains in history (read-only)

### Send Ad-Hoc Email

**Path:** `/admin/emails/send`

1. Select template slug
2. Choose recipients:
   - **All active subscribers** (checkbox)
   - **Past-due only** (checkbox)
   - **Custom list** (paste emails, one per line)

3. Provide context variables (if template uses them)

4. Click **Preview** → sends to your email

5. Click **Send** → queues batch via Resend

6. View send log in `/admin/emails/history`

---

## Customer Tools

**Path:** `/admin/customers`

### Look Up Customer

1. Search by email or Telegram handle
2. View details:
   - Subscription status
   - Dietary flags
   - Last Telegram interaction
   - Recent skips
   - Redemption history

### Send Handle Correction Link

**Scenario:** Customer's Telegram handle is wrong and they missed the 48h window

1. Click **Send Correction Link** on customer detail page
2. System generates new token (48h expiry)
3. Email sent automatically
4. Customer clicks link → updates handle → audit logged

### Manual QR Regeneration

**Scenario:** Customer didn't receive daily QR email

1. Navigate to customer detail page
2. Click **Regenerate QR for Today**
3. System issues new QR (same `service_date`, new `jti`)
4. Email sent via Resend
5. Confirm with customer via Telegram

---

## Kiosk Session Launcher

**Path:** `/admin/kiosk/launch`

**Purpose:** Generate device-bound kiosk assertion for a physical kiosk terminal

### Steps

1. Click **Launch New Kiosk Session**
2. Enter kiosk ID (e.g., `kiosk-sf-01`)
3. System generates:
   - 24h assertion (ES256 JWT)
   - 6-character pairing code (15min expiry)
   - Magic link (alternative to code)

4. Choose activation method:

   **Option A: Pairing Code**
   - Display code on screen
   - On kiosk device, navigate to `/kiosk/activate`
   - Enter 6-character code
   - Kiosk stores assertion in localStorage

   **Option B: Magic Link**
   - Click "Copy Magic Link"
   - Send to kiosk device (email, QR, etc.)
   - Open link on kiosk → assertion stored

5. Kiosk is now active for 24 hours

**Security Notes:**
- Pairing codes expire after 15 minutes
- Magic links are single-use
- Each kiosk has unique `device_id` in assertion
- Assertions expire after 24 hours (must re-launch)

---

## Subscription Management

**Path:** `/admin/subscriptions`

### View Active Subscriptions

- Filter by status: `active`, `past_due`, `unpaid`, `canceled`
- Sort by `current_period_end` to see upcoming renewals
- Export to CSV for accounting

### Handle Reactivation

**Scenario:** Customer's subscription was canceled due to payment failure, now they want to restart

1. Look up customer in Stripe dashboard
2. Customer must re-subscribe via Checkout (creates new `subscription_id`)
3. System detects existing `customer_id` → reactivation flow:
   - Re-seeds entitlements for new period
   - Telegram link persists (no re-onboarding needed)
   - New `subscription` row with `status = 'active'`

**Do NOT:**
- Manually update `status` from `canceled` to `active` (breaks accounting)
- Reuse old `subscription_id`

---

## Reporting (MVP)

**Path:** `/admin/reports`

### Daily Redemption Rate

```sql
SELECT
  service_date,
  COUNT(DISTINCT customer_id) AS unique_customers,
  COUNT(*) AS total_redemptions
FROM redemptions
WHERE service_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY service_date
ORDER BY service_date DESC;
```

### Dunning Pipeline

```sql
SELECT
  status,
  COUNT(*) AS count
FROM subscriptions
WHERE status IN ('past_due', 'unpaid')
GROUP BY status;
```

### Skip Summary (Weekly)

```sql
SELECT
  skip_date,
  COUNT(*) AS skip_count
FROM skips
WHERE skip_date >= DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
  AND eligible_for_reimbursement = TRUE
GROUP BY skip_date
ORDER BY skip_date;
```

---

## Common Tasks

### 1. Update Dietary Preferences (Manual)

**Scenario:** Customer DMed @noahchonlee with allergy change

**Steps:**
1. Look up customer in `/admin/customers`
2. Click **Edit Dietary Flags**
3. Update JSON:
   ```json
   {
     "diet": "vegan",
     "dairy_free": true,
     "gluten_free": false
   }
   ```
4. Save → writes `audit_log`
5. Confirm with customer via Telegram

### 2. Review Email Template History

**Scenario:** Need to see what dunning copy was sent to customers last month

**Steps:**
1. Navigate to `/admin/emails`
2. Select template slug (e.g., `dunning_soft`)
3. Click **Version History**
4. View all versions with timestamps, `is_active` status
5. Click **Preview** on any version to see rendered output

### 3. Export Customer List

**Scenario:** Need CSV of active subscribers for accounting

**Steps:**
1. Navigate to `/admin/customers`
2. Filter: `subscription_status = 'active'`
3. Click **Export CSV**
4. Columns: email, name, telegram_handle, subscription_id, current_period_end

---

## Troubleshooting

### "Invalid CSRF Token" Error

**Cause:** Session expired or form submitted from old tab

**Fix:**
1. Refresh page
2. Log out and log back in
3. Submit form again

### "Email Send Failed" in Batch

**Cause:** Resend rate limit or invalid recipient

**Fix:**
1. Check Resend dashboard for error details
2. If rate limit: wait 1 minute, retry
3. If invalid email: remove from list, retry batch

### Kiosk Session Won't Activate

**Cause:** Pairing code expired or incorrect

**Fix:**
1. Generate new session via `/admin/kiosk/launch`
2. Verify kiosk device time is correct (PT timezone)
3. Try magic link instead of pairing code

---

## Security Best Practices

- **Never share magic link emails** (single-use, tied to your account)
- **Log out on shared devices** (click "Logout" in header)
- **Verify customer identity** before making manual changes (ask for Telegram handle or email)
- **Use audit log** to track who changed what (all actions logged)
- **Rotate keys quarterly** (Engineer handles; see `guides/ENGINEER.md`)

---

## Related Documents

- `specs/03-AUTHENTICATION.md` — How magic links work
- `specs/04-EMAIL-TEMPLATES.md` — Template syntax, variables
- `guides/OPS-STEWARD.md` — Daily ops checklist

---

**END OF ADMIN QUICKSTART**
