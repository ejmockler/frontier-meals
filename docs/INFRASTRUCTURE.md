# Frontier Meals Infrastructure

## Overview

Frontier Meals runs on a serverless stack optimized for scalability and cost efficiency:

- **Frontend/API**: Cloudflare Pages (SvelteKit with `@sveltejs/adapter-cloudflare`)
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe
- **Email**: Resend
- **Messaging**: Telegram Bot API
- **Cron Jobs**: GitHub Actions

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

Cron jobs are triggered via **GitHub Actions** since Cloudflare Pages doesn't support native cron triggers.

### Setup

1. Add secrets to your GitHub repository settings:
   - `CRON_SECRET`: Same value as Cloudflare secret
   - `PRODUCTION_URL`: `https://frontiermeals.com`

2. Push the workflow files to enable scheduled runs

### Schedules

| Job | Schedule | Workflow File |
|-----|----------|---------------|
| Issue QR Codes | Daily at 12pm PT | `cron-jobs.yml` |
| Check Telegram Links | Daily (after QR) | `cron-jobs.yml` |
| Retry Failed Emails | Every 6 hours | `cron-retry-emails.yml` |
| Cleanup Rate Limits | Weekly (Sunday 3am UTC) | `cron-cleanup.yml` |
| Cleanup Expired Tokens | Weekly (Sunday 2am UTC) | `cron-cleanup.yml` |

### Manual Trigger

Run jobs manually from GitHub Actions UI or via CLI:

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

### Cron jobs not running
- Verify `CRON_SECRET` matches in both GitHub and Cloudflare
- Check GitHub Actions workflow runs for errors
- Ensure workflows are on the default branch

### Environment variables undefined
- Static imports (`$env/static/private`) don't work in Cloudflare
- Use `getEnv(event)` from `$lib/server/env` instead
