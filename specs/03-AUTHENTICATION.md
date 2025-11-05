# Frontier Meals — Authentication & Security Specification

**Version:** 1.0
**Date:** 2025-10-26

---

## Overview

Frontier Meals uses **three separate authentication domains** with distinct security boundaries:

| Domain | Method | Scope |
|--------|--------|-------|
| **Admin (Staff)** | Passwordless magic link → signed session cookie | /admin routes, email composer, kiosk session launcher |
| **Kiosk** | Device-bound assertion (short-lived JWT) | /kiosk route only; no admin chrome |
| **Customer (Future)** | API tokens (out of scope for MVP) | Telegram bot handles all customer interactions |

**No OAuth/SSO.** No Sentry. Minimal surface area.

---

## 1. Admin Authentication (Passwordless Magic Link)

### 1.1 Flow

```
1. User visits /admin → redirected to /login
2. User enters email → server generates one-time token (15min expiry)
3. Token stored in DB (hashed), email sent via Resend
4. User clicks link → server verifies token, creates session
5. Session stored in HTTP-only cookie (24h expiry)
6. Subsequent requests validated via session cookie
```

### 1.2 Token Generation

**Table:** `admin_magic_tokens`
```sql
CREATE TABLE admin_magic_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_magic_token_hash ON admin_magic_tokens(token_hash);
CREATE INDEX idx_magic_token_expires ON admin_magic_tokens(expires_at);
```

**Token Generation (Node.js):**
```javascript
const crypto = require('crypto');

function generateMagicLink(staffEmail) {
  // Generate 32-byte random token
  const token = crypto.randomBytes(32).toString('base64url');

  // Hash for storage
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Store in DB
  await db.admin_magic_tokens.insert({
    staff_account_id: staffAccount.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  });

  // Send email
  const magicLink = `https://app.frontier-meals.com/auth/verify?token=${token}`;
  await resend.emails.send({
    from: 'Frontier Meals <noreply@frontier-meals.com>',
    to: staffEmail,
    subject: 'Your login link',
    html: `<a href="${magicLink}">Click here to log in</a> (expires in 15 minutes)`
  });
}
```

### 1.3 Token Verification

**Route:** `GET /auth/verify?token=<token>`

```javascript
async function verifyMagicToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await db.admin_magic_tokens.findOne({
    token_hash: tokenHash,
    used_at: null,
    expires_at: { $gt: new Date() }
  });

  if (!record) {
    return { error: 'Invalid or expired link' };
  }

  // Mark as used
  await db.admin_magic_tokens.update(
    { id: record.id },
    { used_at: new Date() }
  );

  // Create session
  const sessionId = crypto.randomUUID();
  const sessionPayload = {
    session_id: sessionId,
    staff_id: record.staff_account_id,
    role: staffAccount.role,
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    iat: Math.floor(Date.now() / 1000)
  };

  // Sign session (HS256 with server secret)
  const sessionToken = jwt.sign(sessionPayload, process.env.SESSION_SECRET);

  return { sessionToken };
}
```

### 1.4 Session Cookie

**Cookie Properties:**
```javascript
res.cookie('fm_session', sessionToken, {
  httpOnly: true,
  secure: true, // HTTPS only
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/'
});
```

**Attributes:**
- `httpOnly`: Prevents JavaScript access (XSS mitigation)
- `secure`: HTTPS-only transmission
- `sameSite: strict`: Prevents CSRF attacks
- `maxAge`: 24 hours (auto-expire)

### 1.5 Session Validation (Middleware)

**SvelteKit `hooks.server.ts`:**
```typescript
export async function handle({ event, resolve }) {
  const sessionToken = event.cookies.get('fm_session');

  if (sessionToken) {
    try {
      const session = jwt.verify(sessionToken, process.env.SESSION_SECRET);

      // Check expiry
      if (session.exp < Date.now() / 1000) {
        event.cookies.delete('fm_session');
        event.locals.user = null;
      } else {
        event.locals.user = {
          staff_id: session.staff_id,
          role: session.role
        };
      }
    } catch (err) {
      event.locals.user = null;
    }
  }

  // Protect admin routes
  if (event.url.pathname.startsWith('/admin')) {
    if (!event.locals.user) {
      return new Response('Redirect', {
        status: 303,
        headers: { Location: '/login' }
      });
    }
  }

  return resolve(event);
}
```

### 1.6 CSRF Protection

**Admin POST routes require CSRF token:**

```javascript
// Generate CSRF token (stored in session)
function generateCSRFToken(sessionId) {
  return crypto
    .createHmac('sha256', process.env.CSRF_SECRET)
    .update(sessionId)
    .digest('hex');
}

// Validate CSRF token
function validateCSRFToken(sessionId, token) {
  const expected = generateCSRFToken(sessionId);
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(token)
  );
}
```

**SvelteKit Form Action:**
```typescript
export const actions = {
  send: async ({ request, locals, cookies }) => {
    const data = await request.formData();
    const csrfToken = data.get('csrf_token');

    const session = jwt.verify(cookies.get('fm_session'), process.env.SESSION_SECRET);

    if (!validateCSRFToken(session.session_id, csrfToken)) {
      return { error: 'Invalid CSRF token' };
    }

    // Process form...
  }
};
```

**HTML Form:**
```html
<form method="POST" action="?/send">
  <input type="hidden" name="csrf_token" value="{csrfToken}" />
  <!-- rest of form -->
</form>
```

---

## 2. Kiosk Authentication (Device-Bound Assertion)

### 2.1 Flow

```
1. Admin visits /admin/kiosk/launch
2. Admin clicks "Launch Kiosk Session" → server generates kiosk assertion JWT
3. Server returns 6-character pairing code OR magic link
4. Admin enters code on kiosk device OR opens link on kiosk device
5. Kiosk stores assertion in localStorage
6. All /kiosk API calls include assertion in Authorization header
```

### 2.2 Assertion Generation

**Claims:**
```json
{
  "iss": "frontier-meals-admin",
  "sub": "kiosk",
  "jti": "<uuid>",
  "device_id": "kiosk-sf-01",
  "iat": 1730390400,
  "exp": 1730476800
}
```

**Signing (ES256 — DIFFERENT key than QR tokens):**
```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./keys/kiosk-es256-private.pem');

function generateKioskAssertion(deviceId) {
  const payload = {
    iss: 'frontier-meals-admin',
    sub: 'kiosk',
    jti: crypto.randomUUID(),
    device_id: deviceId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
  };

  return jwt.sign(payload, privateKey, { algorithm: 'ES256' });
}
```

**Pairing Code (6-char alphanumeric):**
```javascript
function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Store mapping: code → assertion (15min expiry)
await redis.set(`pairing:${code}`, assertion, 'EX', 900);
```

### 2.3 Kiosk Initialization

**Kiosk UI (on device):**
```html
<form id="pairing">
  <input type="text" id="code" placeholder="Enter 6-character code" maxlength="6" />
  <button type="submit">Activate</button>
</form>

<script>
  document.getElementById('pairing').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('code').value.toUpperCase();

    const res = await fetch('/api/kiosk/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    const { assertion } = await res.json();
    localStorage.setItem('kiosk_assertion', assertion);

    // Reload to kiosk view
    window.location.href = '/kiosk';
  });
</script>
```

**API Route:** `POST /api/kiosk/activate`
```typescript
export async function POST({ request }) {
  const { code } = await request.json();

  const assertion = await redis.get(`pairing:${code}`);

  if (!assertion) {
    return json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  // Delete code (single-use)
  await redis.del(`pairing:${code}`);

  return json({ assertion });
}
```

### 2.4 Kiosk API Authentication

**All kiosk API calls:**
```javascript
const assertion = localStorage.getItem('kiosk_assertion');

fetch('/api/kiosk/redeem', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${assertion}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ qr_jwt: scannedQR })
});
```

**Server-Side Verification:**
```javascript
const publicKey = fs.readFileSync('./keys/kiosk-es256-public.pem');

function verifyKioskAssertion(token) {
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['ES256'] });

    // Check claims
    if (decoded.iss !== 'frontier-meals-admin' || decoded.sub !== 'kiosk') {
      throw new Error('Invalid issuer/subject');
    }

    return decoded;
  } catch (err) {
    return null;
  }
}
```

---

## 3. QR Token (Customer Identity)

### 3.1 Claims

```json
{
  "iss": "frontier-meals-kiosk",
  "sub": "<customer_id>",
  "jti": "<uuid>",
  "iat": 1730390400,
  "exp": 1730433540,
  "service_date": "2025-11-15"
}
```

**Expiry:** 11:59 PM PT same day (issued at 12:00 PM PT)

### 3.2 Signing (ES256 — DIFFERENT key than kiosk assertions)

**Daily Job (12:00 PM PT):**
```javascript
const privateKey = fs.readFileSync('./keys/qr-es256-private.pem');

async function issueQRForToday(customer) {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const serviceDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Calculate 11:59 PM PT expiry
  const expiryPT = new Date(`${serviceDate}T23:59:59-08:00`); // Pacific Time
  const exp = Math.floor(expiryPT.getTime() / 1000);

  const payload = {
    iss: 'frontier-meals-kiosk',
    sub: customer.id,
    jti,
    iat: now,
    exp,
    service_date: serviceDate
  };

  const token = jwt.sign(payload, privateKey, { algorithm: 'ES256' });

  // Store metadata
  await db.qr_tokens.insert({
    customer_id: customer.id,
    service_date: serviceDate,
    jti,
    issued_at: new Date(),
    expires_at: expiryPT
  });

  return token;
}
```

### 3.3 Verification (Kiosk)

```javascript
const publicKey = fs.readFileSync('./keys/qr-es256-public.pem');

async function verifyQRToken(token) {
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['ES256'] });

    // Check issuer
    if (decoded.iss !== 'frontier-meals-kiosk') {
      return { valid: false, error: 'invalid_issuer' };
    }

    // Check expiry (redundant with jwt.verify, but explicit)
    if (decoded.exp < Date.now() / 1000) {
      return { valid: false, error: 'expired' };
    }

    // Check if already used
    const qrRecord = await db.qr_tokens.findOne({ jti: decoded.jti });
    if (qrRecord.used_at) {
      return { valid: false, error: 'already_used' };
    }

    return { valid: true, claims: decoded };
  } catch (err) {
    return { valid: false, error: 'invalid_signature' };
  }
}
```

---

## 4. Key Management

### 4.1 Key Types

| Key | Algorithm | Purpose | Rotation |
|-----|-----------|---------|----------|
| **SESSION_SECRET** | HS256 (symmetric) | Admin session cookies | Quarterly |
| **CSRF_SECRET** | HMAC-SHA256 | CSRF token generation | Quarterly |
| **kiosk-es256-private.pem** | ES256 (asymmetric) | Kiosk assertion signing | Quarterly |
| **qr-es256-private.pem** | ES256 (asymmetric) | QR token signing | Quarterly |

**Storage:** Environment variables (Vercel secrets) + encrypted backups

### 4.2 Key Generation

**Generate ES256 Key Pair:**
```bash
# Private key
openssl ecparam -genkey -name prime256v1 -noout -out qr-es256-private.pem

# Public key
openssl ec -in qr-es256-private.pem -pubout -out qr-es256-public.pem
```

**Generate Symmetric Secrets:**
```bash
# SESSION_SECRET (64 bytes)
openssl rand -base64 64

# CSRF_SECRET (64 bytes)
openssl rand -base64 64
```

### 4.3 Rotation Schedule

**Quarterly rotation (every 90 days):**

1. Generate new keys
2. Deploy new keys as `*_NEXT` env vars (dual-key operation)
3. Update signing code to use `*_NEXT` keys
4. Verification code accepts both old and new keys (grace period: 7 days)
5. After 7 days, remove old keys

**Rotation Script:**
```bash
#!/bin/bash
# rotate-keys.sh

echo "Generating new QR signing key..."
openssl ecparam -genkey -name prime256v1 -noout -out qr-es256-private-new.pem
openssl ec -in qr-es256-private-new.pem -pubout -out qr-es256-public-new.pem

echo "Upload to Vercel:"
echo "  QR_PRIVATE_KEY_NEXT=$(cat qr-es256-private-new.pem | base64)"
echo "  QR_PUBLIC_KEY_NEXT=$(cat qr-es256-public-new.pem | base64)"

# Repeat for kiosk keys, SESSION_SECRET, CSRF_SECRET
```

---

## 5. Rate Limiting

### 5.1 Endpoints & Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/verify` | 5 attempts | 15 minutes |
| `/api/stripe/webhook` | 100 req/s | Sliding window |
| `/api/telegram/webhook` | 100 req/s | Sliding window |
| `/api/kiosk/redeem` | 10 req/minute per kiosk | Sliding window |
| `/api/handle/consume` | 3 attempts | 1 hour |
| `/api/email/send` (admin) | 50 req/hour | Per staff account |

### 5.2 Implementation (Vercel Edge Middleware)

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  analytics: true
});

export async function middleware(request: Request) {
  if (request.url.includes('/api/kiosk/redeem')) {
    const kioskId = request.headers.get('X-Kiosk-ID') || 'unknown';

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `kiosk:${kioskId}`
    );

    if (!success) {
      return new Response('Rate limit exceeded', { status: 429 });
    }
  }

  return next();
}
```

---

## 6. Security Checklist

### 6.1 Pre-Launch

- [ ] All secrets stored in env vars (never committed)
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] Session cookies: `httpOnly`, `secure`, `sameSite=strict`
- [ ] CSRF protection on all admin POST routes
- [ ] Webhook signature verification (Stripe, Telegram, Resend)
- [ ] Rate limiting deployed (Vercel Edge)
- [ ] RLS policies enabled on all tables
- [ ] Audit logging for sensitive actions
- [ ] Key rotation schedule documented

### 6.2 Quarterly Tasks

- [ ] Rotate ES256 key pairs (QR + kiosk)
- [ ] Rotate symmetric secrets (SESSION, CSRF)
- [ ] Review audit logs for anomalies
- [ ] Test webhook signature verification
- [ ] Verify rate limits are effective

### 6.3 Incident Response

**If private key compromised:**
1. Immediately generate new key pair
2. Deploy as `*_NEXT` key (dual operation)
3. Revoke old key after 1 hour (not 7 days)
4. Audit all redemptions/sessions in compromised window
5. Notify @noahchonlee via Telegram

**If session hijacking detected:**
1. Force logout all admin sessions (clear `fm_session` cookies)
2. Rotate `SESSION_SECRET`
3. Require re-authentication
4. Review audit logs

---

## Related Documents

- `specs/01-DATA-MODEL.md` — RLS policies, audit_log schema
- `specs/02-API-CONTRACTS.md` — Webhook verification
- `guides/ENGINEER.md` — Key rotation procedures
- `runbooks/KEY-COMPROMISE.md` — Emergency response

---

**END OF AUTHENTICATION & SECURITY SPECIFICATION**
