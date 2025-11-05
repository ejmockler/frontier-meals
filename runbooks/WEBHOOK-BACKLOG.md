# Runbook: Webhook Backlog

**Severity:** ⚠️ High
**SLA:** Resolve within 1 hour

---

## Symptoms

- Ops alert via Telegram: `⚠️ [HIGH] Webhook Backlog Detected`
- Stripe/Telegram events not processing
- `webhook_events` table shows many `status = 'processing'` rows older than 5 minutes

---

## Diagnosis

### 1. Check Backlog Size

```sql
SELECT
  source,
  COUNT(*) AS backlog_count
FROM webhook_events
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '5 minutes'
GROUP BY source;
```

**Expected:** 0 rows (healthy)
**Alert Threshold:** >100 rows

### 2. Identify Stuck Events

```sql
SELECT
  id,
  source,
  event_type,
  created_at,
  error_message
FROM webhook_events
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC
LIMIT 20;
```

### 3. Common Causes

| Source | Cause | Fix |
|--------|-------|-----|
| **Stripe** | DB connection timeout | Restart app, check Supabase |
| **Telegram** | Rate limit hit | Wait 1 min, retry |
| **Resend** | Webhook signature mismatch | Verify `RESEND_WEBHOOK_SECRET` |
| **All** | App crash during processing | Check Vercel logs, redeploy |

---

## Resolution

### Option A: Automatic Retry (Built-In)

**If exponential backoff is working:**

- Wait for automatic retries (1m, 5m, 15m, 60m intervals)
- Monitor backlog with above query every 10 minutes
- Backlog should decrease naturally

### Option B: Manual Retry Script

**If backlog not clearing:**

```bash
node scripts/retry-webhooks.js --source=stripe --limit=100
```

**Script:** `scripts/retry-webhooks.js`
```javascript
const { db } = require('../src/lib/db');
const { handleStripeEvent } = require('../src/lib/stripe-handler');

async function retryWebhooks(source, limit) {
  const stuck = await db.webhook_events.findMany({
    where: {
      source,
      status: 'processing',
      created_at: { lt: new Date(Date.now() - 10 * 60 * 1000) }
    },
    take: limit
  });

  for (const event of stuck) {
    try {
      await handleStripeEvent(JSON.parse(event.event_data));
      await db.webhook_events.update({
        where: { id: event.id },
        data: { status: 'processed', processed_at: new Date() }
      });
      console.log(`✅ Retried ${event.event_id}`);
    } catch (err) {
      console.error(`❌ Failed ${event.event_id}:`, err.message);
      await db.webhook_events.update({
        where: { id: event.id },
        data: { status: 'failed', error_message: err.message }
      });
    }
  }
}

// Usage: node scripts/retry-webhooks.js --source=stripe --limit=100
```

### Option C: Mark as Failed (Dead-Letter)

**If events cannot be processed (e.g., invalid data):**

```sql
UPDATE webhook_events
SET status = 'failed',
    error_message = 'Manual fail: invalid event data'
WHERE id IN (
  SELECT id FROM webhook_events
  WHERE status = 'processing'
    AND created_at < NOW() - INTERVAL '1 hour'
  LIMIT 100
);
```

**Then:** Alert @noahchonlee to review failed events

---

## Stripe-Specific Recovery

### Re-Send Events from Stripe

**If events were lost (app was down):**

1. Visit https://dashboard.stripe.com/webhooks
2. Select endpoint
3. Click "Events" tab
4. Filter: `created >= <downtime_start>`
5. Click "Resend" for each event (or use Stripe CLI)

**Stripe CLI Batch Resend:**
```bash
stripe events resend \
  --api-key <STRIPE_SECRET_KEY> \
  --created ">$(date -u -d '1 hour ago' +%s)" \
  --limit 100
```

---

## Telegram-Specific Recovery

### Check Bot Webhook Status

```bash
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

**Expected:**
```json
{
  "ok": true,
  "result": {
    "url": "https://api.frontier-meals.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null
  }
}
```

**If `pending_update_count > 0`:**
- Telegram is queuing updates due to failed responses
- Fix webhook handler, then events will auto-retry

**If `last_error_date` is recent:**
- Check `last_error_message`
- Common: signature mismatch, timeout

### Manual Update Processing

**Fetch pending updates (long-polling):**
```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates?timeout=10"
```

**Process manually:**
```bash
curl -X POST https://api.frontier-meals.com/api/telegram/webhook \
  -H "X-Telegram-Bot-Api-Secret-Token: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '<update_json>'
```

---

## Verification

### 1. Check Backlog Cleared

```sql
SELECT COUNT(*) FROM webhook_events
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '5 minutes';
```

**Expected:** 0

### 2. Spot-Check Recent Events

```sql
SELECT * FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

**Expected:** All `status = 'processed'` or `failed` (not `processing`)

### 3. Test New Event

**Stripe:**
```bash
stripe trigger checkout.session.completed
```

**Telegram:**
Send `/start` to bot, verify response

---

## Prevention

### 1. Increase Timeout

**Vercel Function Config:**
```json
{
  "functions": {
    "api/stripe/webhook.ts": {
      "maxDuration": 60
    }
  }
}
```

### 2. Add Idempotency Safeguards

**Ensure ON CONFLICT handles duplicates:**
```sql
INSERT INTO webhook_events (source, event_id, event_type, status)
VALUES ('stripe', 'evt_123', 'invoice.paid', 'processing')
ON CONFLICT (event_id) DO NOTHING;
```

### 3. Monitor Backlog Size

**Alert if >50 stuck events:**
```sql
SELECT cron.schedule(
  'webhook-backlog-monitor',
  '*/10 * * * *',  -- Every 10 minutes
  $$
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM webhook_events WHERE status = 'processing' AND created_at < NOW() - INTERVAL '10 minutes') > 50
    THEN net.http_post(url := 'https://api.frontier-meals.com/api/alert/ops', body := '{"alert": "Webhook backlog >50"}'::jsonb)
  END;
  $$
);
```

---

## Escalation

**If backlog continues to grow after 1 hour:**
1. DM @noahchonlee with:
   - Source (Stripe, Telegram, Resend)
   - Backlog count
   - Sample error messages
2. Consider temporary pause:
   - Stripe: Disable webhook endpoint in dashboard (LAST RESORT)
   - Telegram: `deleteWebhook` (will queue updates for later)

---

## Post-Incident

### 1. Data Integrity Check

**Verify no duplicate subscriptions:**
```sql
SELECT stripe_subscription_id, COUNT(*)
FROM subscriptions
GROUP BY stripe_subscription_id
HAVING COUNT(*) > 1;
```

**Verify entitlements match:**
```sql
SELECT
  DATE(service_date) AS date,
  COUNT(*) AS entitlements,
  (SELECT COUNT(DISTINCT customer_id) FROM subscriptions WHERE status = 'active') AS expected
FROM entitlements
WHERE service_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(service_date);
```

### 2. Update Runbook

- Document new failure mode if discovered
- Add preventive measures

---

**END OF RUNBOOK**
