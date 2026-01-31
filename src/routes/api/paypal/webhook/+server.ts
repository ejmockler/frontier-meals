import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { verifyPayPalWebhook, type PayPalEnv } from '$lib/integrations/paypal';
import { redactPII } from '$lib/utils/logging';
import { sendAdminAlert } from '$lib/utils/alerts';
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
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'webhook_rate_limit_exceeded',
			subject: `webhook:paypal:${clientIp}`,
			metadata: {
				ip: redactPII({ ip: clientIp }).ip,
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

	// Idempotency check (same pattern as Stripe)
	const { error: insertError } = await supabase
		.from('webhook_events')
		.insert({
			source: 'paypal',
			event_id: eventObj.id,
			event_type: eventObj.event_type,
			status: 'processing'
		});

	// Check for duplicate (PostgreSQL error code 23505)
	if (insertError?.code === '23505') {
		console.log('[PayPal Webhook] Duplicate event, skipping:', eventObj.id);
		return json({ received: true });
	}

	if (insertError) {
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

	// Check if customer already exists (by PayPal payer ID)
	const { data: existingCustomer } = await supabase
		.from('customers')
		.select('id')
		.eq('paypal_payer_id', paypalPayerId)
		.single();

	let customerId: string;

	if (existingCustomer) {
		// Customer exists - update with latest PayPal info (email/name may have changed)
		customerId = existingCustomer.id;
		console.log('[PayPal] Existing customer found, updating:', customerId);

		await supabase
			.from('customers')
			.update({
				email,
				name
			})
			.eq('id', customerId);
	} else {
		// Create new customer (NO telegram_handle - will be resolved by bot)
		console.log(
			'[DB] Creating customer record (PayPal):',
			redactPII({
				paypal_payer_id: paypalPayerId,
				email,
				name
			})
		);

		const { data: customer, error: customerError } = await supabase
			.from('customers')
			.insert({
				payment_provider: 'paypal',
				paypal_payer_id: paypalPayerId,
				email,
				name,
				telegram_handle: null // Will be set by Telegram bot interaction
			})
			.select()
			.single();

		if (customerError) {
			console.error('[DB ERROR] Error creating customer:', customerError);
			throw customerError;
		}

		customerId = customer.id;
		console.log('[DB SUCCESS] Customer created:', customerId);
	}

	// Extract billing dates from PayPal
	const billingInfo = resource.billing_info;
	const nextBillingTime = billingInfo?.next_billing_time;
	const lastPaymentTime = billingInfo?.last_payment?.time;

	// CRITICAL: Only set 'active' if we have valid period dates
	// Without dates, QR job cannot issue codes (date comparison fails on NULL)
	// QR job queries: .lte('current_period_start', today) AND .gte('current_period_end', today)
	const hasValidPeriod = lastPaymentTime && nextBillingTime;
	const derivedStatus = hasValidPeriod
		? resource.status.toLowerCase()
		: 'approval_pending';  // Will be updated when PAYMENT.SALE.COMPLETED arrives with dates

	// Log fallback for operational visibility
	if (!hasValidPeriod) {
		console.warn('[PayPal] NULL period dates detected - falling back to approval_pending:', {
			paypal_subscription_id: paypalSubscriptionId,
			paypal_status: resource.status,
			derived_status: derivedStatus,
			has_last_payment: !!lastPaymentTime,
			has_next_billing: !!nextBillingTime
		});
	}

	// UPSERT subscription record (idempotent - handles duplicate ACTIVATED webhooks)
	console.log(
		'[DB] Upserting subscription record (PayPal):',
		redactPII({
			customer_id: customerId,
			paypal_subscription_id: paypalSubscriptionId,
			status: derivedStatus
		})
	);

	const { error: subError } = await supabase
		.from('subscriptions')
		.upsert(
			{
				customer_id: customerId,
				payment_provider: 'paypal',
				paypal_subscription_id: paypalSubscriptionId,
				paypal_plan_id: resource.plan_id,
				status: derivedStatus,
				current_period_start: lastPaymentTime ? new Date(lastPaymentTime).toISOString() : null,
				current_period_end: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
				next_billing_time: nextBillingTime ? new Date(nextBillingTime).toISOString() : null
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

	// Initialize telegram_link_status
	const { error: linkStatusError } = await supabase.from('telegram_link_status').insert({
		customer_id: customerId,
		is_linked: false
	});

	if (linkStatusError && linkStatusError.code !== '23505') {
		// Ignore duplicate error
		console.error('[DB ERROR] Error creating telegram_link_status:', linkStatusError);
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
	let customData: { token: string; reservation_id?: string; email?: string };
	try {
		// Try parsing as JSON first (new format with discount codes)
		customData = JSON.parse(paypalCustomId);
		console.log('[PayPal Webhook] Parsed custom_id as JSON:', {
			has_token: !!customData.token,
			has_reservation: !!customData.reservation_id
		});
	} catch {
		// Fall back to plain hash (legacy format)
		const SHA256_REGEX = /^[a-f0-9]{64}$/i;
		if (!SHA256_REGEX.test(paypalCustomId)) {
			console.error('[PayPal Webhook] Invalid custom_id format:', {
				length: paypalCustomId.length,
				prefix: paypalCustomId.slice(0, 8)
			});
			throw new Error('Invalid custom_id format in PayPal subscription');
		}
		customData = { token: paypalCustomId };
		console.log('[PayPal Webhook] Using legacy custom_id format (plain hash)');
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
			// Don't throw - email failure shouldn't fail the webhook
		}
	} else {
		console.log('[EMAIL SKIP] Email already sent (duplicate webhook or race condition)');
	}

	// ============================================================================
	// DISCOUNT CODE REDEMPTION
	// ============================================================================
	// If reservation_id exists in custom_id, redeem the discount code
	// This is idempotent - safe to call multiple times
	// ============================================================================

	if (customData.reservation_id) {
		try {
			console.log('[PayPal Webhook] Redeeming discount code for reservation:', {
				reservation_id: customData.reservation_id,
				customer_id: customerId,
				paypal_subscription_id: paypalSubscriptionId
			});

			const { data: redeemed, error: redeemError } = await supabase.rpc('redeem_discount_code', {
				p_reservation_id: customData.reservation_id,
				p_customer_id: customerId,
				p_paypal_subscription_id: paypalSubscriptionId
			});

			if (redeemError) {
				// Log error but don't fail the webhook
				// The subscription is already created, redemption failure shouldn't block
				console.error('[PayPal Webhook] Error redeeming discount code (non-fatal):', {
					error: redeemError.message,
					reservation_id: customData.reservation_id
				});

				// Audit log for failed redemption
				await supabase.from('audit_log').insert({
					actor: 'system',
					action: 'discount_redemption_failed',
					subject: `customer:${customerId}`,
					metadata: {
						payment_provider: 'paypal',
						paypal_subscription_id: paypalSubscriptionId,
						reservation_id: customData.reservation_id,
						error: redeemError.message
					}
				});
			} else if (redeemed) {
				console.log('[PayPal Webhook] ✓ Discount code redeemed successfully');

				// Audit log for successful redemption
				await supabase.from('audit_log').insert({
					actor: 'system',
					action: 'discount_redeemed',
					subject: `customer:${customerId}`,
					metadata: {
						payment_provider: 'paypal',
						paypal_subscription_id: paypalSubscriptionId,
						reservation_id: customData.reservation_id
					}
				});
			}
		} catch (error) {
			// Catch any unexpected errors - don't fail the webhook
			console.error('[PayPal Webhook] Unexpected error during discount redemption (non-fatal):', error);
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
