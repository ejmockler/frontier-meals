# Frontier Meals — Documentation Suite

**Version:** 1.1
**Last Updated:** 2026-01-30
**Scope:** Consumer-Handling Stack Only

---

## Overview

This documentation suite defines the **consumer-facing slice** of Frontier Meals: Stripe subscriptions, Telegram onboarding, daily QR issuance, kiosk redemption, and admin email tooling via Resend.

**Out of scope:** Vendor management, menu design, food ordering, logistics.

---

## Documentation Structure

```
frontier-meals-docs/
├── README.md (you are here)
├── specs/
│   ├── 00-STACK-OVERVIEW.md
│   ├── 01-DATA-MODEL.md
│   ├── 02-API-CONTRACTS.md
│   ├── 03-AUTHENTICATION.md
│   └── 04-EMAIL-TEMPLATES.md
├── guides/
│   ├── OPS-STEWARD.md
│   ├── ADMIN.md
│   └── ENGINEER.md
├── runbooks/
│   ├── QR-JOB-FAILED.md
│   └── WEBHOOK-BACKLOG.md
└── customer/
    └── COMMAND-CARD.md
```

---

## Quick Navigation by Role

### 👤 Customer (Subscriber)

**You interact via Telegram bot + daily emails:**

- **Command Reference:** [`customer/COMMAND-CARD.md`](customer/COMMAND-CARD.md)
- **Support:** Message @noahchonlee on Telegram

**What you can do:**
- `/start` — Begin onboarding
- `/diet` — Update dietary preferences
- `/skip` — Skip meal dates (for weeks after the current one)
- `/status` — View upcoming meals
- `/billing` — Manage subscription & payment
- `/undo` — Undo last skip
- `/help` — Show commands

**Daily QR:** Sent via email at **12 PM PT**, expires **11:59 PM PT** same day

---

### 🛠️ Ops Steward

**You monitor daily operations, handle alerts, resolve edge cases:**

- **Quickstart Guide:** [`guides/OPS-STEWARD.md`](guides/OPS-STEWARD.md)
- **Daily Checklist:** Morning (before 12 PM PT), Noon (12 PM PT), Afternoon (3 PM PT), Evening (11 PM PT)
- **Runbooks:**
  - [QR Job Failed](runbooks/QR-JOB-FAILED.md) — Manual QR regeneration
  - [Webhook Backlog](runbooks/WEBHOOK-BACKLOG.md) — Stripe/Telegram recovery

**Key Tools:**
- Cloudflare Pages Logs (cron jobs, webhooks)
- Stripe Dashboard (subscriptions, payments)
- Resend Dashboard (email delivery)
- Telegram Bot (ops alerts, customer support)
- Supabase (direct DB access, read-only)

---

### 📧 Admin (Staff)

**You manage email templates, customer tools, kiosk sessions:**

- **Quickstart Guide:** [`guides/ADMIN.md`](guides/ADMIN.md)
- **Email Composer:** `/admin/emails` — Create templates, send ad-hoc campaigns
- **Customer Tools:** `/admin/customers` — Look up, regenerate QR, send correction links
- **Kiosk Launcher:** `/admin/kiosk/launch` — Generate kiosk assertions with pairing codes

**Access:** Passwordless magic link (15min expiry) → 24h session cookie

---

### 💻 Engineer

**You implement features, run migrations, handle deployments, rotate keys:**

- **Quickstart Guide:** [`guides/ENGINEER.md`](guides/ENGINEER.md)
- **Data Model:** [`specs/01-DATA-MODEL.md`](specs/01-DATA-MODEL.md)
- **API Contracts:** [`specs/02-API-CONTRACTS.md`](specs/02-API-CONTRACTS.md) — Stripe, Telegram, Resend payloads
- **Authentication:** [`specs/03-AUTHENTICATION.md`](specs/03-AUTHENTICATION.md) — JWT signing, key rotation
- **Email Templates:** [`specs/04-EMAIL-TEMPLATES.md`](specs/04-EMAIL-TEMPLATES.md) — Copy, versioning

**Dev Setup:**
```bash
git clone https://github.com/frontier-meals/consumer-app.git
cd consumer-app
pnpm install
supabase start
supabase db push
pnpm dev
```

**Key Commands:**
- `supabase migration new <name>` — Create migration
- `stripe listen --forward-to localhost:5173/api/stripe/webhook` — Test webhooks
- Deploy to production via Cloudflare Pages

---

## System Architecture (High-Level)

```
┌─────────────────┐
│  Landing Page   │──────► Stripe Checkout (collect name, email, Telegram handle)
└─────────────────┘              │
                                 ▼
                    ┌────────────────────────┐
                    │ checkout.session.      │
                    │   completed webhook    │
                    └────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
    ┌───────────────────┐              ┌─────────────────┐
    │  Create customer  │              │  Telegram deep  │
    │  in Supabase DB   │              │  link via email │
    └───────────────────┘              └─────────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │ User opens Telegram    │
                                    │ bot → onboarding flow  │
                                    └────────────────────────┘
                                                 │
                        ┌────────────────────────┼────────────────────────┐
                        ▼                        ▼                        ▼
            ┌─────────────────┐      ┌──────────────────┐     ┌──────────────────┐
            │  Diet selection │      │  Allergy gate    │     │  Confirmation    │
            │  (required)     │      │  (Yes → DM Noah) │     │  + Command Card  │
            └─────────────────┘      └──────────────────┘     └──────────────────┘

─────────────────────────────────────────────────────────────────────────────────

Daily (12 PM PT):
  ┌────────────────┐
  │  Cron job:     │
  │  Issue QRs     │──────► Generate ES256 JWT (expires 11:59 PM PT)
  └────────────────┘                   │
                                       ▼
                            ┌────────────────────┐
                            │  Email via Resend  │
                            └────────────────────┘

Customer redeems:
  ┌────────────────┐
  │  Scan QR at    │──────► Verify JWT, check entitlements
  │  kiosk (PWA)   │                   │
  └────────────────┘                   ▼
                            ┌────────────────────┐
                            │  Write redemption  │
                            │  + success ripple  │
                            └────────────────────┘
```

---

## Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Calm, competent, nourishing** | Voice across all channels; never punitive |
| **One action per screen** | Emails, bot messages, kiosk states |
| **Always confirm + undo** | Bot replies, kiosk success ripple, email footers |
| **Deterministic (no LLM)** | Telegram inline keyboards or Mini App; no GPT parsing |
| **Exponential backoff** | All retries (Stripe webhooks, Resend, cron jobs) |
| **Idempotency everywhere** | Webhook event IDs, Resend message IDs, job UUIDs |
| **Ops transparency** | Final failures → private Telegram DM to @noahchonlee |

---

## Data Flow Diagram

```
[Stripe]──────►[Webhooks]──────►[Supabase]
                    │                 │
                    ▼                 ▼
              [customers]       [subscriptions]
                    │                 │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        [entitlements]              [qr_tokens]
                │                         │
                ▼                         │
        [redemptions]◄────────────────────┘

[Telegram Bot]──────►[telegram_link_status]
       │                      │
       ▼                      ▼
   [skips]               [customers]
                              │
                              ▼
                      [audit_log]
```

---

## Security Model

| Layer | Protection |
|-------|-----------|
| **Admin routes** | Passwordless magic link → session cookie (24h, HTTP-only, SameSite=strict) |
| **Kiosk route** | Device-bound assertion (ES256 JWT, 24h expiry) |
| **Customer correction** | Single-use 48h passwordless token |
| **Webhooks** | Stripe signature, Telegram secret token, Resend Svix HMAC-SHA256 |
| **QR tokens** | ES256 JWT; daily rotation; expires 11:59 PM PT |
| **CSRF** | Admin POST routes require CSRF token |
| **Rate limiting** | Webhooks, kiosk redeem, handle consume |

---

## Week Boundary & Skip Windows

**Week definition:**
Friday 09:00 PT → next Friday 08:59:59 PT

**Skip policy:**
Users can skip days only for weeks **following** the current week.

**Reimbursement eligibility:**
Skips for dates after the current week's Friday 09:00 PT boundary are flagged `eligible_for_reimbursement = TRUE`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Web app** | SvelteKit (SSR + islands), PWA for kiosk |
| **Database** | Supabase Postgres + RLS |
| **Auth** | Passwordless magic link (admin-only) |
| **Payments** | Stripe + PayPal | Dual payment provider support |
| **Email** | Resend API |
| **Messaging** | Telegram Bot API |
| **Infra** | Cloudflare Pages + Supabase (DB/cron) |
| **Observability** | Server logs only (no Sentry) |

---

## Monitoring & Alerting

**No Sentry.** Ops alerts via Telegram DM to @noahchonlee.

**Alert Triggers:**
- QR job failed (critical)
- Webhook backlog >100 events (high)
- Resend send failures (high)
- Stripe/Telegram signature verification failures (security)

**Runbooks:**
- [QR Job Failed](runbooks/QR-JOB-FAILED.md)
- [Webhook Backlog](runbooks/WEBHOOK-BACKLOG.md)

---

## Testing Strategy

| Type | Coverage |
|------|----------|
| **Unit** | Entitlement math, token issuance/validation, skip window enforcement |
| **Integration** | Stripe webhook → DB → dunning email; Telegram `/skip` → `[skips]` writes |
| **E2E** | Checkout → Telegram onboarding → daily QR email → kiosk redeem |
| **Chaos** | Exponential backoff, idempotency, dead-letter capture, ops alert path |
| **Reactivation** | Stripe reactivation → re-seed entitlements, Telegram link persists |

---

## Deployment

**Cloudflare Pages (Production):**
Deployment is automated via Git integration with Cloudflare Pages.

**Supabase (Migrations):**
```bash
supabase db push --linked
```

**Domain:**
- App: `https://app.frontier-meals.com`
- Kiosk: `https://app.frontier-meals.com/kiosk`

---

## Related External Docs

### Stripe
- [Checkout Sessions](https://stripe.com/docs/api/checkout/sessions/create)
- [Webhooks](https://stripe.com/docs/webhooks)
- [Custom Fields](https://stripe.com/docs/payments/checkout/custom-fields)

### Telegram
- [Bot API](https://core.telegram.org/bots/api)
- [Inline Keyboards](https://core.telegram.org/bots/features#inline-keyboards)
- [Mini Apps](https://core.telegram.org/bots/webapps)

### Resend
- [Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Webhooks](https://resend.com/docs/dashboard/webhooks/introduction)

---

## Support & Escalation

**Customer Support:** @noahchonlee on Telegram

**Ops Escalation:** DM @noahchonlee with:
- Issue description
- Severity (Critical / High / Medium)
- Timestamp PT
- Correlation ID (if applicable)
- Steps already taken

---

## Changelog

**v1.1 (2026-01-30):**
- Added PayPal as dual payment provider alongside Stripe
- Updated deployment platform from Vercel to Cloudflare Pages
- Corrected infrastructure references throughout documentation

**v1.0 (2025-10-26):**
- Initial documentation suite
- Consumer-handling stack only (no vendor/menu management)
- Lean spec focused on Stripe, Telegram, Resend integration
- IEEE-level interface specifications
- Role-specific quickstart guides
- Operational runbooks for critical incidents

---

## Contributing

**Process:**
1. Update relevant spec/guide/runbook in `main` branch
2. Increment version number at top of file
3. Add entry to this README changelog
4. PR → review by @noahchonlee

**Style Guide:**
- Calm, competent, nourishing voice
- Short sentences, active voice
- Code examples in fenced blocks with language tags
- Tables for structured data
- Always include "Related Documents" section

---

## License

© 2025 Frontier Meals. Internal use only.

---

**END OF README**
