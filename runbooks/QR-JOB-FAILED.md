# Runbook: QR Job Failed

**Severity:** 🚨 Critical
**SLA:** Resolve within 30 minutes

---

## Symptoms

- Ops alert via Telegram DM: `🚨 [CRITICAL] QR Job Failed`
- Customers report missing QR emails
- Resend dashboard shows 0 sends for today's batch

---

## Diagnosis

### 1. Check Cron Execution

**Supabase:**
```sql
SELECT * FROM cron.job_run_details
WHERE jobname = 'daily-qr-issuance'
ORDER BY start_time DESC
LIMIT 5;
```

**Vercel:**
```bash
vercel logs --since 1h | grep '/api/cron/issue-qr'
```

### 2. Identify Root Cause

| Error | Cause | Fix |
|-------|-------|-----|
| **Resend rate limit exceeded** | Too many sends in short window | Wait 1 min, retry batch |
| **Supabase connection timeout** | DB overload or network issue | Check Supabase status, retry |
| **QR signing key missing** | Env var not set | Verify `QR_PRIVATE_KEY` in Vercel |
| **No active subscriptions** | Data issue (unlikely) | Query `subscriptions` table |

---

## Resolution

### Option A: Manual Retry (Immediate)

```bash
curl -X POST https://api.frontier-meals.com/api/cron/issue-qr \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json"
```

**Expected Output:**
```json
{
  "success": true,
  "count": 42,
  "timestamp": "2025-11-15T12:05:30Z"
}
```

### Option B: Manual QR Generation (Per Customer)

**If batch retry fails:**

```bash
node scripts/issue-qr.js --customer-id=<uuid> --date=2025-11-15
```

**Script:** `scripts/issue-qr.js`
```javascript
const { issueQRForCustomer } = require('../src/lib/qr');
const { sendEmail } = require('../src/lib/resend');

const customerId = process.argv[2];
const serviceDate = process.argv[3];

async function main() {
  const qr = await issueQRForCustomer(customerId, serviceDate);
  await sendEmail({
    template: 'qr_daily',
    to: qr.customer.email,
    context: { service_date: serviceDate, qr_code: qr.token }
  });
  console.log(`✅ QR issued for ${qr.customer.email}`);
}

main();
```

---

## Verification

### 1. Check Resend Dashboard

- Visit https://resend.com/emails
- Filter by `sent_at >= today 12:00 PM PT`
- Expected: ~N emails (N = active subscriptions count)

### 2. Spot-Check Customer

```sql
SELECT * FROM qr_tokens
WHERE service_date = CURRENT_DATE
ORDER BY issued_at DESC
LIMIT 10;
```

### 3. Test QR Scan

- Open test customer's email
- Scan QR at `/kiosk` (use dev kiosk with assertion)
- Verify success message

---

## Prevention

### 1. Add Retry Logic to Cron

**Exponential Backoff:**
```typescript
async function issueQRWithRetry(customer, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await issueQR(customer);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(Math.pow(2, i) * 1000); // 1s, 2s, 4s
    }
  }
}
```

### 2. Monitor Resend Rate Limits

**Pre-flight Check:**
```typescript
const rateLimit = await resend.rateLimit.check();
if (rateLimit.remaining < 100) {
  await sleep(60000); // Wait 1 minute
}
```

### 3. Alert on Job Skipped

**Supabase pg_cron:**
```sql
-- Alert if job hasn't run in 25 hours
SELECT cron.schedule(
  'qr-job-watchdog',
  '30 12 * * *',  -- 12:30 PM PT (30 min after expected)
  $$
  SELECT CASE
    WHEN (SELECT MAX(start_time) FROM cron.job_run_details WHERE jobname = 'daily-qr-issuance') < NOW() - INTERVAL '25 hours'
    THEN net.http_post(url := 'https://api.frontier-meals.com/api/alert/ops', body := '{"alert": "QR job not run in 25h"}'::jsonb)
  END;
  $$
);
```

---

## Escalation

**If unable to resolve in 30 minutes:**
1. DM @noahchonlee on Telegram with:
   - Correlation ID
   - Error message
   - Steps attempted
2. Notify customers via Telegram bot:
   ```
   🛠️ We're experiencing a delay with today's QR codes. You'll receive yours shortly. If you need immediate access, message @noahchonlee.
   ```

---

## Post-Incident

### 1. Root Cause Analysis

- Document in `incidents/<date>-qr-job-failed.md`
- Update this runbook if new failure mode discovered

### 2. Customer Communication

**If >1 hour delay:**
- Send apology email via `/admin/emails/send`
- Offer skip credit for affected day (manual process, coordinate with @noahchonlee)

---

**END OF RUNBOOK**
