# Frontier Meals — API Contracts Specification

**Version:** 1.0
**Date:** 2025-10-26
**Scope:** External API interfaces (Stripe, Telegram, Resend)

---

## Table of Contents

1. [Stripe API](#stripe-api)
2. [Telegram Bot API](#telegram-bot-api)
3. [Resend API](#resend-api)
4. [Internal API Routes](#internal-api-routes)

---

## Stripe API

### Checkout Session Creation

**Endpoint:** `POST https://api.stripe.com/v1/checkout/sessions`

**Request:**
```json
{
  "mode": "subscription",
  "success_url": "https://frontier-meals.com/success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "https://frontier-meals.com/cancel",
  "line_items": [
    {
      "price": "price_MONTHLY_MEAL_PLAN",
      "quantity": 1
    }
  ],
  "allow_promotion_codes": true,
  "custom_fields": [
    {
      "key": "telegram_handle",
      "label": {
        "type": "custom",
        "custom": "Telegram Handle (@username)"
      },
      "type": "text",
      "text": {
        "minimum_length": 2,
        "maximum_length": 32
      },
      "optional": false
    }
  ]
}
```

**Notes:**
- Stripe auto-collects `email` (always enabled for Checkout)
- `name` is NOT auto-collected; must be extracted from `customer_details.name` in webhook (Stripe infers from card/payment details)
- `custom_fields` max: 3 fields
- `text.maximum_length` max: 255 chars (we use 32 for Telegram handles)

---

### Webhook Events

**Endpoint (our server):** `POST https://api.frontier-meals.com/api/stripe/webhook`

**Headers:**
```
Stripe-Signature: t=1730000000,v1=abc123...,v0=def456...
Content-Type: application/json
```

**Signature Verification (Node.js):**
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const sig = req.headers['stripe-signature'];
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

let event;
try {
  event = stripe.webhooks.constructEvent(
    req.rawBody,  // MUST be raw (not JSON-parsed)
    sig,
    endpointSecret
  );
} catch (err) {
  return res.status(400).send(`Webhook Error: ${err.message}`);
}
```

---

#### Event: `checkout.session.completed`

**Payload (abbreviated):**
```json
{
  "id": "evt_123ABC",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_123",
      "customer": "cus_ABC123",
      "subscription": "sub_XYZ789",
      "customer_details": {
        "email": "user@example.com",
        "name": "Jane Doe"
      },
      "custom_fields": [
        {
          "key": "telegram_handle",
          "label": {"type": "custom", "custom": "Telegram Handle (@username)"},
          "text": {
            "value": "@janedoe"
          }
        }
      ]
    }
  }
}
```

**Field Paths:**
- Email: `event.data.object.customer_details.email`
- Name: `event.data.object.customer_details.name`
- Telegram handle: `event.data.object.custom_fields[0].text.value`
- Stripe customer ID: `event.data.object.customer`
- Subscription ID: `event.data.object.subscription`

**Our Action:**
1. Upsert `customers` table (email, name, telegram_handle, stripe_customer_id)
2. INSERT `subscriptions` (stripe_subscription_id, status = 'active')
3. Generate one-time Telegram deep link token
4. Send deep link via email (Resend) or SMS

---

#### Event: `invoice.paid`

**Payload (abbreviated):**
```json
{
  "type": "invoice.paid",
  "data": {
    "object": {
      "id": "in_123",
      "customer": "cus_ABC123",
      "subscription": "sub_XYZ789",
      "status": "paid",
      "period_start": 1730390400,
      "period_end": 1732982400,
      "lines": {
        "data": [
          {
            "period": {
              "start": 1730390400,
              "end": 1732982400
            }
          }
        ]
      }
    }
  }
}
```

**Field Paths:**
- Period start: `event.data.object.lines.data[0].period.start` (Unix timestamp)
- Period end: `event.data.object.lines.data[0].period.end` (Unix timestamp)

**Our Action:**
1. UPDATE `subscriptions` SET `current_period_start` = start, `current_period_end` = end, `status` = 'active'
2. Clear any dunning flags

---

#### Event: `invoice.payment_failed`

**Payload (abbreviated):**
```json
{
  "type": "invoice.payment_failed",
  "data": {
    "object": {
      "id": "in_123",
      "customer": "cus_ABC123",
      "subscription": "sub_XYZ789",
      "status": "open",
      "attempt_count": 1,
      "next_payment_attempt": 1730476800
    }
  }
}
```

**Field Paths:**
- Attempt count: `event.data.object.attempt_count` (1 = first failure, >1 = retry)
- Next attempt: `event.data.object.next_payment_attempt` (Unix timestamp or null)

**Our Action:**
1. UPDATE `subscriptions` SET `status` = 'past_due'
2. Queue dunning email based on `attempt_count`:
   - 1 → `dunning_soft` (T+0)
   - 2 → `dunning_retry` (T+24-48h, Stripe auto-retry)
   - 3+ → `dunning_final` (T+72-96h)

---

#### Event: `customer.subscription.updated`

**Payload (abbreviated):**
```json
{
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_XYZ789",
      "customer": "cus_ABC123",
      "status": "past_due",
      "current_period_start": 1730390400,
      "current_period_end": 1732982400
    }
  },
  "previous_attributes": {
    "status": "active"
  }
}
```

**Field Paths:**
- Current status: `event.data.object.status`
- Previous status: `event.data.previous_attributes.status` (only present if status changed)

**Status Values:**
- `active` → Subscription is healthy
- `past_due` → Payment failed, Stripe retrying
- `unpaid` → All retries exhausted
- `canceled` → Terminal state

**Our Action:**
1. UPDATE `subscriptions` SET `status` = event.data.object.status
2. If transitioning from `canceled`/`unpaid` → `active`: re-seed entitlements for new period (reactivation)

---

#### Event: `customer.subscription.deleted`

**Payload (abbreviated):**
```json
{
  "type": "customer.subscription.deleted",
  "data": {
    "object": {
      "id": "sub_XYZ789",
      "customer": "cus_ABC123",
      "status": "canceled",
      "canceled_at": 1730390400,
      "cancellation_details": {
        "reason": "payment_failed"
      }
    }
  },
  "request": null
}
```

**Field Paths:**
- Cancellation reason: `event.data.object.cancellation_details.reason`
- Request ID: `event.request` (present if API-initiated, null if automatic)

**Cancellation Types:**
- Graceful: `event.request != null` (user/admin initiated)
- Automatic: `event.request == null` (payment failure)

**Our Action:**
1. UPDATE `subscriptions` SET `status` = 'canceled'
2. Stop entitlements after `current_period_end`
3. Queue `canceled_notice` email

---

### Idempotency Strategy

**Webhook deduplication:**
```sql
INSERT INTO webhook_events (source, event_id, event_type, status)
VALUES ('stripe', event.id, event.type, 'processing')
ON CONFLICT (event_id) DO NOTHING
RETURNING id;

-- If RETURNING id IS NULL → already processed, return 200 immediately
```

**Exponential Backoff:**
If DB write or Resend call fails:
1. Respond with `5xx` (Stripe will retry)
2. Internal retry schedule: 1m, 5m, 15m, 60m, 240m, 960m (max 6 attempts)
3. After final failure: log + DM @noahchonlee via Telegram

---

## Telegram Bot API

### Webhook Setup

**Endpoint:** `POST https://api.telegram.org/bot<TOKEN>/setWebhook`

**Request:**
```json
{
  "url": "https://api.frontier-meals.com/api/telegram/webhook",
  "secret_token": "<strong_random_string>",
  "max_connections": 50,
  "allowed_updates": ["message", "callback_query"]
}
```

**Verification (our server):**
```javascript
const receivedToken = req.headers['x-telegram-bot-api-secret-token'];
if (receivedToken !== process.env.TELEGRAM_SECRET_TOKEN) {
  return res.status(403).send('Forbidden');
}
```

---

### Onboarding Flow

**Trigger:** User clicks deep link from post-checkout email

**Deep Link Format:**
```
https://t.me/frontiermealsbot?start=<onetime_token>
```

**Incoming Update (user presses "Start"):**
```json
{
  "update_id": 123456,
  "message": {
    "message_id": 1,
    "from": {
      "id": 987654321,
      "first_name": "Jane",
      "username": "janedoe"
    },
    "chat": {"id": 987654321, "type": "private"},
    "text": "/start <onetime_token>",
    "entities": [{"offset": 0, "length": 6, "type": "bot_command"}]
  }
}
```

**Our Action:**
1. Parse token from `message.text.split(' ')[1]`
2. Verify token (lookup in handle_update_tokens or similar temp table)
3. UPDATE `customers` SET `telegram_user_id` = message.from.id
4. INSERT `telegram_link_status` (is_linked = TRUE, first_seen_at = NOW())
5. Send onboarding message with inline keyboard

---

### Onboarding Message (Diet Selection)

**sendMessage Request:**
```json
{
  "chat_id": 987654321,
  "text": "Welcome to Frontier Meals! 🍽️\n\nLet's personalize your meal plan. What's your diet?",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "🥗 Everything (default)", "callback_data": "diet:everything"}
      ],
      [
        {"text": "🐟 Pescatarian", "callback_data": "diet:pescatarian"}
      ],
      [
        {"text": "🥕 Vegetarian", "callback_data": "diet:vegetarian"}
      ],
      [
        {"text": "🌱 Vegan", "callback_data": "diet:vegan"}
      ]
    ]
  }
}
```

**Callback Query (user selects diet):**
```json
{
  "update_id": 123457,
  "callback_query": {
    "id": "query_123",
    "from": {"id": 987654321, "first_name": "Jane"},
    "message": {
      "message_id": 2,
      "chat": {"id": 987654321, "type": "private"},
      "text": "Welcome to Frontier Meals! ..."
    },
    "data": "diet:vegan"
  }
}
```

**Our Action:**
1. Parse `data` → extract `vegan`
2. UPDATE `customers` SET `dietary_flags = {"diet": "vegan"}`
3. answerCallbackQuery (acknowledge)
4. Send next question (dairy-free, gluten-free toggles)

---

### Skip Flow (/skip command)

**Incoming Update:**
```json
{
  "update_id": 123458,
  "message": {
    "message_id": 5,
    "from": {"id": 987654321},
    "chat": {"id": 987654321},
    "text": "/skip",
    "entities": [{"offset": 0, "length": 5, "type": "bot_command"}]
  }
}
```

**Our Response (calendar keyboard):**
```json
{
  "chat_id": 987654321,
  "text": "📅 Select dates to skip (you can skip weeks after the current week):",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "« Oct", "callback_data": "m:2025-10"},
        {"text": "November 2025", "callback_data": "nop"},
        {"text": "Dec »", "callback_data": "m:2025-12"}
      ],
      [
        {"text": "Mo", "callback_data": "nop"},
        {"text": "Tu", "callback_data": "nop"},
        {"text": "We", "callback_data": "nop"},
        {"text": "Th", "callback_data": "nop"},
        {"text": "Fr", "callback_data": "nop"},
        {"text": "Sa", "callback_data": "nop"},
        {"text": "Su", "callback_data": "nop"}
      ],
      [
        {"text": "1", "callback_data": "d:2025-11-01"},
        {"text": "2", "callback_data": "d:2025-11-02"},
        ...
      ],
      [
        {"text": "✅ Confirm", "callback_data": "skip:confirm"},
        {"text": "❌ Cancel", "callback_data": "skip:cancel"}
      ]
    ]
  }
}
```

**Callback Data Format:**
- Month navigation: `m:YYYY-MM`
- Date selection: `d:YYYY-MM-DD`
- Confirm: `skip:confirm`

**Validation:**
- Reject dates in current week (before next Friday 09:00 PT)
- Allow future dates within subscription period
- Set `eligible_for_reimbursement = TRUE` for dates after current week

**Confirmation Message:**
```json
{
  "chat_id": 987654321,
  "text": "✅ Skipped: Nov 15, Nov 16, Nov 17\n\nYou can /undo your last skip if needed.",
  "reply_markup": {
    "inline_keyboard": [
      [{"text": "↩️ Undo", "callback_data": "undo:last"}]
    ]
  }
}
```

---

### Billing Portal Flow (/billing command)

**Incoming Update:**
```json
{
  "update_id": 123460,
  "message": {
    "message_id": 8,
    "from": {"id": 987654321},
    "chat": {"id": 987654321},
    "text": "/billing",
    "entities": [{"offset": 0, "length": 8, "type": "bot_command"}]
  }
}
```

**Our Action:**
1. Find customer by `telegram_user_id`
2. Verify `stripe_customer_id` exists
3. Create Stripe Customer Portal session (30-minute expiry)
4. Send message with inline button containing portal URL
5. Log `billing_portal_accessed` audit event

**Our Response (message with URL button):**
```json
{
  "chat_id": 987654321,
  "text": "💳 Manage your Frontier Meals subscription:\n\n• Update payment method\n• View billing history\n• Cancel subscription\n\nClick the button below to access your billing portal (link expires in 30 minutes):",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "💳 Open Billing Portal",
          "url": "https://billing.stripe.com/p/session/test_abc123xyz"
        }
      ]
    ]
  }
}
```

**Stripe Customer Portal Session Creation:**
```javascript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: customer.stripe_customer_id,
  return_url: 'https://frontier-meals.com'
});
// portalSession.url expires in 30 minutes
```

**Notes:**
- URL buttons use `url` field instead of `callback_data`
- Portal session URL is single-use and expires in 30 minutes
- Portal allows customers to:
  - Update payment method (card, bank account)
  - View/download invoices
  - Cancel subscription
  - Update billing email
- All changes made in portal trigger webhooks (`customer.updated`, `customer.subscription.deleted`, etc.)

---

### Mini App Alternative (for complex calendars)

**Button with web_app:**
```json
{
  "text": "📅 Pick Skip Dates",
  "web_app": {
    "url": "https://app.frontier-meals.com/telegram/skip-calendar"
  }
}
```

**Mini App sends data back:**
```javascript
window.Telegram.WebApp.sendData(JSON.stringify({
  skip_dates: ["2025-11-15", "2025-11-16", "2025-11-17"]
}));
```

**Bot receives:**
```json
{
  "update_id": 123459,
  "message": {
    "from": {"id": 987654321},
    "chat": {"id": 987654321},
    "web_app_data": {
      "data": "{\"skip_dates\":[\"2025-11-15\",\"2025-11-16\",\"2025-11-17\"]}",
      "button_text": "📅 Pick Skip Dates"
    }
  }
}
```

**Validation (server-side):**
```python
import hmac, hashlib

def validate_webapp_data(init_data, bot_token):
    params = dict(param.split('=', 1) for param in init_data.split('&'))
    received_hash = params.pop('hash')

    data_check_string = '\n'.join(f"{k}={v}" for k, v in sorted(params.items()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    return computed_hash == received_hash
```

---

### Command Registration

**Via BotFather:**
```
/setcommands

start - Begin onboarding
diet - Update dietary preferences
skip - Skip meal dates
status - View upcoming meals
billing - Manage subscription & payment
help - Show commands and support
undo - Undo last skip
```

**Programmatic (setMyCommands):**
```json
{
  "commands": [
    {"command": "start", "description": "Begin onboarding"},
    {"command": "diet", "description": "Update dietary preferences"},
    {"command": "skip", "description": "Skip meal dates"},
    {"command": "status", "description": "View upcoming meals"},
    {"command": "billing", "description": "Manage subscription & payment"},
    {"command": "help", "description": "Show commands and support"},
    {"command": "undo", "description": "Undo last skip"}
  ]
}
```

---

## Resend API

### Send Email (Single)

**Endpoint:** `POST https://api.resend.com/emails`

**Headers:**
```
Authorization: Bearer <RESEND_API_KEY>
Content-Type: application/json
Idempotency-Key: qr_daily/2025-11-15/cust_abc123
```

**Request:**
```json
{
  "from": "Frontier Meals <meals@frontier-meals.com>",
  "to": ["user@example.com"],
  "subject": "Your Longevity meal QR for Friday",
  "html": "<h1>Scan this QR at the kiosk</h1><img src='cid:qr' />",
  "attachments": [
    {
      "filename": "qr.png",
      "content": "<base64_encoded_png>",
      "content_id": "qr"
    }
  ],
  "tags": [
    {"name": "category", "value": "qr_daily"},
    {"name": "service_date", "value": "2025-11-15"}
  ]
}
```

**Response:**
```json
{
  "id": "re_123ABC",
  "from": "meals@frontier-meals.com",
  "to": ["user@example.com"],
  "created_at": "2025-11-15T12:00:00.000Z"
}
```

**Idempotency:**
- Header format: `<event_type>/<entity_id>`
- Example: `qr_daily/2025-11-15/cust_abc123`
- Resend deduplicates for 24 hours

---

### Batch Send

**Endpoint:** `POST https://api.resend.com/emails/batch`

**Request:**
```json
{
  "emails": [
    {
      "from": "Frontier Meals <meals@frontier-meals.com>",
      "to": ["user1@example.com"],
      "subject": "Your payment needs attention",
      "html": "..."
    },
    {
      "from": "Frontier Meals <meals@frontier-meals.com>",
      "to": ["user2@example.com"],
      "subject": "Your payment needs attention",
      "html": "..."
    }
  ]
}
```

**Response (partial success):**
```json
{
  "data": [
    {"id": "re_123", "from": "meals@frontier-meals.com", "to": ["user1@example.com"]},
    null
  ],
  "errors": [
    null,
    {"index": 1, "message": "Invalid recipient email", "code": "validation_error"}
  ]
}
```

---

### Webhook Events (Resend → Our Server)

**Endpoint:** `POST https://api.frontier-meals.com/api/resend/webhook`

**Headers:**
```
svix-id: msg_ABC123
svix-timestamp: 1730390400
svix-signature: v1,abc123...
Content-Type: application/json
```

**Verification (Svix HMAC-SHA256):**
```javascript
const crypto = require('crypto');

const svixId = req.headers['svix-id'];
const svixTimestamp = req.headers['svix-timestamp'];
const svixSignature = req.headers['svix-signature'];

const signedContent = `${svixId}.${svixTimestamp}.${req.rawBody}`;
const secret = process.env.RESEND_WEBHOOK_SECRET;

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(signedContent)
  .digest('base64');

const signatures = svixSignature.split(',').map(s => s.split('=')[1]);

if (!signatures.includes(expectedSignature)) {
  return res.status(401).send('Invalid signature');
}
```

**Event: `email.delivered`:**
```json
{
  "type": "email.delivered",
  "created_at": "2025-11-15T12:05:00.000Z",
  "data": {
    "email_id": "re_123ABC",
    "from": "meals@frontier-meals.com",
    "to": ["user@example.com"],
    "subject": "Your Longevity meal QR for Friday"
  }
}
```

**Event: `email.bounced`:**
```json
{
  "type": "email.bounced",
  "created_at": "2025-11-15T12:05:30.000Z",
  "data": {
    "email_id": "re_123ABC",
    "bounce_type": "hard",
    "reason": "Mailbox does not exist"
  }
}
```

**Our Action:**
- Log delivery status
- If bounced (hard): flag customer for manual review

---

### Error Handling

**Rate Limit (429):**
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded"
}
```
→ Retry with exponential backoff

**Transient Error (500):**
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```
→ Retry with backoff (up to 3 attempts)

**Permanent Error (400):**
```json
{
  "statusCode": 400,
  "message": "Invalid recipient email",
  "name": "validation_error"
}
```
→ Log, alert ops, do NOT retry

---

## Internal API Routes

### POST /api/stripe/webhook

**Auth:** Stripe signature verification

**Request:** Raw JSON (Stripe event)

**Response:** `200 OK` (always, even if internal error — Stripe will retry on 5xx)

**Actions:**
- Deduplicate via `webhook_events` table
- Route event type to handler
- Write audit log
- Queue emails (dunning, etc.)

---

### POST /api/telegram/webhook

**Auth:** `X-Telegram-Bot-Api-Secret-Token` header

**Request:** Telegram `Update` object

**Response:** `200 OK`

**Actions:**
- Route update type (message, callback_query, web_app_data)
- Process commands (/start, /skip, /diet, etc.)
- Update customers, skips, telegram_link_status
- Send replies via Telegram API

---

### POST /api/kiosk/redeem

**Auth:** Device-bound kiosk assertion (short-lived JWT)

**Request:**
```json
{
  "qr_jwt": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "kiosk_id": "kiosk-sf-01"
}
```

**Response (success):**
```json
{
  "status": "success",
  "customer_name": "Jane Doe",
  "meals_redeemed": 1,
  "meals_allowed": 1
}
```

**Response (error):**
```json
{
  "status": "error",
  "code": "already_redeemed",
  "message": "This QR has already been used today"
}
```

**Actions:**
1. Verify QR JWT (ES256 signature, exp claim)
2. Extract `customer_id`, `service_date`, `jti`
3. Check `qr_tokens.used_at IS NULL`
4. Check `entitlements.meals_redeemed < meals_allowed`
5. INSERT `redemptions`, UPDATE `entitlements.meals_redeemed += 1`, UPDATE `qr_tokens.used_at = NOW()`
6. Write `audit_log`

---

### POST /api/email/send (Admin)

**Auth:** Staff session cookie

**Request:**
```json
{
  "template_slug": "dunning_soft",
  "recipient_emails": ["user1@example.com", "user2@example.com"],
  "context": {
    "customer_name": "Jane",
    "amount_due": "$49.00"
  }
}
```

**Response:**
```json
{
  "sent_count": 2,
  "failed": []
}
```

**Actions:**
1. Lookup active template by slug
2. Render HTML with context
3. Call Resend batch API
4. Log sends in audit_log

---

### POST /api/handle/consume

**Auth:** Single-use passwordless token in request body

**Request:**
```json
{
  "token": "uuid-token-here",
  "new_handle": "@newhandle"
}
```

**Response (success):**
```json
{
  "status": "success",
  "message": "Telegram handle updated"
}
```

**Response (error):**
```json
{
  "status": "error",
  "code": "token_expired",
  "message": "This link has expired. Contact @noahchonlee for help."
}
```

**Actions:**
1. Hash token, lookup in `handle_update_tokens`
2. Verify `expires_at > NOW()`, `used_at IS NULL`
3. Validate `new_handle` format (starts with @, 2-32 chars)
4. UPDATE `customers.telegram_handle`, SET `handle_update_tokens.used_at = NOW()`
5. Write `audit_log` (actor = customer, action = handle_updated)

---

## Related Documents

- `specs/01-DATA-MODEL.md` — Table schemas
- `specs/03-AUTHENTICATION.md` — JWT signing keys, session cookies
- `runbooks/WEBHOOK-BACKLOG.md` — Recovery procedures

---

**END OF API CONTRACTS SPECIFICATION**
