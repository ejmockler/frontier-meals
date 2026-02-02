/**
 * Server-side environment access for Cloudflare Workers compatibility
 *
 * In Cloudflare Pages/Workers, secrets must be accessed via platform.env
 * rather than static imports which are baked in at build time.
 *
 * This module provides a unified interface that works both locally
 * (using $env/static/private) and in Cloudflare (using platform.env).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { RequestEvent } from '@sveltejs/kit';

// Type for the secrets we need
export interface ServerEnv {
	SUPABASE_SERVICE_ROLE_KEY: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	STRIPE_PRICE_ID: string;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_SECRET_TOKEN: string;
	RESEND_API_KEY: string;
	RESEND_WEBHOOK_SECRET: string;
	SESSION_SECRET: string;
	CSRF_SECRET: string;
	CRON_SECRET: string;
	QR_PRIVATE_KEY_BASE64: string;
	QR_PUBLIC_KEY: string;
	KIOSK_PRIVATE_KEY_BASE64: string;
	KIOSK_PUBLIC_KEY: string;
	SITE_URL: string;
	DEMO_MODE?: string;
	// Dual-mode Stripe Config
	STRIPE_MODE?: 'live' | 'test';
	STRIPE_SECRET_KEY_LIVE?: string;
	STRIPE_SECRET_KEY_TEST?: string;
	STRIPE_WEBHOOK_SECRET_LIVE?: string;
	STRIPE_WEBHOOK_SECRET_TEST?: string;
	STRIPE_PRICE_ID_LIVE?: string;
	STRIPE_PRICE_ID_TEST?: string;
	// PayPal Config (resolved values)
	PAYPAL_CLIENT_ID?: string;
	PAYPAL_CLIENT_SECRET?: string;
	PAYPAL_WEBHOOK_ID?: string;
	PAYPAL_PLAN_ID?: string;
	PAYPAL_MODE?: 'sandbox' | 'live';
	// Dual-mode PayPal Config
	PAYPAL_CLIENT_ID_LIVE?: string;
	PAYPAL_CLIENT_ID_SANDBOX?: string;
	PAYPAL_CLIENT_SECRET_LIVE?: string;
	PAYPAL_CLIENT_SECRET_SANDBOX?: string;
	PAYPAL_WEBHOOK_ID_LIVE?: string;
	PAYPAL_WEBHOOK_ID_SANDBOX?: string;
	PAYPAL_PLAN_ID_LIVE?: string;
	PAYPAL_PLAN_ID_SANDBOX?: string;
}

// Cache for local dev env
let localEnvCache: ServerEnv | null = null;

/**
 * Get server environment variables from the request context
 * Uses Cloudflare platform.env in production, falls back to static imports locally
 */
export async function getEnv(event: RequestEvent): Promise<ServerEnv> {
	// In Cloudflare Workers, secrets are in platform.env
	if (event.platform?.env) {
		const env = event.platform.env as ServerEnv;

		// Apply Stripe Mode Logic for Cloudflare (trim to handle potential whitespace)
		const stripeMode = env.STRIPE_MODE?.trim().toLowerCase();
		const isStripeTest = stripeMode === 'test';

		// Apply PayPal Mode Logic for Cloudflare
		const paypalMode = env.PAYPAL_MODE?.trim().toLowerCase();
		const isPayPalSandbox = paypalMode === 'sandbox';

		console.log(`[Env] Stripe Mode: ${stripeMode}, isTest: ${isStripeTest}`);
		console.log(`[Env] PayPal Mode: ${paypalMode}, isSandbox: ${isPayPalSandbox}`);

		const pickStripe = (base: string, test?: string, live?: string) => {
			if (isStripeTest) return test || base;
			return live || base;
		};

		const pickPayPal = (credName: string, sandbox?: string, live?: string) => {
			if (isPayPalSandbox) {
				if (!sandbox || sandbox.trim() === '') {
					throw new Error(`[PayPal] Missing ${credName}_SANDBOX credential for sandbox mode. Do not fall back to live credentials.`);
				}
				return sandbox;
			}
			if (!live || live.trim() === '') {
				throw new Error(`[PayPal] Missing ${credName}_LIVE credential for live mode. Do not fall back to sandbox credentials.`);
			}
			return live;
		};

		return {
			...env,
			// Stripe resolved values
			STRIPE_SECRET_KEY: pickStripe(env.STRIPE_SECRET_KEY, env.STRIPE_SECRET_KEY_TEST, env.STRIPE_SECRET_KEY_LIVE),
			STRIPE_WEBHOOK_SECRET: pickStripe(
				env.STRIPE_WEBHOOK_SECRET,
				env.STRIPE_WEBHOOK_SECRET_TEST,
				env.STRIPE_WEBHOOK_SECRET_LIVE
			),
			STRIPE_PRICE_ID: pickStripe(env.STRIPE_PRICE_ID, env.STRIPE_PRICE_ID_TEST, env.STRIPE_PRICE_ID_LIVE),
			// PayPal resolved values
			PAYPAL_CLIENT_ID: pickPayPal('PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID_SANDBOX, env.PAYPAL_CLIENT_ID_LIVE),
			PAYPAL_CLIENT_SECRET: pickPayPal('PAYPAL_CLIENT_SECRET', env.PAYPAL_CLIENT_SECRET_SANDBOX, env.PAYPAL_CLIENT_SECRET_LIVE),
			PAYPAL_WEBHOOK_ID: pickPayPal('PAYPAL_WEBHOOK_ID', env.PAYPAL_WEBHOOK_ID_SANDBOX, env.PAYPAL_WEBHOOK_ID_LIVE),
			PAYPAL_PLAN_ID: pickPayPal('PAYPAL_PLAN_ID', env.PAYPAL_PLAN_ID_SANDBOX, env.PAYPAL_PLAN_ID_LIVE)
		};
	}

	// Fallback for local development - use dynamic import
	if (!localEnvCache) {
		const privateEnv = await import('$env/static/private');
		localEnvCache = {
			SUPABASE_SERVICE_ROLE_KEY: privateEnv.SUPABASE_SERVICE_ROLE_KEY,
			STRIPE_SECRET_KEY: privateEnv.STRIPE_SECRET_KEY,
			STRIPE_WEBHOOK_SECRET: privateEnv.STRIPE_WEBHOOK_SECRET,
			STRIPE_PRICE_ID: privateEnv.STRIPE_PRICE_ID,
			TELEGRAM_BOT_TOKEN: privateEnv.TELEGRAM_BOT_TOKEN,
			TELEGRAM_SECRET_TOKEN: privateEnv.TELEGRAM_SECRET_TOKEN,
			RESEND_API_KEY: privateEnv.RESEND_API_KEY,
			RESEND_WEBHOOK_SECRET: privateEnv.RESEND_WEBHOOK_SECRET,
			SESSION_SECRET: privateEnv.SESSION_SECRET,
			CSRF_SECRET: privateEnv.CSRF_SECRET,
			CRON_SECRET: privateEnv.CRON_SECRET,
			QR_PRIVATE_KEY_BASE64: privateEnv.QR_PRIVATE_KEY_BASE64,
			QR_PUBLIC_KEY: privateEnv.QR_PUBLIC_KEY,
			KIOSK_PRIVATE_KEY_BASE64: privateEnv.KIOSK_PRIVATE_KEY_BASE64,
			KIOSK_PUBLIC_KEY: privateEnv.KIOSK_PUBLIC_KEY,
			SITE_URL: privateEnv.SITE_URL,
			DEMO_MODE: privateEnv.DEMO_MODE,
			STRIPE_MODE: (privateEnv as any).STRIPE_MODE as 'live' | 'test',
			STRIPE_SECRET_KEY_LIVE: (privateEnv as any).STRIPE_SECRET_KEY_LIVE,
			STRIPE_SECRET_KEY_TEST: (privateEnv as any).STRIPE_SECRET_KEY_TEST,
			STRIPE_WEBHOOK_SECRET_LIVE: (privateEnv as any).STRIPE_WEBHOOK_SECRET_LIVE,
			STRIPE_WEBHOOK_SECRET_TEST: (privateEnv as any).STRIPE_WEBHOOK_SECRET_TEST,
			STRIPE_PRICE_ID_LIVE: (privateEnv as any).STRIPE_PRICE_ID_LIVE,
			STRIPE_PRICE_ID_TEST: (privateEnv as any).STRIPE_PRICE_ID_TEST,
			// PayPal Config
			PAYPAL_MODE: (privateEnv as any).PAYPAL_MODE as 'sandbox' | 'live',
			PAYPAL_CLIENT_ID_LIVE: (privateEnv as any).PAYPAL_CLIENT_ID_LIVE,
			PAYPAL_CLIENT_ID_SANDBOX: (privateEnv as any).PAYPAL_CLIENT_ID_SANDBOX,
			PAYPAL_CLIENT_SECRET_LIVE: (privateEnv as any).PAYPAL_CLIENT_SECRET_LIVE,
			PAYPAL_CLIENT_SECRET_SANDBOX: (privateEnv as any).PAYPAL_CLIENT_SECRET_SANDBOX,
			PAYPAL_WEBHOOK_ID_LIVE: (privateEnv as any).PAYPAL_WEBHOOK_ID_LIVE,
			PAYPAL_WEBHOOK_ID_SANDBOX: (privateEnv as any).PAYPAL_WEBHOOK_ID_SANDBOX,
			PAYPAL_PLAN_ID_LIVE: (privateEnv as any).PAYPAL_PLAN_ID_LIVE,
			PAYPAL_PLAN_ID_SANDBOX: (privateEnv as any).PAYPAL_PLAN_ID_SANDBOX
		};
	}

	// Apply Stripe Mode Logic
	const env = localEnvCache as ServerEnv;
	const stripeMode = env.STRIPE_MODE?.trim().toLowerCase();
	const isStripeTest = stripeMode === 'test';

	// Apply PayPal Mode Logic
	const paypalMode = env.PAYPAL_MODE?.trim().toLowerCase();
	const isPayPalSandbox = paypalMode === 'sandbox';

	// Helper to pick key based on mode
	const pickStripe = (base: string, test?: string, live?: string) => {
		if (isStripeTest) return test || base;
		return live || base;
	};

	const pickPayPal = (credName: string, sandbox?: string, live?: string) => {
		if (isPayPalSandbox) {
			if (!sandbox || sandbox.trim() === '') {
				throw new Error(`[PayPal] Missing ${credName}_SANDBOX credential for sandbox mode. Do not fall back to live credentials.`);
			}
			return sandbox;
		}
		if (!live || live.trim() === '') {
			throw new Error(`[PayPal] Missing ${credName}_LIVE credential for live mode. Do not fall back to sandbox credentials.`);
		}
		return live;
	};

	return {
		...env,
		// Stripe resolved values
		STRIPE_SECRET_KEY: pickStripe(env.STRIPE_SECRET_KEY, env.STRIPE_SECRET_KEY_TEST, env.STRIPE_SECRET_KEY_LIVE),
		STRIPE_WEBHOOK_SECRET: pickStripe(
			env.STRIPE_WEBHOOK_SECRET,
			env.STRIPE_WEBHOOK_SECRET_TEST,
			env.STRIPE_WEBHOOK_SECRET_LIVE
		),
		STRIPE_PRICE_ID: pickStripe(env.STRIPE_PRICE_ID, env.STRIPE_PRICE_ID_TEST, env.STRIPE_PRICE_ID_LIVE),
		// PayPal resolved values
		PAYPAL_CLIENT_ID: pickPayPal('PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID_SANDBOX, env.PAYPAL_CLIENT_ID_LIVE),
		PAYPAL_CLIENT_SECRET: pickPayPal('PAYPAL_CLIENT_SECRET', env.PAYPAL_CLIENT_SECRET_SANDBOX, env.PAYPAL_CLIENT_SECRET_LIVE),
		PAYPAL_WEBHOOK_ID: pickPayPal('PAYPAL_WEBHOOK_ID', env.PAYPAL_WEBHOOK_ID_SANDBOX, env.PAYPAL_WEBHOOK_ID_LIVE),
		PAYPAL_PLAN_ID: pickPayPal('PAYPAL_PLAN_ID', env.PAYPAL_PLAN_ID_SANDBOX, env.PAYPAL_PLAN_ID_LIVE)
	};
}

/**
 * Get a Supabase admin client with service role key
 * Must be called per-request to access the correct env
 */
export async function getSupabaseAdmin(event: RequestEvent): Promise<SupabaseClient> {
	const env = await getEnv(event);
	return createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Check if we're in local development (no platform.env available)
 */
export function isLocalDev(event: RequestEvent): boolean {
	return !event.platform?.env;
}
