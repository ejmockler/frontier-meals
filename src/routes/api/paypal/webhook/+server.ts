import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { verifyPayPalWebhook, getPayPalSubscription, type PayPalEnv } from '$lib/integrations/paypal';
import { redactPII } from '$lib/utils/logging';
import { sendAdminAlert, alertEmailFailure } from '$lib/utils/alerts';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

// PayPal webhook event types
interface PayPalWebhookEvent {
	id: string;
	event_type: string;
	resource: PayPalSubscriptionResource;
	create_time: string;
}

interface PayPalSubscriptionResource {
	id: string;
	status: string;
	plan_id?: string;
	custom_id?: string;
	subscriber?: {
		email_address: string;
		payer_id: string;
		name?: {
			given_name?: string;
			surname?: string;
		};
	};
	billing_info?: {
		next_billing_time?: string;
		last_payment?: {
			time?: string;
			amount?: {
				currency_code: string;
				value: string;
			};
		};
		failed_payments_count?: number;
	};
	billing_agreement_id?: string; // For PAYMENT.SALE.COMPLETED events
	amount_with_breakdown?: {
		gross_amount?: {
			currency_code: string;
			value: string;
		};
	};
}

export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	const env = await getEnv(event);
	const supabase = await getSupabaseAdmin(event);

	// Get client IP address for rate limiting
	// Priority: CF-Connecting-IP (Cloudflare) > X-Forwarded-For > getClientAddress()
	const clientIp =
		request.headers.get('CF-Connecting-IP') ||
		request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
		getClientAddress() ||
		'unknown';

	// Rate limiting: 100 requests per minute per IP
	// PayPal webhooks shouldn't exceed this under normal circumstances
	// Protects against webhook replay attacks and DDoS attempts
	const rateLimitResult = await checkRateLimit(supabase, {
		key: RateLimitKeys.webhook('paypal', clientIp),
		maxRequests: 100,
		windowMinutes: 1
	});

	if (!rateLimitResult.allowed) {
		console.warn('[PayPal Webhook] Rate limit exceeded for IP:', redactPII({ ip: clientIp }).ip);

		// Log rate limit event for monitoring
		// C3/C4 FIX: Redact IP in subject field to prevent PII in audit logs
		const redactedIp = redactPII({ ip: clientIp }).ip as string;
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'webhook_rate_limit_exceeded',
			subject: `webhook:paypal:${redactedIp}`,
			metadata: {
				ip: redactedIp,
				reset_at: rateLimitResult.resetAt.toISOString()
			}
		});

		return json(
			{ error: 'Too many requests. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(rateLimitResult.retryAfter),
					'X-RateLimit-Limit': '100',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
				}
			}
		);
	}

	// Verify PayPal is configured
	if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID) {
		console.error('[PayPal Webhook] Missing required environment variables');
		return json({ error: 'PayPal not configured' }, { status: 500 });
	}

	const body = await request.text();

	const paypalEnv: PayPalEnv = {
		PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID,
		PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET,
		PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID,
		PAYPAL_PLAN_ID: env.PAYPAL_PLAN_ID || '',
		PAYPAL_MODE: env.PAYPAL_MODE || 'sandbox'
	};

	// Verify webhook signature using PayPal's API
	const isValid = await verifyPayPalWebhook(paypalEnv, body, request.headers);
	if (!isValid) {
		console.error('[PayPal Webhook] Invalid signature');
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	const eventObj = JSON.parse(body) as PayPalWebhookEvent;
	console.log('[PayPal Webhook] Event verified:', {
		event_id: eventObj.id,
		event_type: eventObj.event_type
	});

	// Idempotency check with retry support for failed events (C7 fix)
	// 1. Try to insert new event
	// 2. If duplicate, check if it's a failed event that can be retried
	// 3. Allow up to 3 attempts before giving up
	const MAX_RETRY_ATTEMPTS = 3;

	const { error: insertError } = await supabase
		.from('webhook_events')
		.insert({
			source: 'paypal',
			event_id: eventObj.id,
			event_type: eventObj.event_type,
			status: 'processing',
			attempts: 1,
			last_attempted_at: new Date().toISOString()
		});

	// Check for duplicate (PostgreSQL error code 23505)
	if (insertError?.code === '23505') {
		// Event exists - check if it's a failed event that can be retried
		const { data: existingEvent, error: fetchError } = await supabase
			.from('webhook_events')
			.select('status, attempts')
			.eq('event_id', eventObj.id)
			.single();

		if (fetchError) {
			console.error('[PayPal Webhook] Error fetching existing event:', fetchError);
			return json({ error: 'Database error' }, { status: 500 });
		}

		// If already processed successfully, skip
		if (existingEvent.status === 'processed') {
			console.log('[PayPal Webhook] Event already processed, skipping:', eventObj.id);
			return json({ received: true });
		}

		// If still processing (another instance handling it), skip
		if (existingEvent.status === 'processing') {
			console.log('[PayPal Webhook] Event already being processed, skipping:', eventObj.id);
			return json({ received: true });
		}

		// If failed, check retry limit
		if (existingEvent.status === 'failed') {
			if (existingEvent.attempts >= MAX_RETRY_ATTEMPTS) {
				console.warn('[PayPal Webhook] Event exceeded max retries, skipping:', {
					event_id: eventObj.id,
					attempts: existingEvent.attempts
				});
				return json({ received: true });
			}

			// Reset to processing and increment attempts for retry
			console.log('[PayPal Webhook] Retrying failed event:', {
				event_id: eventObj.id,
				attempt: existingEvent.attempts + 1
			});

			const { error: updateError } = await supabase
				.from('webhook_events')
				.update({
					status: 'processing',
					attempts: existingEvent.attempts + 1,
					last_attempted_at: new Date().toISOString(),
					error_message: null // Clear previous error
				})
				.eq('event_id', eventObj.id);

			if (updateError) {
				console.error('[PayPal Webhook] Error updating event for retry:', updateError);
				return json({ error: 'Database error' }, { status: 500 });
			}
		}
	} else if (insertError) {
		console.error('[PayPal Webhook] Error inserting event:', insertError);
		return json({ error: 'Database error' }, { status: 500 });
	}

	try {
		switch (eventObj.event_type) {
			case 'BILLING.SUBSCRIPTION.CREATED':
				await handleSubscriptionCreated(eventObj, supabase);
				break;

			case 'BILLING.SUBSCRIPTION.ACTIVATED':
				await handleSubscriptionActivated(eventObj, supabase, env);
				break;

			case 'PAYMENT.SALE.COMPLETED':
				await handlePaymentCompleted(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
				await handlePaymentFailed(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.SUSPENDED':
				await handleSubscriptionSuspended(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
				await handleSubscriptionReactivated(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.EXPIRED':
				await handleSubscriptionExpired(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.CANCELLED':
				await handleSubscriptionCancelled(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.UPDATED':
				await handleSubscriptionUpdated(eventObj, supabase);
				break;

			case 'PAYMENT.SALE.REFUNDED':
				await handlePaymentRefunded(eventObj, supabase);
				break;

			case 'PAYMENT.SALE.REVERSED':
				await handlePaymentReversed(eventObj, supabase, env);
				break;

			default:
				console.log('[PayPal Webhook] Unhandled event type:', eventObj.event_type);
		}

		// Mark event as processed
		await supabase
			.from('webhook_events')
			.update({ status: 'processed', processed_at: new Date().toISOString() })
			.eq('event_id', eventObj.id);

		return json({ received: true });
	} catch (error) {
		console.error('[PayPal Webhook] Error processing:', error);

		// Mark event as failed
		await supabase
			.from('webhook_events')
			.update({
				status: 'failed',
				error_message: error instanceof Error ? error.message : 'Unknown error'
			})
			.eq('event_id', eventObj.id);

		return json({ error: 'Webhook processing failed' }, { status: 500 });
	}
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleSubscriptionCreated(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;
	const paypalCustomId = resource.custom_id;

	console.log('[PayPal] Subscription created (approval_pending):', {
		subscription_id: paypalSubscriptionId,
		plan_id: resource.plan_id,
		status: resource.status,
		has_custom_id: !!paypalCustomId
	});

	// BILLING.SUBSCRIPTION.CREATED fires BEFORE customer approves the subscription
	// This is the "approval_pending" state - customer has not yet completed checkout
	// Edge cases:
	// - Customer may abandon checkout (never approve)
	// - BILLING.SUBSCRIPTION.ACTIVATED will follow if customer approves
	// - subscriber data may be incomplete or missing at this stage

	// Validate custom_id if present (should be SHA-256 hash from checkout)
	if (paypalCustomId) {
		const SHA256_REGEX = /^[a-f0-9]{64}$/i;
		if (!SHA256_REGEX.test(paypalCustomId)) {
			console.error('[PayPal Webhook] Invalid custom_id format in CREATED event:', {
				length: paypalCustomId.length,
				prefix: paypalCustomId.slice(0, 8)
			});
		}
	}

	// CRITICAL: Do NOT create customer/subscription records yet
	// We don't have payer_id until ACTIVATED event
	// Just log the event for operational visibility and audit trail

	// Audit log for subscription creation attempt
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_created_pending',
		subject: paypalCustomId ? `token:${paypalCustomId.slice(0, 8)}...` : 'unknown',
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId,
			paypal_plan_id: resource.plan_id,
			paypal_status: resource.status,
			note: 'Subscription created but pending customer approval - ACTIVATED event will follow if approved'
		}
	});

	console.log('[PayPal] CREATED event logged - waiting for ACTIVATED event to create customer record');
}

async function handleSubscriptionActivated(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const subscriber = resource.subscriber;

	if (!subscriber) {
		throw new Error('Missing subscriber information');
	}

	const email = subscriber.email_address;
	const name = subscriber.name
		? `${subscriber.name.given_name || ''} ${subscriber.name.surname || ''}`.trim()
		: 'Frontier Customer';
	const paypalPayerId = subscriber.payer_id;
	const paypalSubscriptionId = resource.id;

	// DI-2: Validate payer_id before attempting INSERT
	// Edge case: PayPal may not return payer_id in some scenarios
	if (!paypalPayerId) {
		console.error('[PayPal Webhook] Missing payer_id from subscriber:', {
			subscription_id: paypalSubscriptionId,
			email: redactPII({ email }).email
		});
		throw new Error('Missing payer_id - cannot create customer record');
	}

	console.log(
		'[PayPal] Subscription activated:',
		redactPII({
			payer_id: paypalPayerId,
			subscription_id: paypalSubscriptionId,
			email
		})
	);

	// ============================================================================
	// DUPLICATE SUBSCRIPTION PREVENTION
	// ============================================================================
	// Check if this PayPal payer already has an ACTIVE subscription.
	// If so, we should:
	// 1. Cancel the NEW subscription in PayPal (the one being activated)
	// 2. Keep the existing subscription active
	// 3. Log for admin visibility
	// 4. NOT create a duplicate subscription record
	//
	// This handles the case where a user tries to subscribe again when they're
	// already a member. The UX outcome is: user is recognized as existing member.
	// ============================================================================

	const { data: existingCustomer } = await supabase
		.from('customers')
		.select(`
			id,
			email,
			telegram_user_id,
			subscriptions!inner(
				id,
				status,
				paypal_subscription_id,
				current_period_end
			)
		`)
		.eq('paypal_payer_id', paypalPayerId)
		.eq('subscriptions.status', 'active')
		.single();

	if (existingCustomer && existingCustomer.subscriptions) {
		const existingSub = Array.isArray(existingCustomer.subscriptions)
			? existingCustomer.subscriptions[0]
			: existingCustomer.subscriptions;

		// Only block if the existing subscription is DIFFERENT from this one
		// (same subscription ID means this is a webhook retry, not a duplicate)
		if (existingSub.paypal_subscription_id !== paypalSubscriptionId) {
			console.warn('[PayPal Webhook] DUPLICATE SUBSCRIPTION DETECTED:', {
				existing_customer_id: existingCustomer.id,
				existing_subscription_id: existingSub.paypal_subscription_id,
				new_subscription_id: paypalSubscriptionId,
				customer_email: redactPII({ email: existingCustomer.email }).email,
				has_telegram: !!existingCustomer.telegram_user_id
			});

			// Cancel the NEW subscription in PayPal to prevent double billing
			try {
				const paypalEnv: PayPalEnv = {
					PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID!,
					PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET!,
					PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID!,
					PAYPAL_PLAN_ID: env.PAYPAL_PLAN_ID || '',
					PAYPAL_MODE: env.PAYPAL_MODE || 'sandbox'
				};

				const { cancelPayPalSubscription } = await import('$lib/integrations/paypal');
				await cancelPayPalSubscription(paypalEnv, paypalSubscriptionId, 'Duplicate subscription - customer already has active membership');

				console.log('[PayPal Webhook] Cancelled duplicate subscription in PayPal:', paypalSubscriptionId);
			} catch (cancelError) {
				// Log but don't fail - the important thing is we don't create a DB record
				console.error('[PayPal Webhook] Failed to cancel duplicate subscription in PayPal:', {
					subscription_id: paypalSubscriptionId,
					error: cancelError instanceof Error ? cancelError.message : String(cancelError)
				});
			}

			// Audit log for visibility
			await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'duplicate_subscription_blocked',
				subject: `customer:${existingCustomer.id}`,
				metadata: {
					payment_provider: 'paypal',
					existing_subscription_id: existingSub.paypal_subscription_id,
					blocked_subscription_id: paypalSubscriptionId,
					existing_period_end: existingSub.current_period_end,
					customer_has_telegram: !!existingCustomer.telegram_user_id,
					note: 'Customer attempted to create duplicate subscription - new subscription was cancelled'
				}
			});

			// Return early - don't create duplicate subscription record
			// The user will be shown "You're already a member" on the success page
			console.log('[PayPal Webhook] Duplicate subscription blocked - customer already has active membership');
			return;
		}
	}

	// C2 FIX: Use UPSERT to prevent race condition between concurrent webhooks
	// Two simultaneous BILLING.SUBSCRIPTION.ACTIVATED webhooks could both find no customer
	// and both attempt INSERT, causing one to fail with unique constraint violation.
	// UPSERT with onConflict ensures exactly one customer record is created/updated atomically.
	//
	// NOTE: We deliberately omit telegram_handle from the upsert to preserve any existing
	// value for returning customers who have already linked their Telegram account.
	// The column defaults to NULL for new customers (INSERT) and remains unchanged for
	// existing customers (UPDATE via ON CONFLICT).
	console.log(
		'[DB] Upserting customer record (PayPal):',
		redactPII({
			paypal_payer_id: paypalPayerId,
			email,
			name
		})
	);

	const { data: customer, error: customerError } = await supabase
		.from('customers')
		.upsert(
			{
				payment_provider: 'paypal',
				paypal_payer_id: paypalPayerId,
				email,
				name
				// telegram_handle intentionally omitted - defaults to NULL on INSERT,
				// unchanged on UPDATE (preserves existing value for returning customers)
			},
			{
				onConflict: 'paypal_payer_id',
				ignoreDuplicates: false // Update on conflict (email/name may have changed)
			}
		)
		.select()
		.single();

	if (customerError) {
		console.error('[DB ERROR] Error upserting customer:', customerError);
		throw customerError;
	}

	const customerId = customer.id;
	console.log('[DB SUCCESS] Customer upserted:', customerId);

	// ============================================================================
	// C5 FIX: Subscription State Race Condition - NULL Period Dates Handling
	// ============================================================================
	// PROBLEM: If period_start/period_end are NULL, the subscription ends up in
	// "approval_pending" zombie state where QR codes can't be issued.
	//
	// SOLUTION:
	// 1. First try webhook data (billing_info.last_payment.time / next_billing_time)
	// 2. If NULL, fetch fresh data from PayPal's API using subscription ID
	// 3. If API also returns NULL, calculate reasonable defaults (now + 1 month)
	// 4. ALWAYS set subscription to 'active' with valid dates - never leave in zombie state
	// ============================================================================

	// Extract billing dates from webhook payload
	const billingInfo = resource.billing_info;
	let periodStart = billingInfo?.last_payment?.time;
	let periodEnd = billingInfo?.next_billing_time;
	let dateSource = 'webhook';

	// Build PayPal env for API calls if needed
	// NOTE: Parent POST handler already validates these exist (returns 500 if not)
	const paypalEnv: PayPalEnv = {
		PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID!,
		PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET!,
		PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID!,
		PAYPAL_PLAN_ID: env.PAYPAL_PLAN_ID || '',
		PAYPAL_MODE: env.PAYPAL_MODE || 'sandbox'
	};

	// If dates are missing from webhook, try fetching fresh data from PayPal API
	if (!periodStart || !periodEnd) {
		console.log('[PayPal] C5 FIX: NULL period dates in webhook - fetching from PayPal API:', {
			paypal_subscription_id: paypalSubscriptionId,
			has_period_start: !!periodStart,
			has_period_end: !!periodEnd
		});

		try {
			const freshSubscription = await getPayPalSubscription(paypalEnv, paypalSubscriptionId);
			const freshBillingInfo = freshSubscription.billing_info;

			// Use API data if available
			if (!periodStart && freshBillingInfo?.last_payment?.time) {
				periodStart = freshBillingInfo.last_payment.time;
				dateSource = 'api';
				console.log('[PayPal] C5 FIX: Got period_start from API:', periodStart);
			}
			if (!periodEnd && freshBillingInfo?.next_billing_time) {
				periodEnd = freshBillingInfo.next_billing_time;
				dateSource = 'api';
				console.log('[PayPal] C5 FIX: Got period_end from API:', periodEnd);
			}
		} catch (apiError) {
			console.error('[PayPal] C5 FIX: Failed to fetch subscription from API (will use defaults):', {
				error: apiError instanceof Error ? apiError.message : String(apiError),
				paypal_subscription_id: paypalSubscriptionId
			});
		}
	}

	// If dates are STILL missing after API call, calculate reasonable defaults
	// This ensures subscription NEVER gets stuck in zombie state
	if (!periodStart || !periodEnd) {
		const now = new Date();
		const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

		if (!periodStart) {
			periodStart = now.toISOString();
			console.warn('[PayPal] C5 FIX: Using DEFAULT period_start (now):', periodStart);
		}
		if (!periodEnd) {
			periodEnd = oneMonthLater.toISOString();
			console.warn('[PayPal] C5 FIX: Using DEFAULT period_end (now + 30 days):', periodEnd);
		}
		dateSource = dateSource === 'webhook' ? 'defaults' : `${dateSource}+defaults`;

		// CRITICAL: Log loudly when defaults are used so admins can investigate
		console.warn('[PayPal] C5 FIX: ADMIN ALERT - Using calculated default dates for subscription:', {
			paypal_subscription_id: paypalSubscriptionId,
			period_start: periodStart,
			period_end: periodEnd,
			date_source: dateSource,
			action_required: 'Investigate why PayPal did not provide billing dates'
		});

		// Audit log for admin visibility
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'subscription_dates_defaulted',
			subject: `subscription:${paypalSubscriptionId}`,
			metadata: {
				payment_provider: 'paypal',
				paypal_subscription_id: paypalSubscriptionId,
				default_period_start: periodStart,
				default_period_end: periodEnd,
				date_source: dateSource,
				webhook_had_last_payment: !!billingInfo?.last_payment?.time,
				webhook_had_next_billing: !!billingInfo?.next_billing_time,
				note: 'C5 FIX: Used default dates to prevent zombie subscription state'
			}
		});
	}

	// Now we're guaranteed to have valid dates - always set to active
	// C5 FIX: Never leave subscription in approval_pending zombie state
	const derivedStatus = 'active';

	console.log('[PayPal] C5 FIX: Subscription will be activated with valid dates:', {
		paypal_subscription_id: paypalSubscriptionId,
		period_start: periodStart,
		period_end: periodEnd,
		date_source: dateSource,
		status: derivedStatus
	});

	// UPSERT subscription record (idempotent - handles duplicate ACTIVATED webhooks)
	console.log(
		'[DB] Upserting subscription record (PayPal):',
		redactPII({
			customer_id: customerId,
			paypal_subscription_id: paypalSubscriptionId,
			status: derivedStatus
		})
	);

	// C5 FIX: Use resolved period dates (from webhook, API, or defaults)
	// periodStart and periodEnd are guaranteed non-null at this point
	const { error: subError } = await supabase
		.from('subscriptions')
		.upsert(
			{
				customer_id: customerId,
				payment_provider: 'paypal',
				paypal_subscription_id: paypalSubscriptionId,
				paypal_plan_id: resource.plan_id,
				status: derivedStatus,
				current_period_start: new Date(periodStart).toISOString(),
				current_period_end: new Date(periodEnd).toISOString(),
				next_billing_time: new Date(periodEnd).toISOString()
			},
			{
				onConflict: 'paypal_subscription_id',
				ignoreDuplicates: false // Update on conflict
			}
		);

	if (subError) {
		console.error('[DB ERROR] Error upserting subscription:', subError);
		throw subError;
	}

	console.log('[DB SUCCESS] Subscription upserted');

	// Initialize telegram_link_status (UPSERT for idempotency - don't overwrite if already linked)
	const { error: linkStatusError } = await supabase.from('telegram_link_status').upsert(
		{
			customer_id: customerId,
			is_linked: false
		},
		{
			onConflict: 'customer_id',
			ignoreDuplicates: true // Don't overwrite if already exists (preserves is_linked: true)
		}
	);

	if (linkStatusError) {
		console.error('[DB ERROR] Error upserting telegram_link_status:', linkStatusError);
		// Don't throw - this is not critical for subscription activation
	}

	// ============================================================================
	// UNIFIED TOKEN FLOW: Activate checkout token + create email token
	// ============================================================================
	// ARCHITECTURE:
	// 1. Checkout creates token with customer_id=NULL, paypal_custom_id set
	// 2. Webhook finds that token and activates it (sets customer_id)
	// 3. Success page uses checkout token (from URL)
	// 4. Email uses a separate token (we can't recover plaintext from hash)
	//
	// NOTE: We end up with 2 valid tokens per customer (success page + email)
	// This is acceptable - both work, user can use either one
	// PayPal doesn't support metadata like Stripe, so we can't pass plaintext token through
	//
	// DISCOUNT CODES:
	// If reservation_id is present in custom_id, we call redeem_discount_code RPC
	// ============================================================================

	const paypalCustomId = resource.custom_id;

	if (!paypalCustomId) {
		console.error('[PayPal Webhook] Missing custom_id from subscription resource');
		throw new Error('Missing custom_id in PayPal subscription');
	}

	// Parse custom_id - it may be JSON (with reservation_id) or plain SHA-256 hash
	// C2/C6 FIX: Proper validation of parsed JSON and token field
	let customData: { token: string; reservation_id?: string; email?: string };
	const SHA256_REGEX = /^[a-f0-9]{64}$/i;

	try {
		// Try parsing as JSON first (new format with discount codes)
		const parsed = JSON.parse(paypalCustomId);

		// C2/C6 FIX: Validate that parsed object is actually an object (not null, array, or primitive)
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			console.error('[PayPal Webhook] Parsed custom_id is not a valid object:', {
				type: typeof parsed,
				isNull: parsed === null,
				isArray: Array.isArray(parsed)
			});
			throw new Error('custom_id JSON must be an object');
		}

		// C2/C6 FIX: Validate that token field exists and is a non-empty string
		if (typeof parsed.token !== 'string' || parsed.token.length === 0) {
			console.error('[PayPal Webhook] Parsed custom_id missing or invalid token field:', {
				hasToken: 'token' in parsed,
				tokenType: typeof parsed.token,
				tokenLength: typeof parsed.token === 'string' ? parsed.token.length : 'N/A'
			});
			throw new Error('custom_id JSON must contain a non-empty token string');
		}

		// C2/C6 FIX: Validate token is a valid SHA-256 hash
		if (!SHA256_REGEX.test(parsed.token)) {
			console.error('[PayPal Webhook] Token in custom_id JSON is not a valid SHA-256 hash:', {
				length: parsed.token.length,
				prefix: parsed.token.slice(0, 8)
			});
			throw new Error('token in custom_id must be a valid SHA-256 hash');
		}

		// Validate reservation_id if present (must be string if provided)
		if (parsed.reservation_id !== undefined && typeof parsed.reservation_id !== 'string') {
			console.error('[PayPal Webhook] Invalid reservation_id type in custom_id:', {
				type: typeof parsed.reservation_id
			});
			throw new Error('reservation_id in custom_id must be a string');
		}

		customData = {
			token: parsed.token,
			reservation_id: parsed.reservation_id,
			email: typeof parsed.email === 'string' ? parsed.email : undefined
		};

		console.log('[PayPal Webhook] Parsed custom_id as JSON:', {
			has_token: true,
			has_reservation: !!customData.reservation_id
		});
	} catch (parseError) {
		// Check if this was a validation error (our thrown errors) vs JSON parse error
		if (parseError instanceof SyntaxError) {
			// JSON parse failed - fall back to plain hash (legacy format)
			if (!SHA256_REGEX.test(paypalCustomId)) {
				console.error('[PayPal Webhook] Invalid custom_id format (not JSON and not SHA-256):', {
					length: paypalCustomId.length,
					prefix: paypalCustomId.slice(0, 8)
				});
				throw new Error('Invalid custom_id format in PayPal subscription');
			}
			customData = { token: paypalCustomId };
			console.log('[PayPal Webhook] Using legacy custom_id format (plain hash)');
		} else {
			// Validation error from our checks above - re-throw
			throw parseError;
		}
	}

	// C2/C6 FIX: Final null check before using token (defensive programming)
	if (!customData || !customData.token) {
		console.error('[PayPal Webhook] customData or token is null after parsing');
		throw new Error('Failed to extract token from custom_id');
	}

	const tokenHash = customData.token;

	console.log('[PayPal Webhook] Looking for checkout token:', {
		token_hash: tokenHash.slice(0, 8) + '...'
	});

	// Find and activate the token created during checkout
	const { data: existingToken, error: findTokenError } = await supabase
		.from('telegram_deep_link_tokens')
		.select('*')
		.eq('paypal_custom_id', tokenHash)
		.eq('used', false)
		.maybeSingle();

	if (findTokenError) {
		console.error('[DB ERROR] Error finding checkout token:', findTokenError);
		throw findTokenError;
	}

	if (existingToken) {
		// ACTIVATE checkout token by linking it to customer
		// IDEMPOTENCY: Only update if customer_id is still NULL (not already activated)
		const { data: updatedTokens, error: updateError } = await supabase
			.from('telegram_deep_link_tokens')
			.update({ customer_id: customerId })
			.eq('id', existingToken.id)
			.is('customer_id', null) // Only update if not already linked
			.select();

		if (updateError) {
			console.error('[DB ERROR] Error activating checkout token:', updateError);
			throw updateError;
		}

		if (updatedTokens && updatedTokens.length > 0) {
			console.log('[PayPal Webhook] ✓ Checkout token activated (success page link now works):', {
				token_id: existingToken.id,
				customer_id: customerId
			});
		} else {
			console.log('[PayPal Webhook] ✓ Checkout token already activated (duplicate webhook):', {
				token_id: existingToken.id
			});
		}
	} else {
		// FALLBACK: Token not found (shouldn't happen unless DB write failed at checkout)
		console.warn('[PayPal Webhook] ⚠ Checkout token not found - checkout DB write may have failed:', {
			token_hash: tokenHash.slice(0, 8) + '...'
		});
	}

	// CREATE separate token for email
	// We can't recover the plaintext checkout token from its hash
	// So email gets a different (but equally valid) token
	//
	// IDEMPOTENCY: Check if email token already exists for this customer
	// (prevents duplicate tokens on webhook retry)
	const { data: existingEmailToken } = await supabase
		.from('telegram_deep_link_tokens')
		.select('id')
		.eq('customer_id', customerId)
		.is('paypal_custom_id', null) // Email tokens have no paypal_custom_id
		.eq('used', false)
		.maybeSingle();

	let emailToken: string;

	if (existingEmailToken) {
		console.log('[PayPal Webhook] ✓ Email token already exists (duplicate webhook), reusing');
		// We can't get the plaintext token back, but that's ok - email was already sent
		// Use a placeholder since we can't send the email again anyway (idempotency key)
		emailToken = 'EMAIL_ALREADY_SENT';
	} else {
		// Create new email token
		emailToken = randomUUID();
		const emailTokenHash = await sha256(emailToken);
		const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

		const { error: emailTokenError } = await supabase.from('telegram_deep_link_tokens').insert({
			customer_id: customerId,
			token_hash: emailTokenHash,
			paypal_custom_id: null, // Not linked to PayPal checkout
			expires_at: tokenExpiresAt.toISOString(),
			used: false
		});

		if (emailTokenError) {
			// Check if error is duplicate (race condition between webhook retries)
			if (emailTokenError.code === '23505') {
				console.log('[PayPal Webhook] Email token already created (race condition)');
				emailToken = 'EMAIL_ALREADY_SENT';
			} else {
				console.error('[DB ERROR] Error creating email token:', emailTokenError);
				throw emailTokenError;
			}
		} else {
			console.log('[PayPal Webhook] ✓ Email token created (both tokens are now valid)');

			// CRITICAL: Verify token visibility before sending email
			// Transaction isolation means INSERT may not be visible to other connections yet.
			// If we send email before token is visible, user clicks link and sees "invalid token"
			const { data: verifyToken, error: verifyError } = await supabase
				.from('telegram_deep_link_tokens')
				.select('id')
				.eq('token_hash', emailTokenHash)
				.single();

			if (verifyError || !verifyToken) {
				console.error('[DB ERROR] Token visibility verification failed - aborting email send', {
					verifyError,
					token_hash_prefix: emailTokenHash.slice(0, 8)
				});
				throw new Error('Token visibility verification failed - aborting email send');
			}

			console.log('[PayPal Webhook] ✓ Token visibility verified - safe to send email');
		}
	}

	// Send telegram_link email with email token (if not already sent)
	if (emailToken !== 'EMAIL_ALREADY_SENT') {
		const deepLink = `https://t.me/frontiermealsbot?start=${emailToken}`;

		// Note: telegram_handle is null for PayPal customers - they'll set it via bot
		try {
			const emailTemplate = await renderTemplate(
				'telegram_link',
				{
					customer_name: name,
					telegram_handle: '(set up in Telegram)', // Placeholder - resolved by bot
					deep_link: deepLink
				},
				env.SUPABASE_SERVICE_ROLE_KEY
			);

			await sendEmail({
				to: email,
				subject: emailTemplate.subject,
				html: emailTemplate.html,
				tags: [
					{ name: 'category', value: 'telegram_link' },
					{ name: 'customer_id', value: customerId },
					{ name: 'provider', value: 'paypal' }
				],
				idempotencyKey: `telegram_link/${customerId}/${paypalSubscriptionId}`
			});

			console.log('[EMAIL SUCCESS] Telegram link email sent');
		} catch (emailError) {
			console.error('[EMAIL ERROR] Failed to send telegram link email:', emailError);
			// Alert admin - customer won't receive their welcome/link email
			await alertEmailFailure({
				customerId,
				customerEmail: email,
				emailType: 'telegram_link',
				errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
				provider: 'paypal',
				subscriptionId: paypalSubscriptionId
			});
			// Don't throw - email failure shouldn't fail the webhook
		}
	} else {
		console.log('[EMAIL SKIP] Email already sent (duplicate webhook or race condition)');
	}

	// ============================================================================
	// DISCOUNT CODE REDEMPTION
	// ============================================================================
	// If reservation_id exists in custom_id, validate and redeem the discount code
	// Validation ensures reservation exists, is not expired, and is not already redeemed
	// ============================================================================

	if (customData.reservation_id) {
		// Validate reservation before redemption
		const { data: reservation, error: reservationError } = await supabase
			.from('discount_code_reservations')
			.select('id, customer_email, expires_at, redeemed_at, discount_code_id')
			.eq('id', customData.reservation_id)
			.single();

		if (reservationError || !reservation) {
			console.error('[PayPal Webhook] Reservation not found:', {
				reservation_id: customData.reservation_id,
				error: reservationError?.message
			});
			// Log to audit but don't fail webhook - subscription already created
			await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'discount_reservation_not_found',
				subject: `customer:${customerId}`,
				metadata: {
					reservation_id: customData.reservation_id,
					paypal_subscription_id: paypalSubscriptionId
				}
			});
			// Skip redemption but continue webhook processing
		} else if (reservation.redeemed_at) {
			console.log('[PayPal Webhook] Reservation already redeemed (idempotent):', {
				reservation_id: customData.reservation_id
			});
			// Already redeemed - this is fine, just skip
		} else if (new Date(reservation.expires_at) < new Date()) {
			console.warn('[PayPal Webhook] Reservation expired:', {
				reservation_id: customData.reservation_id,
				expired_at: reservation.expires_at
			});
			await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'discount_reservation_expired_at_redemption',
				subject: `customer:${customerId}`,
				metadata: {
					reservation_id: customData.reservation_id,
					expired_at: reservation.expires_at,
					paypal_subscription_id: paypalSubscriptionId
				}
			});
			// Expired - log but continue (user still gets subscription)
		} else {
			// ============================================================================
			// C3 FIX: Verify discount code is still valid before redemption
			// The code was "reserved" at checkout, but admin may have deactivated it since
			// We honor the grace_period_minutes field to allow recent deactivations
			// ============================================================================
			const { data: discountCode, error: codeError } = await supabase
				.from('discount_codes')
				.select('id, code, is_active, valid_from, valid_until, max_uses, current_uses, deactivated_at, grace_period_minutes')
				.eq('id', reservation.discount_code_id)
				.single();

			let codeValidationError: string | null = null;

			if (codeError || !discountCode) {
				codeValidationError = 'Discount code not found in database';
			} else {
				const now = new Date();

				// Check if code is active OR within grace period after deactivation
				if (!discountCode.is_active) {
					if (discountCode.deactivated_at && discountCode.grace_period_minutes) {
						const deactivatedAt = new Date(discountCode.deactivated_at);
						const graceEndTime = new Date(deactivatedAt.getTime() + discountCode.grace_period_minutes * 60 * 1000);
						if (now > graceEndTime) {
							codeValidationError = `Code deactivated and grace period expired (deactivated: ${discountCode.deactivated_at}, grace: ${discountCode.grace_period_minutes}min)`;
						}
						// Within grace period - allow redemption
					} else {
						// Deactivated with no grace period info - reject
						codeValidationError = 'Code has been deactivated by admin';
					}
				}

				// Check if code is not yet valid (valid_from)
				if (!codeValidationError && discountCode.valid_from) {
					const validFrom = new Date(discountCode.valid_from);
					if (now < validFrom) {
						codeValidationError = `Code is not yet valid (starts ${discountCode.valid_from})`;
					}
				}

				// Check if code has expired (valid_until)
				if (!codeValidationError && discountCode.valid_until) {
					const validUntil = new Date(discountCode.valid_until);
					if (now > validUntil) {
						codeValidationError = `Code expired on ${discountCode.valid_until}`;
					}
				}

				// Check if max uses has been reached
				if (!codeValidationError && discountCode.max_uses !== null) {
					if (discountCode.current_uses >= discountCode.max_uses) {
						codeValidationError = `Code has reached maximum uses (${discountCode.current_uses}/${discountCode.max_uses})`;
					}
				}
			}

			if (codeValidationError) {
				// Log warning but don't fail webhook - subscription is already active at PayPal
				console.warn('[PayPal Webhook] Discount code validation failed (non-fatal):', {
					reservation_id: customData.reservation_id,
					discount_code_id: reservation.discount_code_id,
					code: discountCode?.code,
					reason: codeValidationError
				});
				await supabase.from('audit_log').insert({
					actor: 'system',
					action: 'discount_code_validation_failed',
					subject: `customer:${customerId}`,
					metadata: {
						reservation_id: customData.reservation_id,
						discount_code_id: reservation.discount_code_id,
						discount_code: discountCode?.code,
						validation_error: codeValidationError,
						paypal_subscription_id: paypalSubscriptionId,
						note: 'Discount not applied - code became invalid between checkout and webhook'
					}
				});
				// Skip redemption but continue webhook processing
			} else {
				// Valid reservation AND valid discount code - proceed with redemption
				try {
					const { data: redeemed, error: redeemError } = await supabase.rpc('redeem_discount_code', {
						p_reservation_id: customData.reservation_id,
						p_customer_id: customerId,
						p_paypal_subscription_id: paypalSubscriptionId
					});

					if (redeemError) {
						console.error('[PayPal Webhook] Error redeeming discount code (non-fatal):', {
							error: redeemError.message,
							reservation_id: customData.reservation_id
						});
						await supabase.from('audit_log').insert({
							actor: 'system',
							action: 'discount_redemption_failed',
							subject: `customer:${customerId}`,
							metadata: {
								error: redeemError.message,
								reservation_id: customData.reservation_id,
								paypal_subscription_id: paypalSubscriptionId
							}
						});
					} else {
						console.log('[PayPal Webhook] Discount code redeemed successfully');
						await supabase.from('audit_log').insert({
							actor: 'system',
							action: 'discount_redeemed',
							subject: `customer:${customerId}`,
							metadata: {
								reservation_id: customData.reservation_id,
								discount_code_id: reservation.discount_code_id,
								paypal_subscription_id: paypalSubscriptionId
							}
						});
					}
				} catch (error) {
					console.error('[PayPal Webhook] Unexpected error during discount redemption (non-fatal):', error);
				}
			}
		}
	}

	// Audit log (PII-safe metadata)
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_created',
		subject: `customer:${customerId}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: redactPII({ subscription_id: paypalSubscriptionId }).subscription_id,
			email_domain: email.split('@')[1] || 'unknown', // Store domain only, not full email
			has_discount: !!customData.reservation_id
		}
	});
}

async function handlePaymentCompleted(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const billingAgreementId = resource.billing_agreement_id;

	if (!billingAgreementId) {
		console.log('[PayPal] Not a subscription payment, skipping');
		return;
	}

	// Get current subscription to check if we have valid period dates AND previous status
	// MT-3: Also fetch payment_failure_count to track resets
	const { data: currentSub } = await supabase
		.from('subscriptions')
		.select('customer_id, current_period_start, current_period_end, status, payment_failure_count, customers(id, name, email)')
		.eq('paypal_subscription_id', billingAgreementId)
		.single();

	if (!currentSub) {
		// Race condition: PAYMENT.SALE.COMPLETED arrived before BILLING.SUBSCRIPTION.ACTIVATED
		// This is normal - the ACTIVATED event will create the subscription
		// PayPal will retry this webhook if needed
		console.warn(
			'[PayPal] Subscription not found for payment completion (race condition):',
			billingAgreementId,
			'- will be processed on ACTIVATED event'
		);
		return;
	}

	const previousStatus = currentSub.status;

	// CRITICAL: Only set 'active' if we have valid period dates
	// Without dates, QR job cannot issue codes (date comparison fails on NULL)
	const hasValidPeriod = currentSub.current_period_start && currentSub.current_period_end;
	const derivedStatus = hasValidPeriod ? 'active' : 'approval_pending';

	// Log fallback for operational visibility
	if (!hasValidPeriod) {
		console.warn('[PayPal] Payment completed but NULL period dates - keeping approval_pending:', {
			paypal_subscription_id: billingAgreementId,
			derived_status: derivedStatus,
			has_period_start: !!currentSub.current_period_start,
			has_period_end: !!currentSub.current_period_end,
			note: 'Period dates must be set by another webhook event before activation'
		});
	}

	// Update subscription status to active and reset failure count (only if we have valid period dates)
	// MT-3: Reset payment_failure_count to 0 on successful payment
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({
			status: derivedStatus,
			payment_failure_count: 0
		})
		.eq('paypal_subscription_id', billingAgreementId)
		.select('customer_id, payment_failure_count');

	if (updated && updated.length > 0) {
		console.log('[PayPal] Payment completed for subscription:', billingAgreementId, 'status:', derivedStatus);

		// Detect payment recovery transition: past_due → active
		if (previousStatus === 'past_due' && derivedStatus === 'active') {
			const customer = Array.isArray(currentSub.customers)
				? currentSub.customers[0]
				: currentSub.customers;

			if (customer) {
				console.log('[PayPal] Payment recovered - sending recovery email:', {
					customer_id: customer.id,
					previous_status: previousStatus,
					new_status: derivedStatus
				});

				try {
					const emailTemplate = await renderTemplate(
						'subscription_payment_recovered',
						{ customer_name: customer.name },
						env.SUPABASE_SERVICE_ROLE_KEY
					);

					await sendEmail({
						to: customer.email,
						subject: emailTemplate.subject,
						html: emailTemplate.html,
						tags: [
							{ name: 'category', value: 'subscription_payment_recovered' },
							{ name: 'customer_id', value: customer.id }
						],
						idempotencyKey: `payment_recovered/${billingAgreementId}/${Date.now()}`
					});

					console.log('[EMAIL SUCCESS] Payment recovery email sent');
				} catch (emailError) {
					console.error('[EMAIL ERROR] Failed to send payment recovery email:', emailError);
					// Alert admin - customer won't know their payment was recovered
					await alertEmailFailure({
						customerId: customer.id,
						customerEmail: customer.email,
						emailType: 'subscription_payment_recovered',
						errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
						provider: 'paypal',
						subscriptionId: billingAgreementId
					});
					// Don't throw - email failure shouldn't fail the webhook
				}
			}
		}

		// Audit log (MT-3: Track failure count reset on successful payment)
		const previousFailureCount = currentSub.payment_failure_count || 0;
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'payment_completed',
			subject: `customer:${updated[0].customer_id}`,
			metadata: {
				payment_provider: 'paypal',
				paypal_subscription_id: billingAgreementId,
				amount: resource.amount_with_breakdown?.gross_amount?.value,
				derived_status: derivedStatus,
				status_transition: previousStatus ? `${previousStatus} → ${derivedStatus}` : derivedStatus,
				payment_failure_count_reset: previousFailureCount > 0 ? previousFailureCount : undefined
			}
		});
	}
}

async function handlePaymentFailed(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;

	// Find subscription and customer
	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('*, customers(*)')
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.single();

	if (!subscription) {
		console.log('[PayPal] Subscription not found for payment failure:', paypalSubscriptionId);
		return;
	}

	// MT-3: Increment payment failure count
	// Use PayPal's failed_payments_count if available, otherwise increment our counter
	const paypalFailureCount = resource.billing_info?.failed_payments_count;
	const currentFailureCount = subscription.payment_failure_count || 0;

	// Use PayPal's count if available (more authoritative), otherwise increment ours
	const newFailureCount = paypalFailureCount !== undefined
		? paypalFailureCount
		: currentFailureCount + 1;

	console.log('[PayPal] Payment failure detected:', {
		subscription_id: paypalSubscriptionId,
		paypal_failure_count: paypalFailureCount,
		db_failure_count: currentFailureCount,
		new_failure_count: newFailureCount
	});

	// Update subscription status and increment failure count
	await supabase
		.from('subscriptions')
		.update({
			status: 'past_due',
			payment_failure_count: newFailureCount
		})
		.eq('paypal_subscription_id', paypalSubscriptionId);

	const customer = Array.isArray(subscription.customers)
		? subscription.customers[0]
		: subscription.customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for subscription:', paypalSubscriptionId);
		return;
	}

	// Determine which dunning email to send based on failure count
	const attemptCount = newFailureCount;
	const amountDue = resource.amount_with_breakdown?.gross_amount?.value || 'your subscription';

	let emailSlug: string;
	if (attemptCount === 1) {
		emailSlug = 'dunning_soft';
	} else if (attemptCount === 2) {
		emailSlug = 'dunning_retry';
	} else {
		emailSlug = 'dunning_final';
	}

	// PayPal customers update payment via PayPal account
	const updatePaymentUrl = 'https://www.paypal.com/myaccount/autopay/';

	try {
		const emailTemplate = await renderTemplate(
			emailSlug,
			{
				customer_name: customer.name,
				amount_due: `$${amountDue}`,
				update_payment_url: updatePaymentUrl
			},
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: emailSlug },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `${emailSlug}/${paypalSubscriptionId}/${attemptCount}`
		});

		console.log('[EMAIL SUCCESS] Dunning email sent:', emailSlug);
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send dunning email:', emailError);
		// CRITICAL: Alert admin - customer won't know about failed payment
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: emailSlug,
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: paypalSubscriptionId
		});
	}

	// Audit log (MT-3: Include failure count for audit trail)
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'payment_failed',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId,
			payment_failure_count: attemptCount,
			dunning_email_sent: emailSlug,
			amount_due: amountDue
		}
	});
}

async function handleSubscriptionSuspended(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;

	// Update subscription status
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({ status: 'suspended' })
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('*, customers(*)');

	if (!updated || updated.length === 0) {
		console.log('[PayPal] Subscription not found for suspension:', paypalSubscriptionId);
		return;
	}

	const customer = Array.isArray(updated[0].customers)
		? updated[0].customers[0]
		: updated[0].customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for suspended subscription');
		return;
	}

	// Send suspension notice email
	try {
		const emailTemplate = await renderTemplate(
			'subscription_suspended',
			{
				customer_name: customer.name,
				reactivate_url: 'https://www.paypal.com/myaccount/autopay/'
			},
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: 'subscription_suspended' },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `suspended/${paypalSubscriptionId}`
		});

		console.log('[EMAIL SUCCESS] Suspension notice sent');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send suspension notice:', emailError);
		// Alert admin - customer won't know their subscription is suspended
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: 'subscription_suspended',
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: paypalSubscriptionId
		});
	}

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_suspended',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId
		}
	});
}

async function handleSubscriptionCancelled(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;

	// Update subscription status
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({ status: 'canceled' })
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('*, customers(*)');

	if (!updated || updated.length === 0) {
		console.log('[PayPal] Subscription not found for cancellation:', paypalSubscriptionId);
		return;
	}

	const customer = Array.isArray(updated[0].customers)
		? updated[0].customers[0]
		: updated[0].customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for cancelled subscription');
		return;
	}

	// Send cancellation notice
	try {
		const emailTemplate = await renderTemplate(
			'canceled_notice',
			{ customer_name: customer.name },
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: 'canceled_notice' },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `canceled/${paypalSubscriptionId}`
		});

		console.log('[EMAIL SUCCESS] Cancellation notice sent');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send cancellation notice:', emailError);
		// Alert admin - customer won't receive cancellation confirmation
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: 'canceled_notice',
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: paypalSubscriptionId
		});
	}

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_canceled',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId
		}
	});
}

async function handleSubscriptionUpdated(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;
	const billingInfo = resource.billing_info;

	// Get current subscription to check existing period dates
	const { data: currentSub } = await supabase
		.from('subscriptions')
		.select('current_period_start, current_period_end')
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.single();

	// Determine new period dates
	const nextBillingTime = billingInfo?.next_billing_time;
	const currentPeriodStart = currentSub?.current_period_start;  // Keep existing if present
	const newPeriodEnd = nextBillingTime ? new Date(nextBillingTime).toISOString() : null;

	// CRITICAL: Only set 'active' if we have valid period dates
	// Without dates, QR job cannot issue codes (date comparison fails on NULL)
	const hasValidPeriod = currentPeriodStart && newPeriodEnd;
	const derivedStatus = hasValidPeriod
		? resource.status.toLowerCase()
		: 'approval_pending';  // Will be updated when PAYMENT.SALE.COMPLETED arrives with dates

	// Log fallback for operational visibility
	if (!hasValidPeriod) {
		console.warn('[PayPal] NULL period dates on update - falling back to approval_pending:', {
			paypal_subscription_id: paypalSubscriptionId,
			paypal_status: resource.status,
			derived_status: derivedStatus,
			has_period_start: !!currentPeriodStart,
			has_period_end: !!newPeriodEnd
		});
	}

	// Update subscription
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({
			status: derivedStatus,
			next_billing_time: newPeriodEnd,
			current_period_end: newPeriodEnd
		})
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('customer_id');

	if (updated && updated.length > 0) {
		console.log('[PayPal] Subscription updated:', paypalSubscriptionId, 'status:', derivedStatus);

		// Audit log
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'subscription_updated',
			subject: `customer:${updated[0].customer_id}`,
			metadata: {
				payment_provider: 'paypal',
				paypal_subscription_id: paypalSubscriptionId,
				paypal_status: resource.status,
				derived_status: derivedStatus
			}
		});
	}
}

async function handleSubscriptionReactivated(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;

	// Extract billing dates from PayPal
	const billingInfo = resource.billing_info;
	const nextBillingTime = billingInfo?.next_billing_time;
	const lastPaymentTime = billingInfo?.last_payment?.time;

	// CRITICAL: Only set 'active' if we have valid period dates
	// Without dates, QR job cannot issue codes (date comparison fails on NULL)
	const hasValidPeriod = lastPaymentTime && nextBillingTime;
	const derivedStatus = hasValidPeriod ? 'active' : 'approval_pending';

	// Log fallback for operational visibility
	if (!hasValidPeriod) {
		console.warn('[PayPal] NULL period dates on reactivation - falling back to approval_pending:', {
			paypal_subscription_id: paypalSubscriptionId,
			derived_status: derivedStatus,
			has_last_payment: !!lastPaymentTime,
			has_next_billing: !!nextBillingTime
		});
	}

	// Update subscription status from suspended -> active (with period dates if available)
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({
			status: derivedStatus,
			current_period_start: lastPaymentTime ? new Date(lastPaymentTime).toISOString() : null,
			current_period_end: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
			next_billing_time: nextBillingTime ? new Date(nextBillingTime).toISOString() : null
		})
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('*, customers(*)');

	if (!updated || updated.length === 0) {
		console.log('[PayPal] Subscription not found for reactivation:', paypalSubscriptionId);
		return;
	}

	const customer = Array.isArray(updated[0].customers)
		? updated[0].customers[0]
		: updated[0].customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for reactivated subscription');
		return;
	}

	console.log('[PayPal] Subscription reactivated:', paypalSubscriptionId, 'status:', derivedStatus);

	// Send welcome back email
	try {
		const emailTemplate = await renderTemplate(
			'subscription_reactivated',
			{
				customer_name: customer.name
			},
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: 'subscription_reactivated' },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `reactivated/${paypalSubscriptionId}`
		});

		console.log('[EMAIL SUCCESS] Reactivation email sent');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send reactivation email:', emailError);
		// Alert admin - customer won't know their subscription is reactivated
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: 'subscription_reactivated',
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: paypalSubscriptionId
		});
	}

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_reactivated',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId
		}
	});
}

async function handleSubscriptionExpired(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const paypalSubscriptionId = resource.id;

	// Update subscription status to expired
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({ status: 'expired' })
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('*, customers(*)');

	if (!updated || updated.length === 0) {
		console.log('[PayPal] Subscription not found for expiration:', paypalSubscriptionId);
		return;
	}

	const customer = Array.isArray(updated[0].customers)
		? updated[0].customers[0]
		: updated[0].customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for expired subscription');
		return;
	}

	console.log('[PayPal] Subscription expired:', paypalSubscriptionId);

	// Send subscription ended email
	try {
		const emailTemplate = await renderTemplate(
			'subscription_expired',
			{
				customer_name: customer.name
			},
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: 'subscription_expired' },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `expired/${paypalSubscriptionId}`
		});

		console.log('[EMAIL SUCCESS] Expiration notice sent');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send expiration notice:', emailError);
		// Alert admin - customer won't know their subscription expired
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: 'subscription_expired',
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: paypalSubscriptionId
		});
	}

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_expired',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId
		}
	});
}

async function handlePaymentRefunded(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient
) {
	const resource = event.resource;
	const billingAgreementId = resource.billing_agreement_id;
	const refundAmount = resource.amount_with_breakdown?.gross_amount?.value;

	console.log('[PayPal] Payment refunded:', {
		billing_agreement_id: billingAgreementId,
		amount: refundAmount
	});

	if (!billingAgreementId) {
		console.log('[PayPal] Refund not associated with subscription, skipping');
		return;
	}

	// Find subscription and customer
	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('*, customers(*)')
		.eq('paypal_subscription_id', billingAgreementId)
		.single();

	if (!subscription) {
		console.log('[PayPal] Subscription not found for refund:', billingAgreementId);
		return;
	}

	const customer = Array.isArray(subscription.customers)
		? subscription.customers[0]
		: subscription.customers;

	// Audit log for refund
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'payment_refunded',
		subject: `customer:${customer?.id || 'unknown'}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: billingAgreementId,
			refund_amount: refundAmount
		}
	});
}

async function handlePaymentReversed(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient,
	env: import('$lib/server/env').ServerEnv
) {
	const resource = event.resource;
	const billingAgreementId = resource.billing_agreement_id;
	const reversalAmount = resource.amount_with_breakdown?.gross_amount?.value;

	console.log('[PayPal] Payment reversed (chargeback):', {
		billing_agreement_id: billingAgreementId,
		amount: reversalAmount
	});

	if (!billingAgreementId) {
		console.log('[PayPal] Reversal not associated with subscription, skipping');
		return;
	}

	// Find subscription and customer
	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('*, customers(*)')
		.eq('paypal_subscription_id', billingAgreementId)
		.single();

	if (!subscription) {
		console.log('[PayPal] Subscription not found for reversal:', billingAgreementId);
		return;
	}

	const customer = Array.isArray(subscription.customers)
		? subscription.customers[0]
		: subscription.customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for chargeback:', billingAgreementId);
		return;
	}

	// Suspend subscription immediately due to chargeback
	const now = new Date().toISOString();
	await supabase
		.from('subscriptions')
		.update({
			status: 'suspended',
			chargeback_at: now
		})
		.eq('paypal_subscription_id', billingAgreementId);

	console.log('[PayPal] Subscription auto-suspended due to chargeback:', {
		subscription_id: billingAgreementId,
		customer_id: customer.id
	});

	// Send chargeback notification email to customer
	try {
		const emailTemplate = await renderTemplate(
			'subscription_chargeback',
			{
				customer_name: customer.name
			},
			env.SUPABASE_SERVICE_ROLE_KEY
		);

		await sendEmail({
			to: customer.email,
			subject: emailTemplate.subject,
			html: emailTemplate.html,
			tags: [
				{ name: 'category', value: 'subscription_chargeback' },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `chargeback/${billingAgreementId}`
		});

		console.log('[EMAIL SUCCESS] Chargeback notification sent to customer');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send chargeback notification:', emailError);
		// Alert admin - customer won't know about chargeback suspension
		await alertEmailFailure({
			customerId: customer.id,
			customerEmail: customer.email,
			emailType: 'subscription_chargeback',
			errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
			provider: 'paypal',
			subscriptionId: billingAgreementId
		});
		// Don't throw - email failure shouldn't fail the webhook
	}

	// Send admin alert via Telegram
	try {
		await sendAdminAlert(
			'🚨 *CHARGEBACK ALERT*',
			{
				provider: 'PayPal',
				customer_email: redactPII({ email: customer.email }).email,
				subscription_id: redactPII({ subscription_id: billingAgreementId }).subscription_id,
				amount: reversalAmount ? `$${reversalAmount}` : 'unknown',
				customer_id: customer.id,
				action: 'Subscription auto-suspended'
			}
		);
		console.log('[ALERT SUCCESS] Admin notified of chargeback');
	} catch (alertError) {
		console.error('[ALERT ERROR] Failed to send admin alert:', alertError);
		// Don't throw - alert failure shouldn't fail the webhook
	}

	// Audit log for reversal/chargeback with auto-suspension marker
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'payment_reversed',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: billingAgreementId,
			reversal_amount: reversalAmount,
			auto_suspended: true,
			note: 'Chargeback received - subscription auto-suspended pending review'
		}
	});
}
