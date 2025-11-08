# Ops Steward — Quickstart Guide

**Role:** Daily operations oversight, alert monitoring, edge case resolution

---

## Daily Checklist (PT timezone)

### Morning (Before 12 PM PT)

- [ ] Check Telegram for overnight ops alerts (DMs from bot)
- [ ] Review yesterday's redemption count (should match active subscriptions ±10%)
- [ ] Scan `webhook_events` table for any `status = 'failed'` rows
- [ ] Verify QR job scheduled for 12 PM PT (check Vercel cron logs)

### Noon (12 PM PT)

- [ ] Confirm QR daily job completed successfully
- [ ] Spot-check: Open one QR email (your test account) and verify QR loads
- [ ] Review Resend dashboard: daily batch should show ~N sends (N = active subs)

### Afternoon (By 3 PM PT)

- [ ] Check for dunning email sends (any `invoice.payment_failed` events today?)
- [ ] Review new subscriptions (Stripe dashboard or DB query):
  ```sql
  SELECT * FROM subscriptions WHERE DATE(created_at) = CURRENT_DATE;
  ```
- [ ] Verify new customers have `telegram_link_status.is_linked = TRUE` OR received `handle_confirm` email

### Evening (By 11 PM PT)

- [ ] Spot-check kiosk redemptions (DB query):
  ```sql
  SELECT COUNT(*) FROM redemptions WHERE service_date = CURRENT_DATE;
  ```
- [ ] Review any manual support requests from @noahchonlee DMs
- [ ] Note any anomalies in ops log (Google Doc or Notion)

---

## Weekly Tasks (Friday Morning)

- [ ] **Week boundary rollover** (Friday 09:00 PT):
  - Review `skips` table for `eligible_for_reimbursement = TRUE` rows in upcoming week
  - Export skip summary for accounting (if applicable)
  - No action required if refund logic is automated

- [ ] **Subscription health check:**
  ```sql
  SELECT status, COUNT(*) FROM subscriptions GROUP BY status;
  ```
  - Expected: Mostly `active`, some `past_due`, few `canceled`
  - Alert if >10% are `past_due`

- [ ] **Email template review:**
  - Check `email_templates` for recent version changes
  - Preview any updated templates (click "Preview" in admin)

---

## Interpreting Alerts (Telegram DMs from Bot)

**Alert Format:**
```
🚨 [CRITICAL] QR Job Failed
Job: daily_qr_issuance
Error: Resend rate limit exceeded
Correlation ID: abc-123-def
Time: 2025-11-15 12:05:30 PT
```

### Alert Types & Actions

| Alert | Severity | Action |
|-------|----------|--------|
| **QR Job Failed** | 🚨 Critical | See runbook: `QR-JOB-FAILED.md` |
| **Webhook Backlog** | ⚠️ High | See runbook: `WEBHOOK-BACKLOG.md` |
| **Resend Send Failure** | ⚠️ High | Check Resend dashboard; retry manually if needed |
| **Stripe Signature Verification Failed** | 🔒 Security | Check Stripe webhook secret; alert @noahchonlee |
| **Telegram Webhook Failure** | ⚠️ Medium | Verify Telegram secret token; check bot status |
| **High Skip Volume** | ℹ️ Info | Note for weekly summary; no immediate action |

**Correlation ID:** Use this to search logs in Vercel dashboard

---

## Common Tasks

### 1. Manually Regenerate QR for Customer

**Scenario:** Customer didn't receive email or QR expired

**Steps:**
1. Find customer in DB:
   ```sql
   SELECT id, email FROM customers WHERE email = 'user@example.com';
   ```
2. Run manual QR issuance script (Engineer provides):
   ```bash
   node scripts/issue-qr.js --customer-id=<uuid> --date=2025-11-15
   ```
3. Script sends email via Resend
4. Confirm with customer via Telegram

### 2. Handle Bounced Email

**Scenario:** Resend webhook shows `email.bounced`

**Steps:**
1. Find customer by email in `customers` table
2. Check bounce type:
   - **Hard bounce** (mailbox doesn't exist): DM customer on Telegram, ask for updated email
   - **Soft bounce** (temporary): No action; Resend will retry
3. Update email in DB if customer provides new one:
   ```sql
   UPDATE customers SET email = 'newemail@example.com' WHERE id = '<uuid>';
   ```
4. Log in `audit_log`

### 3. Extend Correction Link (48h Expired)

**Scenario:** Customer missed 48h window for Telegram handle correction

**Steps:**
1. Generate new token via admin UI:
   - Navigate to `/admin/customers/<customer_id>`
   - Click "Send Handle Correction Link"
   - System generates new 48h token and emails customer
2. Confirm receipt with customer via Telegram

### 4. Process Manual Refund Request

**Scenario:** Customer skipped multiple days, requests credit

**Steps:**
1. Query skips for customer:
   ```sql
   SELECT skip_date, eligible_for_reimbursement
   FROM skips
   WHERE customer_id = '<uuid>' AND eligible_for_reimbursement = TRUE;
   ```
2. Count eligible days
3. Calculate refund (out of scope for MVP; forward to @noahchonlee)
4. Log decision in ops notes

---

## Escalation Path

**When to DM @noahchonlee:**

- Critical alerts (QR job failure, webhook backlog >100 events)
- Security events (signature verification failures, unusual login attempts)
- Customer requests you can't resolve (allergy changes, billing disputes)
- System anomalies (redemption count ≠ subscription count by >20%)

**Format:**
```
@noahchonlee

Issue: [brief description]
Severity: Critical / High / Medium
Time: [timestamp PT]
Correlation ID: [if applicable]
Steps taken: [what you've tried]
```

---

## Tools & Access

| Tool | URL | Purpose |
|------|-----|---------|
| Admin Panel | https://app.frontier-meals.com/admin | Email templates, customer lookup |
| Vercel Logs | https://vercel.com/frontier-meals/logs | Cron jobs, webhook logs |
| Stripe Dashboard | https://dashboard.stripe.com | Subscriptions, payments |
| Resend Dashboard | https://resend.com/emails | Email delivery status |
| Telegram Bot | https://t.me/frontiermealsbot | Customer support, ops alerts |
| Supabase | https://supabase.com/dashboard | Direct DB access (read-only for ops) |

**Credentials:** Stored in 1Password (Ops Steward vault)

---

## Related Documents

- `runbooks/QR-JOB-FAILED.md` — Manual QR regeneration
- `runbooks/WEBHOOK-BACKLOG.md` — Stripe/Telegram recovery
- `runbooks/RESEND-OUTAGE.md` — Email failover

---

## Ops Notes Template

**Daily Log (Google Doc):**

```
Date: 2025-11-15 (Friday)

Subscriptions: 42 active, 2 past_due, 1 canceled
QR emails sent: 42 (12:00 PM PT, all delivered)
Redemptions: 38 (90% redemption rate)

Alerts: None

Manual tasks:
- Regenerated QR for customer@example.com (didn't receive email)
- Forwarded allergy change request to @noahchonlee

Notes:
- Friday week rollover completed; 5 skips eligible for reimbursement next week
- New template version for dunning_soft deployed (v3)
```

---

**END OF OPS STEWARD QUICKSTART**
