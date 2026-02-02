# KEY-COMPROMISE Runbook

**Purpose:** Emergency response procedure when cryptographic signing keys are compromised or suspected to be compromised.

**Severity:** CRITICAL
**Response Time:** Immediate (within 1 hour of detection)

---

## Overview

This runbook covers response to compromise of:
1. **Kiosk Session Signing Key** (`KIOSK_PRIVATE_KEY_BASE64`)
2. **QR Token Signing Key** (`QR_PRIVATE_KEY_BASE64`)
3. **Admin Session Signing Key** (if applicable)

---

## 1. Kiosk Session Key Compromise

### Symptoms
- Unauthorized kiosk sessions appearing in audit logs
- Meal redemptions from unexpected locations
- Suspicious kiosk IDs in redemption logs
- Report of kiosk device theft or unauthorized access to admin credentials

### Immediate Actions (Within 15 minutes)

#### Step 1: Revoke All Active Kiosk Sessions
```sql
-- Connect to Supabase database
-- Revoke ALL kiosk sessions immediately
UPDATE kiosk_sessions
SET
  revoked_at = NOW(),
  revoked_by = 'security-incident',
  revocation_reason = 'Key compromise - emergency revocation'
WHERE revoked_at IS NULL;
```

Or via API (if available):
```bash
# Using Supabase client
curl -X POST "https://your-project.supabase.co/rest/v1/rpc/revoke_all_kiosk_sessions" \
  -H "apikey: YOUR_SERVICE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_kiosk_id": "%", "p_revoked_by": "security-incident", "p_reason": "Key compromise"}'
```

#### Step 2: Generate New Key Pair
```bash
# Generate new ECDSA P-256 key pair for kiosk signing
openssl ecparam -genkey -name prime256v1 -noout -out kiosk_private.pem
openssl ec -in kiosk_private.pem -pubout -out kiosk_public.pem

# Base64 encode for environment variable
cat kiosk_private.pem | base64 | tr -d '\n'
# Save this output as new KIOSK_PRIVATE_KEY_BASE64

cat kiosk_public.pem | base64 | tr -d '\n'
# Save this output as new KIOSK_PUBLIC_KEY (if separate env var)
```

#### Step 3: Deploy New Keys
1. Update environment variables in Cloudflare Workers:
   ```bash
   # Via Wrangler CLI
   wrangler secret put KIOSK_PRIVATE_KEY_BASE64
   # Paste new base64-encoded private key

   wrangler secret put KIOSK_PUBLIC_KEY
   # Paste new PEM public key
   ```

2. Or via Cloudflare Dashboard:
   - Go to Workers & Pages > your-worker > Settings > Variables
   - Update `KIOSK_PRIVATE_KEY_BASE64` and `KIOSK_PUBLIC_KEY`
   - Save and deploy

#### Step 4: Reissue Kiosk Sessions
All legitimate kiosks need new session tokens:
1. Contact each kiosk operator
2. Admin generates new session via `/admin/kiosk`
3. Kiosk operator updates their device with new URL

### Post-Incident (Within 24 hours)

1. **Audit Logs Review:**
   ```sql
   -- Check for suspicious redemptions during compromise window
   SELECT r.*, c.name, c.email
   FROM redemptions r
   JOIN customers c ON r.customer_id = c.id
   WHERE r.redeemed_at > '2024-XX-XX'  -- Start of compromise window
   ORDER BY r.redeemed_at DESC;
   ```

2. **Notify Affected Parties:**
   - If customer data was potentially accessed, notify them
   - Document incident for compliance

3. **Root Cause Analysis:**
   - How was the key compromised?
   - What access controls failed?
   - Update security procedures

---

## 2. QR Token Key Compromise

### Symptoms
- QR codes being redeemed that weren't issued by the system
- Multiple redemption attempts with invalid signatures
- Suspicious `INVALID_TOKEN` errors in logs

### Immediate Actions (Within 15 minutes)

#### Step 1: Invalidate All Unused QR Tokens
```sql
-- Mark all unused QR tokens as compromised
UPDATE qr_tokens
SET used_at = NOW()
WHERE used_at IS NULL
  AND expires_at > NOW();

-- Log the mass invalidation
INSERT INTO audit_log (actor, action, subject, metadata)
VALUES (
  'security-incident',
  'qr_tokens_mass_invalidated',
  'system',
  '{"reason": "Key compromise - emergency invalidation"}'
);
```

#### Step 2: Generate New QR Signing Key
```bash
# Generate new ECDSA P-256 key pair
openssl ecparam -genkey -name prime256v1 -noout -out qr_private.pem
openssl ec -in qr_private.pem -pubout -out qr_public.pem

# Base64 encode for environment variable
cat qr_private.pem | base64 | tr -d '\n'
# Update QR_PRIVATE_KEY_BASE64
```

#### Step 3: Deploy New Key
Update in Cloudflare Workers (same process as kiosk keys).

#### Step 4: Trigger New QR Issuance
```bash
# Manually trigger QR cron job to issue new codes with new key
curl -X GET "https://your-app.com/api/cron/issue-qr" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Customer Communication
If compromise occurred close to service time, notify customers:
- Push notification via Telegram bot
- Email with new QR code
- Message: "Your QR code has been updated for security. Please use the new code attached."

---

## 3. Prevention Checklist

### Key Storage
- [ ] Private keys stored ONLY in Cloudflare Workers secrets
- [ ] Private keys NEVER in git repository or logs
- [ ] Private keys NEVER in error messages or stack traces
- [ ] Rotate keys annually even without incident

### Access Control
- [ ] Admin authentication requires 2FA
- [ ] Service role keys restricted to necessary services
- [ ] Audit log reviews scheduled monthly
- [ ] Key rotation procedures documented and tested

### Monitoring
- [ ] Alerts on unusual redemption patterns
- [ ] Alerts on `INVALID_TOKEN` error spikes
- [ ] Dashboard showing kiosk session activity

---

## 4. Key Rotation Schedule (Preventive)

| Key Type | Rotation Frequency | Last Rotated | Next Due |
|----------|-------------------|--------------|----------|
| Kiosk Session | Annual | YYYY-MM-DD | YYYY-MM-DD |
| QR Token | Annual | YYYY-MM-DD | YYYY-MM-DD |
| Admin Session | Annual | YYYY-MM-DD | YYYY-MM-DD |

---

## 5. Contacts

| Role | Name | Contact |
|------|------|---------|
| Primary On-Call | TBD | TBD |
| Security Lead | TBD | TBD |
| Database Admin | TBD | TBD |

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-02 | Security Audit | Initial creation (C5 fix) |
