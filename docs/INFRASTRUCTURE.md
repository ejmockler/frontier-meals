# Frontier Meals Infrastructure

## Overview

Frontier Meals runs on a serverless stack optimized for scalability and cost efficiency:

- **Frontend/API**: Cloudflare Pages (SvelteKit with `@sveltejs/adapter-cloudflare`)
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe
- **Email**: Resend
- **Messaging**: Telegram Bot API
- **Cron Jobs**: Cloudflare Workers (primary) + GitHub Actions (fallback/other jobs)

## Deployment

### Cloudflare Pages

The app is deployed to Cloudflare Pages at `frontier-meals.pages.dev` (production: `frontiermeals.com`).

```bash
# Build
pnpm run build

# Deploy
npx wrangler pages deploy .svelte-kit/cloudflare --project-name frontier-meals
```

### Environment Variables

**Build-time variables** are set in `wrangler.toml`:
- `PUBLIC_SITE_URL`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Runtime secrets** are set via Wrangler CLI:

```bash
# Set individual secrets
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name frontier-meals

# Or use the bulk import script
./scripts/import-env-to-cloudflare.sh
```

Required secrets:
| Secret | Description |
|--------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature |
| `STRIPE_PRICE_ID` | Subscription price ID |
| `TELEGRAM_BOT_TOKEN` | Telegram bot credentials |
| `TELEGRAM_SECRET_TOKEN` | Webhook verification |
| `RESEND_API_KEY` | Email sending |
| `RESEND_WEBHOOK_SECRET` | Email event webhooks |
| `SESSION_SECRET` | Admin session signing |
| `CSRF_SECRET` | CSRF token generation |
| `CRON_SECRET` | Cron job authentication |
| `QR_PRIVATE_KEY_BASE64` | QR code signing (base64) |
| `QR_PUBLIC_KEY` | QR code verification |
| `KIOSK_PRIVATE_KEY_BASE64` | Kiosk auth signing (base64) |
| `KIOSK_PUBLIC_KEY` | Kiosk auth verification |
| `SITE_URL` | Production URL for emails |

### Cloudflare Workers Runtime

Cloudflare Pages/Workers don't support static env imports at runtime. All secrets must be accessed via `event.platform.env`:

```typescript
// src/lib/server/env.ts provides the abstraction
import { getEnv, getSupabaseAdmin } from '$lib/server/env';

export const POST: RequestHandler = async (event) => {
  const env = await getEnv(event);
  const supabase = await getSupabaseAdmin(event);
  // Use env.STRIPE_SECRET_KEY, etc.
};
```

## Cron Jobs

### Architecture

**Critical jobs** (daily QR issuance) are triggered by a dedicated **Cloudflare Worker** with cron triggers. This eliminates dependency on GitHub Actions runner availability.

**Non-critical jobs** (cleanup, retry) remain on GitHub Actions since they can tolerate occasional delays.

### Daily QR Issuance (Cloudflare Worker)

The `frontier-meals-cron` Worker triggers QR code generation at 12:00 PM PT (19:00 UTC).

**Worker location**: `workers/cron-trigger/`

**Deployment**:
```bash
cd workers/cron-trigger
wrangler deploy
```

**Set secrets** (one-time, after first deployment):
```bash
wrangler secret put CRON_SECRET        # Must match Pages Function
wrangler secret put TELEGRAM_BOT_TOKEN # For failure alerts
```

**Manual trigger** (via Worker HTTP endpoint):
```bash
curl -X POST https://frontier-meals-cron.<account>.workers.dev \
  -H "Cron-Secret: $CRON_SECRET"
```

**Logs**:
```bash
cd workers/cron-trigger
wrangler tail
```

### Other Jobs (GitHub Actions)

Non-critical jobs remain on GitHub Actions:

| Job | Schedule | Workflow File |
|-----|----------|---------------|
| Check Telegram Links | Daily (after QR) | `cron-jobs.yml` |
| Retry Failed Emails | Every 6 hours | `cron-retry-emails.yml` |
| Cleanup Rate Limits | Weekly (Sunday 3am UTC) | `cron-cleanup.yml` |
| Cleanup Expired Tokens | Weekly (Sunday 2am UTC) | `cron-cleanup.yml` |
| Cleanup Discount Reservations | Every 5 min | `cron-discount-cleanup.yml` |

### Manual Triggers (GitHub Actions)

Run jobs manually from GitHub Actions UI or CLI:

```bash
gh workflow run "Scheduled Jobs" -f job=issue-qr
gh workflow run "Scheduled Jobs" -f job=all
```

### Endpoints

All cron endpoints require the `Cron-Secret` header:

```bash
curl -X POST https://frontiermeals.com/api/cron/issue-qr \
  -H "Cron-Secret: $CRON_SECRET"
```

| Endpoint | Purpose |
|----------|---------|
| `/api/cron/issue-qr` | Generate daily QR codes for active subscribers |
| `/api/cron/check-telegram-links` | Send reminders for unlinked Telegram accounts |
| `/api/cron/retry-emails` | Retry failed email deliveries |
| `/api/cron/cleanup-rate-limits` | Clean expired rate limit entries |
| `/api/cron/cleanup-expired-tokens` | Clean expired and unused Telegram deep link tokens |

## Webhooks

### Telegram

```
URL: https://frontiermeals.com/api/telegram/webhook
Secret Token: Set in both Telegram API and TELEGRAM_SECRET_TOKEN
```

Update webhook:
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://frontiermeals.com/api/telegram/webhook",
    "secret_token": "'$TELEGRAM_SECRET_TOKEN'",
    "allowed_updates": ["message", "callback_query"]
  }'
```

### Stripe

Configure in Stripe Dashboard:
```
URL: https://frontiermeals.com/api/stripe/webhook
Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
        customer.subscription.updated, customer.subscription.deleted
```

### Resend

Configure in Resend Dashboard:
```
URL: https://frontiermeals.com/api/resend/webhook
Events: email.delivered, email.bounced, email.complained
```

## Monitoring

### Cloudflare
- Real-time logs: `npx wrangler pages deployment tail --project-name frontier-meals`
- Dashboard: https://dash.cloudflare.com

### Supabase
- Database logs: Supabase Dashboard > Logs
- Query performance: Supabase Dashboard > Database > Query Performance

### GitHub Actions
- Cron job history: Repository > Actions tab
- Failed job notifications: Set up in repository settings

## Local Development

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Fill in values from team password manager

# Run development server
pnpm dev

# Run tests
pnpm test
```

## Troubleshooting

### "Invalid signature" on webhooks
- Verify the webhook secret matches between provider and Cloudflare secret
- Check that the raw body is being used for signature verification

### Supabase connection errors (1016)
- Supabase project may be paused (free tier pauses after inactivity)
- Resume at: https://supabase.com/dashboard/project/[project-id]

### QR cron job not running
- Check Cloudflare Worker logs: `cd workers/cron-trigger && wrangler tail`
- Verify Worker is deployed: `wrangler deployments list`
- Verify `CRON_SECRET` matches between Worker and Pages Function
- Fallback: trigger manually via `gh workflow run "Scheduled Jobs" -f job=issue-qr`

### Other cron jobs not running
- Check GitHub Actions workflow runs for errors
- Verify `CRON_SECRET` matches in both GitHub and Cloudflare
- Ensure workflows are on the default branch

### Environment variables undefined
- Static imports (`$env/static/private`) don't work in Cloudflare
- Use `getEnv(event)` from `$lib/server/env` instead
