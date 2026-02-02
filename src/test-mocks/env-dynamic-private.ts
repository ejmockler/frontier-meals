// Mock for $env/dynamic/private in tests
export const env = {
	TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
	RESEND_API_KEY: process.env.RESEND_API_KEY,
	STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
	STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
	STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
	TELEGRAM_SECRET_TOKEN: process.env.TELEGRAM_SECRET_TOKEN,
	SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
	QR_PRIVATE_KEY: process.env.QR_PRIVATE_KEY,
	CRON_SECRET: process.env.CRON_SECRET,
	// PayPal test credentials - use sandbox mode for tests
	PAYPAL_MODE: 'sandbox',
	PAYPAL_CLIENT_ID_SANDBOX: process.env.PAYPAL_CLIENT_ID_SANDBOX || 'test-paypal-client-id-sandbox',
	PAYPAL_CLIENT_SECRET_SANDBOX: process.env.PAYPAL_CLIENT_SECRET_SANDBOX || 'test-paypal-client-secret-sandbox',
	PAYPAL_CLIENT_ID_LIVE: process.env.PAYPAL_CLIENT_ID_LIVE,
	PAYPAL_CLIENT_SECRET_LIVE: process.env.PAYPAL_CLIENT_SECRET_LIVE,
	PAYPAL_WEBHOOK_ID_SANDBOX: process.env.PAYPAL_WEBHOOK_ID_SANDBOX || 'test-webhook-id-sandbox',
	PAYPAL_WEBHOOK_ID_LIVE: process.env.PAYPAL_WEBHOOK_ID_LIVE
};
