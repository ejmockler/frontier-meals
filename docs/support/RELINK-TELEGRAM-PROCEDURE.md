# Support Procedure: Relink Telegram Account

## When to Use This

**Customer reports:**
- "I paid but I'm not getting QR codes"
- "Someone else is getting my meals"
- "Wrong Telegram account is linked"
- "I need to change my Telegram username"

**Admin detects:**
- Duplicate `telegram_user_id` in monitoring query
- Customer email doesn't match Telegram username pattern
- Audit log shows suspicious linking activity

---

## Quick Fix (30 seconds)

### Step 1: Unlink Current Account

```sql
-- Find customer by email
SELECT id, email, telegram_user_id, telegram_handle
FROM customers
WHERE email = 'customer@example.com';

-- Unlink Telegram (sets telegram_user_id and telegram_handle to NULL)
UPDATE customers
SET telegram_user_id = NULL,
    telegram_handle = NULL
WHERE id = 'CUSTOMER_ID_FROM_ABOVE';
```

### Step 2: Generate New Token

```sql
-- Create new deep link token (7-day expiry)
INSERT INTO telegram_deep_link_tokens (
  customer_id,
  token_hash,
  expires_at,
  used
) VALUES (
  'CUSTOMER_ID_FROM_ABOVE',
  encode(sha256(gen_random_uuid()::text::bytea), 'hex'),  -- Random token hash
  NOW() + INTERVAL '7 days',
  false
) RETURNING id, token_hash;

-- NOTE: You can't recover the plaintext token from the hash
-- So we need to generate the token BEFORE hashing it
```

**Better approach using psql variables:**

```sql
-- Generate token with psql variable
\set plaintext_token `echo $(uuidgen)`
\set token_hash `echo -n :plaintext_token | sha256sum | cut -d' ' -f1`

-- Insert token
INSERT INTO telegram_deep_link_tokens (
  customer_id,
  token_hash,
  expires_at,
  used
) VALUES (
  'CUSTOMER_ID',
  :'token_hash',
  NOW() + INTERVAL '7 days',
  false
);

-- Show deep link
\echo 'Send this link to customer: https://t.me/frontiermealsbot?start=':{plaintext_token}
```

### Step 3: Send Link to Customer

**Via Email (Recommended):**

Use admin dashboard to trigger welcome email resend:
1. Navigate to customer detail page
2. Click "Resend Telegram Link" button
3. Email will contain fresh token

**Via Support Chat:**

If urgent, copy the deep link from Step 2 and send directly:
```
Hi [Customer Name],

We've reset your Telegram link. Please click here to connect:
https://t.me/frontiermealsbot?start=[TOKEN]

This link expires in 7 days. Let us know if you have any issues!
```

---

## Alternative: SQL Function (Coming Soon)

**Future enhancement - add to admin schema:**

```sql
-- Function to generate and return plaintext token
CREATE OR REPLACE FUNCTION generate_telegram_token(customer_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  plaintext_token TEXT;
  token_hash TEXT;
BEGIN
  -- Generate random UUID as token
  plaintext_token := gen_random_uuid()::text;

  -- Hash the token
  token_hash := encode(sha256(plaintext_token::bytea), 'hex');

  -- Insert into database
  INSERT INTO telegram_deep_link_tokens (
    customer_id,
    token_hash,
    expires_at,
    used
  ) VALUES (
    customer_uuid,
    token_hash,
    NOW() + INTERVAL '7 days',
    false
  );

  -- Return plaintext token
  RETURN plaintext_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to admin role
GRANT EXECUTE ON FUNCTION generate_telegram_token TO admin_role;

-- Usage:
SELECT generate_telegram_token('CUSTOMER_ID');
-- Returns: 'abc123-def456-...' (plaintext token)
-- Then construct: https://t.me/frontiermealsbot?start=[token]
```

---

## Verification

After relinking, verify:

```sql
-- Check customer record
SELECT
  id,
  email,
  telegram_user_id,
  telegram_handle,
  created_at
FROM customers
WHERE id = 'CUSTOMER_ID';

-- Check link status
SELECT
  is_linked,
  first_seen_at,
  last_seen_at
FROM telegram_link_status
WHERE customer_id = 'CUSTOMER_ID';

-- Check active token
SELECT
  id,
  created_at,
  expires_at,
  used,
  used_at
FROM telegram_deep_link_tokens
WHERE customer_id = 'CUSTOMER_ID'
  AND used = false
ORDER BY created_at DESC
LIMIT 1;
```

**Expected state after unlink:**
- `customers.telegram_user_id` = NULL
- `customers.telegram_handle` = NULL
- `telegram_link_status.is_linked` = false
- Fresh token exists with `used = false`

**After customer clicks new link:**
- `customers.telegram_user_id` = [their Telegram ID]
- `customers.telegram_handle` = @[their username]
- `telegram_link_status.is_linked` = true
- Token marked `used = true`

---

## Common Issues

### Issue 1: "Token not working"

**Symptom:** Customer clicks link, bot says "That link doesn't look right"

**Causes:**
1. Token expired (>7 days old)
2. Token already used
3. Webhook hasn't activated PayPal token yet (customer_id still NULL)

**Fix:**
```sql
-- Check token status
SELECT
  token_hash,
  customer_id,
  expires_at,
  used,
  paypal_custom_id
FROM telegram_deep_link_tokens
WHERE customer_id = 'CUSTOMER_ID'
ORDER BY created_at DESC
LIMIT 1;

-- If expired or used, generate new token (see Step 2 above)
-- If customer_id is NULL (PayPal), wait 1 minute for webhook, then retry
```

### Issue 2: "Still not getting QR codes"

**Symptom:** Customer linked successfully but no QR codes arrive

**Causes:**
1. Subscription not active (`subscriptions.status != 'active'`)
2. Date is skipped (`skips` table has entry for today)
3. Telegram message failed to send

**Fix:**
```sql
-- Check subscription status
SELECT
  status,
  current_period_start,
  current_period_end
FROM subscriptions
WHERE customer_id = 'CUSTOMER_ID';

-- Check for skips
SELECT skip_date, source
FROM skips
WHERE customer_id = 'CUSTOMER_ID'
  AND skip_date >= CURRENT_DATE;

-- Check QR code generation
SELECT
  qr_token,
  created_at,
  status,
  telegram_sent_at,
  telegram_error
FROM qr_codes
WHERE customer_id = 'CUSTOMER_ID'
ORDER BY created_at DESC
LIMIT 5;
```

### Issue 3: "Duplicate telegram_user_id"

**Symptom:** Monitoring query shows same Telegram ID linked to multiple customers

**This indicates token sharing or error. Investigate:**

```sql
-- Find all customers with duplicate Telegram ID
SELECT
  id,
  email,
  telegram_handle,
  telegram_user_id,
  created_at,
  payment_provider
FROM customers
WHERE telegram_user_id = 12345678  -- Replace with actual telegram_user_id
ORDER BY created_at;

-- Check audit log for linking events
SELECT
  created_at,
  action,
  metadata
FROM audit_log
WHERE action = 'telegram_linked'
  AND metadata->>'telegram_user_id' = '12345678'  -- Replace with actual ID
ORDER BY created_at;
```

**Action:**
1. Contact BOTH customers to determine correct owner
2. Unlink incorrect customer (see Step 1)
3. Generate new token for incorrect customer
4. Note in customer record for future reference

---

## Admin Dashboard (Future)

**Planned UI features:**

```
Customer Detail Page
├─ Telegram Section
│  ├─ Status: Linked ✅ | Not Linked ❌
│  ├─ Username: @johndoe
│  ├─ User ID: 12345678
│  └─ Actions:
│     ├─ [Unlink Account] (sets telegram_user_id=NULL)
│     ├─ [Resend Link] (generates new token, sends email)
│     └─ [View Audit Log] (shows telegram_linked events)
│
└─ Subscription Section
   ├─ Status: Active
   ├─ Next Billing: Jan 30, 2026
   └─ Actions:
      └─ [View QR History]
```

**Alert Banner:**
```
⚠️ Warning: This Telegram account (@johndoe) is linked to multiple customers.
   Possible token sharing. [Investigate]
```

---

## Support Scripts

### Script 1: Bulk Token Regeneration

If email server went down and tokens expired before delivery:

```sql
-- Find customers who never linked (tokens expired)
WITH never_linked AS (
  SELECT DISTINCT c.id, c.email
  FROM customers c
  LEFT JOIN telegram_link_status tls ON c.id = tls.customer_id
  WHERE (tls.is_linked = false OR tls.is_linked IS NULL)
    AND c.created_at > NOW() - INTERVAL '30 days'
)
-- Generate new tokens (requires custom function)
SELECT
  id,
  email,
  generate_telegram_token(id) as new_token
FROM never_linked;

-- Export results and send bulk email
```

### Script 2: Detect Token Sharing (Weekly Ops Review)

```sql
-- Run every Monday morning
SELECT
  telegram_user_id,
  COUNT(*) as customer_count,
  STRING_AGG(email, ', ' ORDER BY created_at) as emails
FROM customers
WHERE telegram_user_id IS NOT NULL
GROUP BY telegram_user_id
HAVING COUNT(*) > 1;

-- If any rows returned, investigate each case
```

---

## Contact Escalation

**If issue persists after relinking:**

1. Check webhook logs for errors:
   - Cloudflare Pages logs
   - Supabase logs for database errors
   - Telegram API logs for bot failures

2. Verify customer has Telegram username set:
   - Ask customer to check Settings > Edit Profile > Username
   - Some users have no username (privacy setting)
   - These users cannot use the bot (limitation of Telegram deep links)

3. Escalate to engineering if:
   - Webhook consistently failing for this customer
   - Database constraint violations
   - Token generation errors

---

## References

- **Token Creation (PayPal):** `/src/routes/api/paypal/create-subscription/+server.ts`
- **Token Creation (Stripe):** `/src/routes/api/stripe/webhook/+server.ts`
- **Token Consumption:** `/src/routes/api/telegram/webhook/+server.ts`
- **Monitoring Queries:** `/docs/monitoring/token-sharing-detection.sql`
- **Security Analysis:** `/docs/EC-3-TOKEN-SHARING-ANALYSIS.md`
