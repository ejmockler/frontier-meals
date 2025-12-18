// Mock for $env/static/private in tests
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-bot-token';
export const RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-resend-key';
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'test-stripe-key';
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_test_123';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'test-webhook-secret';
export const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || 'test-telegram-secret';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
export const QR_PRIVATE_KEY = process.env.QR_PRIVATE_KEY || 'test-qr-key';
export const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
export const SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-key-min-32-chars';
