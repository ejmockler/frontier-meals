# Frontier Meals — Email Templates & Copy Specification

**Version:** 1.0
**Date:** 2025-10-26

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Calm, competent, nourishing** | Never punitive; "we noticed" → "you can fix this here" |
| **One action per email** | Single primary CTA button; secondary help line |
| **Visible validity/expiry** | Always state link expiry ("valid for 48 hours") |
| **Human escape hatch** | Every email: "If you need help, message @noahchonlee on Telegram" |
| **AA contrast minimum** | Button ≥ 4.5:1, body text ≥ 4.5:1 |
| **Mobile-first** | Single-column, 44px touch targets, readable at arm's length |

---

## Template Slugs

| Slug | Trigger | Timing | CTA |
|------|---------|--------|-----|
| `qr_daily` | Cron (12 PM PT) | Daily | [Scan QR attached] |
| `dunning_soft` | `invoice.payment_failed` (attempt 1) | T+0 | Update payment method |
| `dunning_retry` | `invoice.payment_failed` (attempt 2) | T+24-48h | Update payment method |
| `dunning_final` | `invoice.payment_failed` (attempt 3+) | T+72-96h | Update payment method or contact support |
| `canceled_notice` | `customer.subscription.deleted` | On event | Re-subscribe link |
| `handle_confirm` | 60min after subscription, if `telegram_link_status.is_linked = false` | Hourly job | Correction link (48h validity) |
| `admin_magic_link` | Staff login | On request | Login link (15min validity) |

---

## Template Structure (All Emails)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafaf9; color: #171717;">

  <!-- Header: Simple wordmark -->
  <div style="text-align: center; padding: 20px 0;">
    <h1 style="font-size: 20px; font-weight: 600; margin: 0; color: #171717;">Frontier Meals</h1>
  </div>

  <!-- Body: One-paragraph lead + CTA -->
  <div style="background: #ffffff; border-radius: 8px; padding: 32px; margin: 20px 0;">
    {{body}}
  </div>

  <!-- Footer: Help line -->
  <div style="text-align: center; padding: 20px 0; font-size: 14px; color: #737373;">
    <p>Need help? Message <a href="https://t.me/noahchonlee" style="color: #171717;">@noahchonlee</a> on Telegram</p>
    <p style="margin-top: 12px;">
      <a href="mailto:meals@frontier-meals.com" style="color: #737373; text-decoration: none;">meals@frontier-meals.com</a>
    </p>
  </div>

</body>
</html>
```

---

## 1. QR Daily Email

**Slug:** `qr_daily`

**Subject:**
```
Your Longevity meal QR for {{weekday}}
```
Example: `Your Longevity meal QR for Friday`

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  Your QR code for <strong>{{service_date}}</strong> is ready. Scan it at the kiosk before <strong>11:59 PM PT</strong> to get your meal.
</p>

<div style="text-align: center; margin: 32px 0;">
  <img src="cid:qr" alt="QR Code" style="width: 256px; height: 256px; border: 2px solid #e5e5e5; border-radius: 8px;" />
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 24px 0 0; color: #737373;">
  This code expires at 11:59 PM PT today. You'll receive a fresh code tomorrow at noon.
</p>
```

**Attachments:**
- QR code PNG (256x256px, embedded as `cid:qr`)

**Variables:**
- `{{customer_name}}` — First name
- `{{weekday}}` — Friday, Monday, etc.
- `{{service_date}}` — November 15, 2025

---

## 2. Dunning Soft (First Failure)

**Slug:** `dunning_soft`

**Subject:**
```
Your Frontier Meals payment needs attention
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  We noticed your payment of <strong>{{amount_due}}</strong> didn't go through. This can happen for many reasons — an expired card, insufficient funds, or a bank security check.
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 32px; color: #404040;">
  Update your payment method now to keep your meals coming.
</p>

<div style="text-align: center;">
  <a href="{{update_payment_url}}" style="display: inline-block; background: #171717; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Update Payment Method
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If this was a mistake or you need help, message @noahchonlee on Telegram.
</p>
```

**Variables:**
- `{{customer_name}}`
- `{{amount_due}}` — $49.00
- `{{update_payment_url}}` — Stripe customer portal link

---

## 3. Dunning Retry (Second Attempt)

**Slug:** `dunning_retry`

**Subject:**
```
Reminder: Update your Frontier Meals payment
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  We tried processing your payment again, but it still didn't go through.
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 32px; color: #404040;">
  Your meal service will pause if we can't collect payment. Please update your card details now.
</p>

<div style="text-align: center;">
  <a href="{{update_payment_url}}" style="display: inline-block; background: #171717; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Update Payment Method
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If you have questions, message @noahchonlee on Telegram.
</p>
```

**Variables:**
- `{{customer_name}}`
- `{{update_payment_url}}`

---

## 4. Dunning Final (Last Warning)

**Slug:** `dunning_final`

**Subject:**
```
Final notice: Your Frontier Meals subscription
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  We've made several attempts to process your payment, but they haven't succeeded.
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  <strong>Your subscription will be canceled in 48 hours</strong> unless you update your payment method.
</p>

<div style="text-align: center;">
  <a href="{{update_payment_url}}" style="display: inline-block; background: #dc2626; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Update Payment Method Now
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If you need assistance or want to discuss your account, message @noahchonlee on Telegram.
</p>
```

**Variables:**
- `{{customer_name}}`
- `{{update_payment_url}}`

---

## 5. Canceled Notice

**Slug:** `canceled_notice`

**Subject:**
```
Your Frontier Meals subscription has been canceled
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  Your Frontier Meals subscription has been canceled. You'll continue to have access through <strong>{{period_end_date}}</strong>.
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 32px; color: #404040;">
  If this was a mistake, or if you'd like to restart your subscription, you can re-subscribe anytime.
</p>

<div style="text-align: center;">
  <a href="{{resubscribe_url}}" style="display: inline-block; background: #171717; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Re-Subscribe
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If you have questions, message @noahchonlee on Telegram.
</p>
```

**Variables:**
- `{{customer_name}}`
- `{{period_end_date}}` — December 15, 2025
- `{{resubscribe_url}}` — Checkout session link

---

## 6. Handle Confirmation (60-Min Check)

**Slug:** `handle_confirm`

**Subject:**
```
Confirm your Telegram handle for Frontier Meals
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi {{customer_name}},
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  We haven't seen you start the Telegram bot yet. We recorded your handle as <strong>{{telegram_handle}}</strong>.
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #404040;">
  If that's not correct, you can update it using the link below. This link is valid for <strong>48 hours</strong>.
</p>

<div style="text-align: center; margin: 32px 0;">
  <a href="{{correction_link}}" style="display: inline-block; background: #171717; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Update Telegram Handle
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If you have trouble setting it up, message @noahchonlee on Telegram.
</p>
```

**Variables:**
- `{{customer_name}}`
- `{{telegram_handle}}` — @janedoe
- `{{correction_link}}` — https://app.frontier-meals.com/handle/update/:token

---

## 7. Admin Magic Link

**Slug:** `admin_magic_link`

**Subject:**
```
Your Frontier Meals admin login link
```

**Body:**
```html
<p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px;">
  Hi there,
</p>

<p style="font-size: 16px; line-height: 1.6; margin: 0 0 32px; color: #404040;">
  Click the button below to log in to the Frontier Meals admin panel. This link expires in <strong>15 minutes</strong>.
</p>

<div style="text-align: center;">
  <a href="{{magic_link}}" style="display: inline-block; background: #171717; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">
    Log In
  </a>
</div>

<p style="font-size: 14px; line-height: 1.6; margin: 32px 0 0; color: #737373;">
  If you didn't request this, ignore this email.
</p>
```

**Variables:**
- `{{magic_link}}` — https://app.frontier-meals.com/auth/verify?token=...

---

## Copy Library (Telegram Bot)

### Success Messages

```
✅ Diet updated to Vegan + Dairy-free
✅ Skipped: Nov 15, Nov 16, Nov 17. You can /undo if needed.
✅ Your last skip has been undone.
✅ Telegram handle updated successfully.
```

### Error Messages

```
❌ That date is in the current week and can't be skipped. You can skip weeks starting Friday.
❌ Your subscription is not active. Message @noahchonlee if you need help.
❌ Invalid Telegram handle format. Please use @username (2-32 characters).
```

### Confirmation Prompts

```
You selected: Vegan + Dairy-free + Gluten-free
Tap Confirm to save, or Cancel to start over.

[Confirm] [Cancel]
```

### Onboarding Welcome

```
Welcome to Frontier Meals! 🍽️

Let's personalize your meal plan. What's your diet?

[🥗 Everything (default)]
[🐟 Pescatarian]
[🥕 Vegetarian]
[🌱 Vegan]
```

### Allergy Gate

```
Do you have any food allergies we should know about?

[Yes] [No]
```

**If Yes:**
```
Thanks for letting us know. Please DM @noahchonlee on Telegram with your allergy details so we can keep you safe.

Meanwhile, we'll complete your setup. Tap Continue when you've messaged Noah.

[Continue]
```

---

## Versioning Workflow

### 1. Create New Template Version

**Admin UI:**
1. Navigate to `/admin/emails`
2. Select template slug (e.g., `dunning_soft`)
3. Click "Edit" → copy current version
4. Make changes to subject/body
5. Click "Preview" → sends test email to admin's address
6. Click "Publish" → increments version, sets `is_active = TRUE`, deactivates old version

**Database:**
```sql
-- Old version (v1)
UPDATE email_templates SET is_active = FALSE WHERE slug = 'dunning_soft' AND version = 1;

-- New version (v2)
INSERT INTO email_templates (slug, version, subject, body, is_active, created_by)
VALUES ('dunning_soft', 2, 'New subject', 'New body', TRUE, staff_id);
```

### 2. Preview Template

**API Route:** `POST /api/email/preview`

**Request:**
```json
{
  "template_id": "uuid-of-template",
  "preview_to": "admin@frontier-meals.com",
  "context": {
    "customer_name": "Test User",
    "amount_due": "$49.00",
    "update_payment_url": "https://billing.stripe.com/..."
  }
}
```

**Action:**
1. Render template with context
2. Send via Resend
3. Store in `email_template_previews` for audit

---

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Ink (near-black)** | #171717 | Headlines, buttons, primary text |
| **Charcoal** | #404040 | Body copy |
| **Slate** | #737373 | Help text, footer |
| **Surface (off-white)** | #fafaf9 | Page background |
| **Card (white)** | #ffffff | Email body background |
| **Border** | #e5e5e5 | QR code border, dividers |
| **Success (leaf)** | #16a34a | Success messages (Telegram) |
| **Warn (amber)** | #f59e0b | Warnings (kiosk) |
| **Error (crimson)** | #dc2626 | Errors, final dunning CTA |

---

## Related Documents

- `specs/02-API-CONTRACTS.md` — Resend API integration
- `customer/COMMAND-CARD.md` — Telegram bot commands
- `customer/COPY-LIBRARY.md` — Full bot copy variants

---

**END OF EMAIL TEMPLATES & COPY SPECIFICATION**
