import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { verifyPayPalWebhook, type PayPalEnv } from '$lib/integrations/paypal';

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
	const { request } = event;
	const env = await getEnv(event);
	const supabase = await getSupabaseAdmin(event);

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
			case 'BILLING.SUBSCRIPTION.ACTIVATED':
				await handleSubscriptionActivated(eventObj, supabase, env);
				break;

			case 'PAYMENT.SALE.COMPLETED':
				await handlePaymentCompleted(eventObj, supabase);
				break;

			case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
				await handlePaymentFailed(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.SUSPENDED':
				await handleSubscriptionSuspended(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.CANCELLED':
				await handleSubscriptionCancelled(eventObj, supabase, env);
				break;

			case 'BILLING.SUBSCRIPTION.UPDATED':
				await handleSubscriptionUpdated(eventObj, supabase);
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

	console.log('[PayPal] Subscription activated:', {
		payer_id: paypalPayerId,
		subscription_id: paypalSubscriptionId,
		email
	});

	// Check if customer already exists (by PayPal payer ID)
	const { data: existingCustomer } = await supabase
		.from('customers')
		.select('id')
		.eq('paypal_payer_id', paypalPayerId)
		.single();

	let customerId: string;

	if (existingCustomer) {
		// Customer exists - update if needed
		customerId = existingCustomer.id;
		console.log('[PayPal] Existing customer found:', customerId);
	} else {
		// Create new customer (NO telegram_handle - will be resolved by bot)
		console.log('[DB] Creating customer record (PayPal):', {
			paypal_payer_id: paypalPayerId,
			email,
			name
		});

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

	// Create subscription record
	console.log('[DB] Creating subscription record (PayPal):', {
		customer_id: customerId,
		paypal_subscription_id: paypalSubscriptionId
	});

	const { error: subError } = await supabase.from('subscriptions').insert({
		customer_id: customerId,
		payment_provider: 'paypal',
		paypal_subscription_id: paypalSubscriptionId,
		paypal_plan_id: resource.plan_id,
		status: resource.status.toLowerCase(),
		current_period_start: lastPaymentTime ? new Date(lastPaymentTime).toISOString() : null,
		current_period_end: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
		next_billing_time: nextBillingTime ? new Date(nextBillingTime).toISOString() : null
	});

	if (subError) {
		console.error('[DB ERROR] Error creating subscription:', subError);
		throw subError;
	}

	console.log('[DB SUCCESS] Subscription created');

	// Initialize telegram_link_status
	const { error: linkStatusError } = await supabase.from('telegram_link_status').insert({
		customer_id: customerId,
		is_linked: false
	});

	if (linkStatusError && linkStatusError.code !== '23505') {
		// Ignore duplicate error
		console.error('[DB ERROR] Error creating telegram_link_status:', linkStatusError);
	}

	// Generate fresh deep link token
	const deepLinkToken = randomUUID();
	const deepLinkTokenHash = await sha256(deepLinkToken);
	const deepLink = `https://t.me/frontiermealsbot?start=${deepLinkToken}`;

	// Store token (7-day expiry)
	const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	const { error: tokenError } = await supabase.from('telegram_deep_link_tokens').insert({
		customer_id: customerId,
		token_hash: deepLinkTokenHash,
		expires_at: tokenExpiresAt.toISOString()
	});

	if (tokenError) {
		console.error('[DB ERROR] Error creating deep link token:', tokenError);
		throw tokenError;
	}

	// Send telegram_link email
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
			idempotencyKey: `telegram_link/${customerId}`
		});

		console.log('[EMAIL SUCCESS] Telegram link email sent');
	} catch (emailError) {
		console.error('[EMAIL ERROR] Failed to send telegram link email:', emailError);
		// Don't throw - email failure shouldn't fail the webhook
	}

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'subscription_created',
		subject: `customer:${customerId}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId,
			email
		}
	});
}

async function handlePaymentCompleted(
	event: PayPalWebhookEvent,
	supabase: import('@supabase/supabase-js').SupabaseClient
) {
	const resource = event.resource;
	const billingAgreementId = resource.billing_agreement_id;

	if (!billingAgreementId) {
		console.log('[PayPal] Not a subscription payment, skipping');
		return;
	}

	// Update subscription status to active
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({ status: 'active' })
		.eq('paypal_subscription_id', billingAgreementId)
		.select('customer_id');

	if (updated && updated.length > 0) {
		console.log('[PayPal] Payment completed for subscription:', billingAgreementId);

		// Audit log
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'payment_completed',
			subject: `customer:${updated[0].customer_id}`,
			metadata: {
				payment_provider: 'paypal',
				paypal_subscription_id: billingAgreementId,
				amount: resource.amount_with_breakdown?.gross_amount?.value
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

	// Update subscription status
	await supabase
		.from('subscriptions')
		.update({ status: 'past_due' })
		.eq('paypal_subscription_id', paypalSubscriptionId);

	const customer = Array.isArray(subscription.customers)
		? subscription.customers[0]
		: subscription.customers;

	if (!customer) {
		console.error('[PayPal] Customer not found for subscription:', paypalSubscriptionId);
		return;
	}

	// Determine which dunning email to send
	const attemptCount = resource.billing_info?.failed_payments_count || 1;
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

	// Audit log
	await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'payment_failed',
		subject: `customer:${customer.id}`,
		metadata: {
			payment_provider: 'paypal',
			paypal_subscription_id: paypalSubscriptionId,
			attempt_count: attemptCount
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

	// Update subscription
	const { data: updated } = await supabase
		.from('subscriptions')
		.update({
			status: resource.status.toLowerCase(),
			next_billing_time: billingInfo?.next_billing_time
				? new Date(billingInfo.next_billing_time).toISOString()
				: null,
			current_period_end: billingInfo?.next_billing_time
				? new Date(billingInfo.next_billing_time).toISOString()
				: null
		})
		.eq('paypal_subscription_id', paypalSubscriptionId)
		.select('customer_id');

	if (updated && updated.length > 0) {
		console.log('[PayPal] Subscription updated:', paypalSubscriptionId);

		// Audit log
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'subscription_updated',
			subject: `customer:${updated[0].customer_id}`,
			metadata: {
				payment_provider: 'paypal',
				paypal_subscription_id: paypalSubscriptionId,
				status: resource.status
			}
		});
	}
}
