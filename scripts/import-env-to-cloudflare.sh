#!/bin/bash
# Import secrets from .env to Cloudflare Pages
# Usage: ./scripts/import-env-to-cloudflare.sh

set -e

PROJECT_NAME="frontier-meals"

# Secrets to import (private keys, tokens, etc.)
SECRETS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "STRIPE_PRICE_ID"
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_SECRET_TOKEN"
  "RESEND_API_KEY"
  "RESEND_WEBHOOK_SECRET"
  "SESSION_SECRET"
  "CSRF_SECRET"
  "CRON_SECRET"
  "QR_PRIVATE_KEY"
  "QR_PUBLIC_KEY"
  "KIOSK_PRIVATE_KEY"
  "KIOSK_PUBLIC_KEY"
  "SITE_URL"
)

# Load .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs -0)
fi

echo "Importing secrets to Cloudflare Pages project: $PROJECT_NAME"
echo "============================================================"

for secret in "${SECRETS[@]}"; do
  value="${!secret}"
  if [ -n "$value" ]; then
    echo "Setting $secret..."
    echo "$value" | npx wrangler pages secret put "$secret" --project-name "$PROJECT_NAME" 2>/dev/null
    echo "✓ $secret set"
  else
    echo "⚠ $secret not found in .env, skipping"
  fi
done

echo ""
echo "Done! Secrets imported to Cloudflare Pages."
echo "Redeploy to apply: npx wrangler pages deploy .svelte-kit/cloudflare --project-name $PROJECT_NAME"
