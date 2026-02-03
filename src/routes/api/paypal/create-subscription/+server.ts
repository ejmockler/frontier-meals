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

	// Parse request body for optional reservation_id (outside try block for error handling)
	let reservation_id: string | undefined;
	let email: string | undefined;

	try {
		const body = await request.json().catch(() => ({}));
		reservation_id = body.reservation_id;
		email = body.email;
		// Generate deep link token BEFORE checkout (same pattern as Stripe)
		// This is passed via custom_id and returned in success URL
		const deepLinkToken = randomUUID();
		const deepLinkTokenHash = await sha256(deepLinkToken);

		// CRITICAL: Store token in database BEFORE redirect (7-day expiry)
		// This solves the race condition where user lands on success page before webhook
		//
		// FLOW:
		// 1. Token created here with customer_id=NULL, paypal_custom_id=hash
		// 2. User redirected to PayPal, completes payment
		// 3. User returns to /success?t=TOKEN (success page shows link)
		// 4. Webhook arrives, creates customer, activates token (sets customer_id)
		// 5. Both success page link AND email link now work
		//
		// NOTE: There's still a potential delay if webhook arrives AFTER user clicks success page link
		// But this is much better than the old flow where success page had a DIFFERENT (invalid) token
		// At worst, user sees "link expired" and uses the email link instead
		const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const { error: tokenError } = await supabase.from('telegram_deep_link_tokens').insert({
			customer_id: null, // Will be set by webhook when customer is created
			token_hash: deepLinkTokenHash,
			paypal_custom_id: deepLinkTokenHash, // Links token to subscription via custom_id
			expires_at: tokenExpiresAt.toISOString(),
			used: false
		});

		if (tokenError) {
			console.error('[PayPal Checkout] Error storing deep link token:', tokenError);
			return json({ error: 'Failed to create checkout session' }, { status: 500 });
		}

		console.log('[PayPal Checkout] Deep link token stored:', {
			token_hash: deepLinkTokenHash.slice(0, 8) + '...',
			paypal_custom_id: deepLinkTokenHash.slice(0, 8) + '...',
			expires_at: tokenExpiresAt.toISOString()
		});

		// Determine which PayPal Plan ID column to use based on environment
		// Normalize mode to lowercase to handle case variations (SANDBOX, Sandbox, sandbox)
		const isSandbox = env.PAYPAL_MODE?.toLowerCase() === 'sandbox';
		const planIdColumn = isSandbox ? 'paypal_plan_id_sandbox' : 'paypal_plan_id_live';

		// Determine which PayPal Plan ID to use
		let planId: string;
		let customIdData: { token: string; reservation_id?: string; email?: string };

		if (reservation_id) {
			// Fetch reservation to get the discounted plan's paypal_plan_id
			// NOTE: Discount codes link to a specific plan (with its own price), not discount percentages
			const { data: reservation, error: reservationError } = await supabase
				.from('discount_code_reservations')
				.select(`
					id,
					discount_code_id,
					customer_email,
					expires_at,
					discount_codes!inner(
						code,
						plan_id,
						subscription_plans(
							id,
							business_name,
							price_amount,
							paypal_plan_id_live,
							paypal_plan_id_sandbox
						)
					)
				`)
				.eq('id', reservation_id)
				.is('redeemed_at', null)
				.single();

			// Debug: Log the raw reservation data
			console.log('[PayPal Checkout] Raw reservation data:', JSON.stringify(reservation, null, 2));

			if (reservationError || !reservation) {
				console.error('[PayPal Checkout] Invalid or expired reservation:', {
					reservation_id,
					error: reservationError?.message
				});
				return json({
					error: 'Your discount code has expired. Please return to checkout and re-apply your code.'
				}, { status: 400 });
			}

			// SECURITY: Validate reservation hasn't expired
			const expiresAt = new Date(reservation.expires_at);
			if (expiresAt < new Date()) {
				console.error('[PayPal Checkout] Reservation expired:', {
					reservation_id,
					expires_at: reservation.expires_at
				});
				return json({
					error: 'Your discount code reservation has expired. Please return to checkout and re-apply your code.'
				}, { status: 400 });
			}

			// SECURITY: Validate email matches reservation
			// This prevents users from using another user's reservation_id to get their discount
			const reservationEmail = reservation.customer_email?.toLowerCase().trim();
			const providedEmail = email?.toLowerCase().trim();

			if (!providedEmail) {
				console.error('[PayPal Checkout] Email required for reservation checkout:', reservation_id);
				return json({
					error: 'Email is required for discount code checkout'
				}, { status: 400 });
			}

			if (reservationEmail !== providedEmail) {
				console.error('[PayPal Checkout] Email mismatch for reservation:', {
					reservation_id,
					reservation_email_domain: reservationEmail?.split('@')[1] || 'unknown',
					provided_email_domain: providedEmail?.split('@')[1] || 'unknown'
				});
				return json({
					error: 'Email does not match the discount code reservation. Please use the same email you entered when applying the code.'
				}, { status: 400 });
			}

			// Extract discount_codes and subscription_plans from nested structure
			const discountCodes = Array.isArray(reservation.discount_codes)
				? reservation.discount_codes[0]
				: reservation.discount_codes;
			const subscriptionPlans = Array.isArray(discountCodes?.subscription_plans)
				? discountCodes.subscription_plans[0]
				: discountCodes?.subscription_plans;

			// SECURITY: Validate plan has valid price
			const planPrice = parseFloat(subscriptionPlans?.price_amount || '0');

			if (planPrice <= 0) {
				console.error('[PayPal Checkout] Invalid plan price for reservation:', {
					reservation_id,
					price_amount: subscriptionPlans?.price_amount
				});
				return json({
					error: 'Invalid plan configuration. Please contact support.'
				}, { status: 500 });
			}

			// Log for audit trail - include all PayPal plan IDs for debugging
			console.log('[PayPal Checkout] Discount code checkout:', {
				reservation_id,
				code: discountCodes?.code,
				plan_id: subscriptionPlans?.id,
				plan_name: subscriptionPlans?.business_name,
				plan_price: planPrice,
				paypal_plan_id_live: subscriptionPlans?.paypal_plan_id_live || 'NOT SET',
				paypal_plan_id_sandbox: subscriptionPlans?.paypal_plan_id_sandbox || 'NOT SET',
				environment: env.PAYPAL_MODE,
				is_sandbox: isSandbox
			});

			// Select the correct plan ID based on environment
			const envPlanId = isSandbox
				? subscriptionPlans?.paypal_plan_id_sandbox
				: subscriptionPlans?.paypal_plan_id_live;

			if (!envPlanId) {
				console.error('[PayPal Checkout] No PayPal plan ID found for environment:', {
					reservation_id,
					environment: env.PAYPAL_MODE,
					column: planIdColumn,
					available_plan_ids: {
						live: subscriptionPlans?.paypal_plan_id_live || 'NOT SET',
						sandbox: subscriptionPlans?.paypal_plan_id_sandbox || 'NOT SET'
					}
				});
				return json(
					{ error: `Plan not configured for ${env.PAYPAL_MODE} environment` },
					{ status: 400 }
				);
			}

			planId = envPlanId;
			customIdData = {
				token: deepLinkTokenHash,
				reservation_id,
				email: providedEmail // Use validated email
			};

			console.log('[PayPal Checkout] Using discounted plan:', {
				reservation_id,
				plan_id: planId,
				environment: env.PAYPAL_MODE,
				email_validated: true,
				price_validated: true
			});
		} else {
			// No reservation - use default plan from database (environment-aware)
			const { data: defaultPlan } = await supabase
				.from('subscription_plans')
				.select(`paypal_plan_id_live, paypal_plan_id_sandbox`)
				.eq('is_default', true)
				.eq('is_active', true)
				.single();

			const dbPlanId = isSandbox
				? defaultPlan?.paypal_plan_id_sandbox
				: defaultPlan?.paypal_plan_id_live;

			// Fall back to env var if database plan not configured for this environment
			planId = dbPlanId || env.PAYPAL_PLAN_ID;

			console.log('[PayPal Checkout] Using default plan:', {
				plan_id: planId,
				source: dbPlanId ? 'database' : 'env_fallback',
				environment: env.PAYPAL_MODE
			});

			customIdData = { token: deepLinkTokenHash };

			if (email) {
				customIdData.email = email;
			}
		}

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
		// We encode reservation_id in custom_id as JSON for webhook processing
		const subscription = await createPayPalSubscription(paypalEnv, {
			planId,
			customId: JSON.stringify(customIdData), // Store reservation_id + token for verification
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
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('[PayPal] Error creating subscription:', {
			error: errorMessage,
			stack: error instanceof Error ? error.stack : undefined,
			reservation_id,
			has_email: !!email
		});

		// Clean up reservation on PayPal failure
		if (reservation_id) {
			try {
				const { error: cleanupError } = await supabase.rpc('cancel_discount_reservation', {
					p_reservation_id: reservation_id
				});

				if (cleanupError) {
					console.error('[PayPal] Failed to cleanup reservation:', cleanupError);
				} else {
					console.log('[PayPal] Reservation cleaned up after failure');
				}
			} catch (cleanupError) {
				console.error('[PayPal] Exception during reservation cleanup:', cleanupError);
			}
		}

		// Return more specific error for debugging
		return json({
			error: 'Failed to create subscription',
			details: errorMessage
		}, { status: 500 });
	}
};
