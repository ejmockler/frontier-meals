import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';
import { createPayPalSubscription, type PayPalEnv } from '$lib/integrations/paypal';

export const POST: RequestHandler = async (event) => {
	const { request, url, getClientAddress } = event;
	const env = await getEnv(event);
	const supabase = await getSupabaseAdmin(event);

	// Verify PayPal is configured
	if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_PLAN_ID) {
		console.error('[PayPal] Missing required environment variables');
		return json({ error: 'PayPal not configured' }, { status: 500 });
	}

	// Get client IP for rate limiting
	const clientIp =
		request.headers.get('CF-Connecting-IP') ||
		request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
		getClientAddress() ||
		'unknown';

	// Rate limiting: 5 requests per minute per IP (same as Stripe)
	const rateLimitResult = await checkRateLimit(supabase, {
		key: RateLimitKeys.checkout(clientIp),
		maxRequests: 5,
		windowMinutes: 1
	});

	if (!rateLimitResult.allowed) {
		console.warn('[PayPal Checkout] Rate limit exceeded for IP:', clientIp);
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(rateLimitResult.retryAfter),
					'X-RateLimit-Limit': '5',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
				}
			}
		);
	}

	try {
		// Generate deep link token BEFORE checkout (same pattern as Stripe)
		// This is passed via custom_id and returned in success URL
		const deepLinkToken = randomUUID();
		const deepLinkTokenHash = await sha256(deepLinkToken);

		const paypalEnv: PayPalEnv = {
			PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID,
			PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET,
			PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID || '',
			PAYPAL_PLAN_ID: env.PAYPAL_PLAN_ID,
			PAYPAL_MODE: env.PAYPAL_MODE || 'sandbox'
		};

		// Create PayPal subscription
		// Note: PayPal doesn't support custom fields at checkout like Stripe
		// The telegram_handle will be extracted from the bot interaction later
		const subscription = await createPayPalSubscription(paypalEnv, {
			planId: env.PAYPAL_PLAN_ID,
			customId: deepLinkTokenHash, // Store hash in custom_id for verification
			returnUrl: `${url.origin}/success?t=${deepLinkToken}&provider=paypal`,
			cancelUrl: `${url.origin}`
		});

		// Find approval URL from response links
		const approvalUrl = subscription.links.find((link) => link.rel === 'approve')?.href;

		if (!approvalUrl) {
			console.error('[PayPal] No approval URL in response:', subscription);
			throw new Error('No approval URL in PayPal response');
		}

		console.log('[PayPal] Subscription created:', {
			subscription_id: subscription.id,
			status: subscription.status,
			deep_link_token_hash: deepLinkTokenHash.slice(0, 8) + '...'
		});

		return json({ approvalUrl });
	} catch (error) {
		console.error('[PayPal] Error creating subscription:', error);
		return json({ error: 'Failed to create subscription' }, { status: 500 });
	}
};
