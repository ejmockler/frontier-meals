# Frontier Meals — Stack Overview (Consumer Handling)

**Version:** 1.0
**Date:** 2025-10-26
**Scope:** Consumer-facing subscription, onboarding, QR issuance, and redemption only
**Vendor/menu management:** Out of scope (handled separately)

---

## Named Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web app** | SvelteKit | SSR + islands; PWA for kiosk route |
| **Database** | Supabase Postgres | Relational store with RLS |
| **Auth** | Passwordless magic link | Admin-only; device-bound kiosk sessions |
| **Payments** | Stripe Checkout + Billing | Subscriptions with custom fields |
| **Email** | Resend API | Transactional (QR, dunning, announcements) |
| **Messaging** | Telegram Bot API | Onboarding, skips, confirmations |
| **Infra** | Vercel (app) + Supabase (DB/cron) | Hosting + scheduled jobs |
| **Observability** | Server logs only | No Sentry; ops alerts via Telegram |

---

## System Boundaries

### In Scope (Consumer Slice)
✅ Stripe checkout → subscription lifecycle
✅ Telegram onboarding (diet, allergies) + skip flows
✅ Daily QR generation (12 PM PT) and email delivery
✅ Kiosk QR redemption + entitlement tracking
✅ Admin email composer (Resend templates, versioning, preview)
✅ Dunning cadence for failed payments
✅ Passwordless handle-correction flow
✅ Ops alerts to @noahchonlee via hidden bot channel

### Out of Scope
❌ Vendor onboarding, menu design, food ordering
❌ Inventory, logistics, delivery scheduling
❌ Analytics dashboards, revenue reporting
❌ i18n (English-only deployment)
❌ OAuth/SSO (passwordless magic link for staff only)

---

## Core Flows

### 1. Subscription Creation
```
Landing page → Stripe Checkout (collect name, email, Telegram handle)
  → checkout.session.completed webhook
  → Create customer record + Telegram deep link
  → User opens Telegram bot → onboarding flow
```

### 2. Telegram Onboarding
```
Bot /start (via deep link with one-time token)
  → Diet choice (Everything/Pescatarian/Vegetarian/Vegan) + toggles (dairy-free, gluten-free)
  → Allergy gate (Yes → DM @noahchonlee, No → continue)
  → Confirmation + pinned Command Card
```

### 3. Daily QR Issuance
```
Cron: Daily 12:00 PM PT
  → Upsert today's entitlements
  → Generate ES256 JWT (expires 11:59 PM PT)
  → Send via Resend email
```

### 4. Kiosk Redemption
```
Customer scans QR at kiosk (PWA)
  → Verify JWT signature + expiry
  → Check entitlements.meals_redeemed < meals_allowed
  → Write redemption record
  → Visual + audio success feedback
```

### 5. Skip Flow (Telegram)
```
/skip → Inline keyboard calendar OR Mini App
  → Select dates (validation: only weeks after current Friday 09:00 PT boundary)
  → Confirm → Write [skips] with eligible_for_reimbursement flag
  → Confirmation message with /undo affordance
```

### 6. Dunning (Failed Payments)
```
invoice.payment_failed (attempt_count=1)
  → Queue dunning_soft email (T+0)
  → Stripe auto-retry (T+24-48h) → dunning_retry email
  → Final retry (T+72-96h) → dunning_final email
  → Subscription canceled → canceled_notice email
```

### 7. Handle Correction (Delayed Fail-Safe)
```
60 minutes after subscription activation, if telegram_link_status.is_linked = false
  → Send confirmation email with recorded handle
  → Passwordless 48h correction link
  → User clicks → protected form → update handle → audit log
```

---

## Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Calm, competent, nourishing** | Voice across all channels; never punitive |
| **One action per screen** | Emails, bot messages, kiosk states |
| **Always confirm + undo** | Bot replies, kiosk success ripple, email footers |
| **AA contrast minimum** | Kiosk + web UI; 44×44px touch targets |
| **Vital Forms aesthetic** | Kiosk: organic motion, discreet sound, breathing reticle |
| **Deterministic (no LLM)** | Telegram inline keyboards or Mini App; no GPT parsing |
| **Exponential backoff** | All retries (Stripe webhooks, Resend, cron jobs) |
| **Idempotency everywhere** | Webhook event IDs, Resend message IDs, job UUIDs |
| **Ops transparency** | Final failures → private Telegram DM to @noahchonlee |

---

## Security Model

| Layer | Protection |
|-------|-----------|
| **Admin routes** | Passwordless magic link → signed session cookie (24h, HTTP-only, SameSite=strict) |
| **Kiosk route** | Device-bound assertion (short-lived JWT in query, persisted locally) |
| **Customer correction** | Single-use 48h passwordless token; form validates + audits |
| **Webhooks** | Stripe signature verification; Telegram secret token; Resend Svix HMAC-SHA256 |
| **QR tokens** | ES256 JWT; daily rotation; expires 11:59 PM PT |
| **CSRF** | Admin POST routes require CSRF token bound to session |
| **Rate limiting** | Webhooks, /api/kiosk/redeem, /api/handle/consume |
| **RLS** | Supabase row-level security: customers read own; service role writes |

---

## Data Retention & Privacy

- **Audit logs:** 90 days (security events, handle updates, redemptions)
- **Email previews:** 30 days
- **Webhook events:** 30 days (idempotency deduplication)
- **QR tokens:** 24 hours (daily rotation)
- **Failed job logs:** 7 days
- **PII scrubbing:** Server logs strip email/Telegram handles
- **Unsubscribe:** Footer in all emails → "Message @noahchonlee on Telegram"

---

## Monitoring & Alerting (No Sentry)

| Signal | Destination |
|--------|-------------|
| **Structured logs** | Vercel logs (minimal PII) |
| **Critical failures** | Private Telegram DM to @noahchonlee |
| **Alerts** | QR job failed, webhook backlog, Resend outage, Telegram downtime |
| **Runbook triggers** | Exponential backoff exhausted (6 retries) → ops alert |

---

## Week Boundary & Skip Windows

**Week definition:**
Friday 09:00 PT → next Friday 08:59:59 PT

**Skip policy:**
Users can skip days only for weeks **following** the current week.

**Reimbursement eligibility:**
Skips for dates after the current week's Friday 09:00 PT boundary are flagged `eligible_for_reimbursement = true` in `[skips]` table. These contribute to the next sub-interval accounting for Stripe subscription credits (logic out of scope).

---

## Testing Strategy (Expanded)

| Type | Coverage |
|------|----------|
| **Unit** | Entitlement math, token issuance/validation, skip window enforcement (Friday 09:00 PT), handle-token expiry |
| **Integration** | Stripe webhook → DB state → dunning email; Telegram `/skip` → `[skips]` writes; `/diet` form → `customers` updates; handle correction end-to-end |
| **E2E** | Checkout → Telegram onboarding → daily QR email (12 PM PT) → kiosk redeem (by 11:59 PM PT); offline kiosk, network failures, clock skew |
| **Chaos** | Exponential backoff, idempotency on repeated webhooks, dead-letter capture, ops alert path to @noahchonlee fires on final failure |
| **Reactivation** | Simulate Stripe reactivation; verify entitlements re-seed only for new period; Telegram link persists |

---

## Related Documents

- `specs/01-DATA-MODEL.md` — Schema, RLS policies, migrations
- `specs/02-API-CONTRACTS.md` — Stripe, Telegram, Resend interface specs
- `specs/03-AUTHENTICATION.md` — Magic link flow, kiosk assertions, CSRF
- `specs/04-EMAIL-TEMPLATES.md` — Dunning cadence, QR email, handle confirmation
- `guides/OPS-STEWARD.md` — Daily checklist, alert interpretation
- `guides/ADMIN.md` — Email composer, kiosk session launcher
- `guides/ENGINEER.md` — Migrations, cron jobs, key rotation
- `runbooks/QR-JOB-FAILED.md` — Manual QR regeneration steps
- `runbooks/WEBHOOK-BACKLOG.md` — Stripe/Telegram webhook recovery
- `customer/COMMAND-CARD.md` — Pinned Telegram message (user-facing)
- `customer/COPY-LIBRARY.md` — Success/warn/error variants

---

**END OF STACK OVERVIEW**
