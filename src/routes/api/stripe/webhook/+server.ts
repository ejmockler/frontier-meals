import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { sendAdminAlert } from '$lib/utils/alerts';
import { redactPII } from '$lib/utils/logging';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

export const POST: RequestHandler = async (event) => {
  const { request, getClientAddress } = event;
  const env = await getEnv(event);
  const supabase = await getSupabaseAdmin(event);
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-12-15.clover',
    typescript: true
  });

  // Get client IP address for rate limiting
  // Priority: CF-Connecting-IP (Cloudflare) > X-Forwarded-For > getClientAddress()
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    getClientAddress() ||
    'unknown';

  // Rate limiting: 100 requests per minute per IP
  // Stripe webhooks shouldn't exceed this under normal circumstances
  // Protects against webhook replay attacks and DDoS attempts
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.webhook('stripe', clientIp),
    maxRequests: 100,
    windowMinutes: 1
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Stripe Webhook] Rate limit exceeded for IP:', redactPII({ ip: clientIp }).ip);

    // Log rate limit event for monitoring
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'webhook_rate_limit_exceeded',
      subject: `webhook:stripe:${clientIp}`,
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

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'Missing signature' }, { status: 400 });
  }

  let eventObj: Stripe.Event;

  try {
    // Use async version for Cloudflare Workers (SubtleCrypto is async-only)
    eventObj = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook] Event verified:', { event_id: eventObj.id, event_type: eventObj.type });

  // Check for duplicate events (idempotency)
  // Try to insert event record. If it fails due to unique constraint, it's a duplicate.
  const { data: existingEvent, error: insertError } = await supabase
    .from('webhook_events')
    .insert({
      source: 'stripe',
      event_id: eventObj.id,
      event_type: eventObj.type,
      status: 'processing'
    })
    .select()
    .single();

  // Check if insert failed due to unique constraint violation (PostgreSQL error code 23505)
  if (insertError?.code === '23505') {
    console.log('[Webhook] Duplicate event, skipping:', eventObj.id);
    return json({ received: true });
  }

  if (insertError) {
    console.error('[Webhook] Error inserting event:', insertError);
    return json({ error: 'Database error' }, { status: 500 });
  }

  try {
    switch (eventObj.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(eventObj.data.object as Stripe.Checkout.Session, stripe, supabase, env);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(eventObj.data.object as Stripe.Invoice, stripe, supabase);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(eventObj.data.object as Stripe.Invoice, stripe, supabase, env);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(eventObj.data.object as Stripe.Subscription, stripe, supabase, env);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(eventObj.data.object as Stripe.Subscription, stripe, supabase, env);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(eventObj.data.object as Stripe.Dispute, stripe, supabase, env);
        break;

      default:
        console.log('Unhandled event type:', eventObj.type);
    }

    // Mark event as processed
    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', eventObj.id);

    return json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);

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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient, env: import('$lib/server/env').ServerEnv) {
  const email = session.customer_details?.email;
  const name = session.customer_details?.name;
  const telegramHandle = session.custom_fields?.[0]?.text?.value;
  const stripeCustomerId = session.customer as string;
  const stripeSubscriptionId = session.subscription as string;

  if (!email || !name) {
    throw new Error('Missing customer details');
  }

  // Create customer record
  console.log('[DB] Creating customer record:', { stripeCustomerId, email, name, telegram_handle: telegramHandle });
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      stripe_customer_id: stripeCustomerId,
      email,
      name,
      telegram_handle: telegramHandle
    })
    .select()
    .single();

  if (customerError) {
    console.error('[DB ERROR] Error creating customer:', {
      code: customerError.code,
      message: customerError.message,
      details: customerError.details,
      hint: customerError.hint,
      stripeCustomerId,
      email
    });
    throw customerError;
  }

  console.log('[DB SUCCESS] Customer created:', { customer_id: customer.id, email: customer.email });

  // Fetch complete subscription data from Stripe API
  // This ensures we have period dates immediately, regardless of webhook ordering
  console.log('[Stripe API] Fetching subscription:', stripeSubscriptionId);
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items']
  });

  // In Stripe API 2025-10-29.clover (Basil 2025-03-31+), period dates moved to subscription items
  // Access from first subscription item instead of subscription level
  const firstItem = subscription.items.data[0];
  const periodStart = firstItem?.current_period_start;
  const periodEnd = firstItem?.current_period_end;

  console.log('[Stripe API] Subscription retrieved:', {
    id: subscription.id,
    status: subscription.status,
    items_count: subscription.items.data.length,
    first_item: {
      id: firstItem?.id,
      current_period_start: periodStart,
      current_period_end: periodEnd
    }
  });

  // Create subscription record with item-level period dates
  console.log('[DB] Creating subscription record:', { customer_id: customer.id, stripe_subscription_id: stripeSubscriptionId });
  const { error: subscriptionError } = await supabase.from('subscriptions').insert({
    customer_id: customer.id,
    stripe_subscription_id: stripeSubscriptionId,
    status: subscription.status,
    current_period_start: periodStart
      ? new Date(periodStart * 1000).toISOString()
      : null,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null
  });

  if (subscriptionError) {
    console.error('[DB ERROR] Error creating subscription:', {
      code: subscriptionError.code,
      message: subscriptionError.message,
      details: subscriptionError.details,
      hint: subscriptionError.hint,
      customer_id: customer.id,
      stripe_subscription_id: stripeSubscriptionId
    });
    throw subscriptionError;
  }

  console.log('[DB SUCCESS] Subscription created');

  // Initialize telegram_link_status
  console.log('[DB] Creating telegram_link_status record:', { customer_id: customer.id });
  const { error: linkStatusError } = await supabase.from('telegram_link_status').insert({
    customer_id: customer.id,
    is_linked: false
  });

  if (linkStatusError) {
    console.error('[DB ERROR] Error creating telegram_link_status:', {
      code: linkStatusError.code,
      message: linkStatusError.message,
      details: linkStatusError.details,
      hint: linkStatusError.hint,
      customer_id: customer.id
    });
    throw linkStatusError;
  }

  console.log('[DB SUCCESS] Telegram link status created');

  // Get deep link token from Stripe session metadata
  // Token was pre-generated in create-checkout and included in success URL
  const deepLinkToken = session.metadata?.deep_link_token;
  const deepLinkTokenHash = session.metadata?.deep_link_token_hash;

  if (!deepLinkToken || !deepLinkTokenHash) {
    console.error('[ERROR] Missing deep link token in session metadata');
    throw new Error('Missing deep link token');
  }

  const deepLink = `https://t.me/frontiermealsbot?start=${deepLinkToken}`;

  // Store HASHED deep link token (7-day expiry)
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  console.log('[DB] Creating telegram_deep_link_token:', { customer_id: customer.id, expires_at: tokenExpiresAt.toISOString() });
  const { error: tokenError } = await supabase.from('telegram_deep_link_tokens').insert({
    customer_id: customer.id,
    token_hash: deepLinkTokenHash,
    expires_at: tokenExpiresAt.toISOString()
  });

  if (tokenError) {
    console.error('[DB ERROR] Error creating telegram_deep_link_token:', {
      code: tokenError.code,
      message: tokenError.message,
      details: tokenError.details,
      hint: tokenError.hint,
      customer_id: customer.id
    });
    throw tokenError;
  }

  console.log('[DB SUCCESS] Telegram deep link token created');

  // Send Telegram link email
  console.log('[EMAIL] Sending telegram link email:', { to: email, customer_id: customer.id });
  try {
    const emailTemplate = await renderTemplate(
      'telegram_link',
      {
        customer_name: name,
        telegram_handle: telegramHandle || 'Not provided',
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
        { name: 'customer_id', value: customer.id }
      ],
      idempotencyKey: `telegram_link/${customer.id}`
    });
    console.log('[EMAIL SUCCESS] Telegram link email sent');
  } catch (emailError) {
    console.error('[EMAIL ERROR] Failed to send telegram link email:', {
      error: emailError,
      to: email,
      customer_id: customer.id
    });
    // Don't throw - email failure shouldn't fail the entire webhook
  }

  // Log audit event
  console.log('[DB] Creating audit_log entry for subscription_created');
  const { error: auditError } = await supabase.from('audit_log').insert({
    actor: 'system',
    action: 'subscription_created',
    subject: `customer:${customer.id}`,
    metadata: {
      stripe_customer_id: stripeCustomerId,
      email
    }
  });

  if (auditError) {
    console.error('[DB ERROR] Error creating audit_log:', {
      code: auditError.code,
      message: auditError.message,
      details: auditError.details,
      hint: auditError.hint
    });
    // Don't throw - audit log failure shouldn't fail the webhook
  } else {
    console.log('[DB SUCCESS] Audit log created');
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient) {
  const stripeCustomerId = invoice.customer as string;

  // In Stripe API 2025-10-29.clover, the subscription field was moved to parent.subscription_details.subscription
  // @ts-ignore - parent field typing may not be complete
  const stripeSubscriptionId = invoice.parent?.subscription_details?.subscription as string | undefined;

  console.log('[handleInvoicePaid] Processing invoice:', {
    invoice_id: invoice.id,
    stripe_customer_id: stripeCustomerId,
    subscription_id: stripeSubscriptionId,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    billing_reason: invoice.billing_reason
  });

  if (!stripeSubscriptionId) {
    console.log('[handleInvoicePaid] Not a subscription invoice, skipping');
    return;
  }

  // Fetch subscription from Stripe to get authoritative period dates
  // In Stripe API 2025-10-29.clover, invoice.period_start/end are deprecated
  // and represent "when invoice items were added" (single instant), NOT the billing cycle
  console.log('[Stripe API] Fetching subscription:', stripeSubscriptionId);
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items']
  });

  // Period dates are in subscription items, not invoice or subscription level
  const firstItem = subscription.items.data[0];
  const periodStart = firstItem?.current_period_start;
  const periodEnd = firstItem?.current_period_end;

  console.log('[Stripe API] Subscription retrieved:', {
    id: subscription.id,
    status: subscription.status,
    items_count: subscription.items.data.length,
    first_item_period_start: periodStart,
    first_item_period_end: periodEnd
  });

  const periodStartISO = periodStart
    ? new Date(periodStart * 1000).toISOString()
    : null;
  const periodEndISO = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;

  // Check if subscription already has valid period dates (from checkout.session.completed)
  // If so, don't overwrite with potentially stale Stripe API data
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('current_period_start, current_period_end')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .single();

  if (existingSub?.current_period_start && existingSub?.current_period_end) {
    const existingStart = new Date(existingSub.current_period_start).getTime();
    const existingEnd = new Date(existingSub.current_period_end).getTime();
    const existingDurationDays = (existingEnd - existingStart) / (1000 * 24 * 60 * 60);

    // If existing dates are valid (end > start, duration > 1 day), skip update
    if (existingEnd > existingStart && existingDurationDays > 1) {
      console.log('[handleInvoicePaid] Subscription already has valid period dates, skipping update:', {
        existing_start: existingSub.current_period_start,
        existing_end: existingSub.current_period_end,
        duration_days: existingDurationDays
      });
      return;
    }
  }

  // Validate period dates from Stripe
  if (periodStart && periodEnd) {
    if (periodEnd <= periodStart) {
      console.error('[handleInvoicePaid] CRITICAL: Invalid period dates from Stripe - end <= start:', {
        period_start: periodStartISO,
        period_end: periodEndISO,
        subscription_id: stripeSubscriptionId
      });
      throw new Error(`Invalid subscription period: end (${periodEndISO}) <= start (${periodStartISO})`);
    }

    // Calculate duration in days
    // Stripe timestamps are in SECONDS (Unix timestamps), not milliseconds
    const durationSeconds = periodEnd - periodStart;
    const durationDays = durationSeconds / (24 * 60 * 60);

    // Reject zero-duration periods (Stripe API eventual consistency issue)
    if (durationDays < 1) {
      console.error('[handleInvoicePaid] CRITICAL: Zero-duration period detected - Stripe API returned stale data:', {
        duration_days: durationDays,
        duration_seconds: durationSeconds,
        period_start: periodStartISO,
        period_end: periodEndISO,
        subscription_id: stripeSubscriptionId
      });
      console.log('[handleInvoicePaid] Skipping write to prevent data corruption');
      return;
    }

    if (durationDays < 27 || durationDays > 33) {
      console.warn('[handleInvoicePaid] WARNING: Unexpected period duration:', {
        duration_days: durationDays,
        expected: '28-31 days (monthly)',
        period_start: periodStartISO,
        period_end: periodEndISO,
        subscription_id: stripeSubscriptionId
      });
    } else {
      console.log('[handleInvoicePaid] Period validation passed:', {
        duration_days: durationDays,
        period_start: periodStartISO,
        period_end: periodEndISO
      });
    }
  }

  // UPSERT pattern: Try to update existing subscription first
  console.log('[DB] Attempting to update subscription:', { stripe_subscription_id: stripeSubscriptionId });
  const { data: updatedSubs, error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: periodStartISO,
      current_period_end: periodEndISO
    })
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .select();

  if (updateError) {
    console.error('[DB ERROR] Error updating subscription:', updateError);
    throw updateError;
  }

  // If subscription doesn't exist, create it (handles race condition where invoice.paid arrives first)
  if (!updatedSubs || updatedSubs.length === 0) {
    console.log('[handleInvoicePaid] Subscription not found, creating it (invoice.paid arrived before checkout.session.completed)');

    // Find or create customer
    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // Customer doesn't exist either - fetch from Stripe and create
      console.log('[Stripe API] Fetching customer:', stripeCustomerId);
      const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);

      if (stripeCustomer.deleted) {
        console.error('[handleInvoicePaid] Customer is deleted, cannot create subscription');
        return;
      }

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          stripe_customer_id: stripeCustomerId,
          email: stripeCustomer.email || 'unknown@example.com',
          name: stripeCustomer.name || 'Unknown'
        })
        .select()
        .single();

      if (customerError) {
        console.error('[DB ERROR] Error creating customer:', customerError);
        throw customerError;
      }

      customerId = newCustomer.id;
      console.log('[DB SUCCESS] Customer created:', { customer_id: customerId });
    }

    // Create subscription with subscription item period dates (NOT invoice dates!)
    const { error: insertError } = await supabase.from('subscriptions').insert({
      customer_id: customerId,
      stripe_subscription_id: stripeSubscriptionId,
      status: subscription.status,
      current_period_start: periodStartISO,
      current_period_end: periodEndISO
    });

    if (insertError) {
      console.error('[DB ERROR] Error creating subscription:', insertError);
      throw insertError;
    }

    console.log('[DB SUCCESS] Subscription created from invoice.paid');
  } else {
    console.log('[DB SUCCESS] Subscription updated');
  }

  // Audit log
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (customer) {
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'invoice_paid',
      subject: `customer:${customer.id}`,
      metadata: {
        invoice_id: invoice.id,
        amount_paid: invoice.amount_paid,
        period_start: periodStartISO,
        period_end: periodEndISO
      }
    });
  }

  console.log(`[handleInvoicePaid] Complete - period ${periodStartISO} to ${periodEndISO}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient, env: import('$lib/server/env').ServerEnv) {
  const stripeCustomerId = invoice.customer as string;

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Update subscription status
  // In Stripe API 2025-10-29.clover, the subscription field was moved to parent.subscription_details.subscription
  // @ts-ignore - parent field typing may not be complete
  const stripeSubscriptionId = invoice.parent?.subscription_details?.subscription as string | undefined;

  if (stripeSubscriptionId) {
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', stripeSubscriptionId);
  }

  // Generate Stripe Customer Portal session for payment method update
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: 'https://frontier-meals.com'
  });

  // Send dunning email
  const attemptCount = invoice.attempt_count || 1;
  const amountDue = `$${(invoice.amount_due / 100).toFixed(2)}`;

  let emailSlug: string;
  let templateVariables: Record<string, string>;

  if (attemptCount === 1) {
    emailSlug = 'dunning_soft';
    templateVariables = {
      customer_name: customer.name,
      amount_due: amountDue,
      update_payment_url: portalSession.url
    };
  } else if (attemptCount === 2) {
    emailSlug = 'dunning_retry';
    templateVariables = {
      customer_name: customer.name,
      update_payment_url: portalSession.url
    };
  } else {
    emailSlug = 'dunning_final';
    templateVariables = {
      customer_name: customer.name,
      amount_due: amountDue,
      update_payment_url: portalSession.url
    };
  }

  const emailTemplate = await renderTemplate(
    emailSlug,
    templateVariables,
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
    idempotencyKey: `${emailSlug}/${invoice.id}`
  });

  // Log audit event
  await supabase.from('audit_log').insert({
    actor: 'system',
    action: 'payment_failed',
    subject: `customer:${customer.id}`,
    metadata: {
      invoice_id: invoice.id,
      attempt_count: attemptCount
    }
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient, env: import('$lib/server/env').ServerEnv) {
  // In Stripe API 2025-10-29.clover (Basil 2025-03-31+), period dates moved to subscription items
  const firstItem = subscription.items?.data?.[0];
  const periodStart = firstItem?.current_period_start;
  const periodEnd = firstItem?.current_period_end;

  console.log('[handleSubscriptionUpdated] Processing subscription update:', {
    subscription_id: subscription.id,
    status: subscription.status,
    items_count: subscription.items?.data?.length,
    first_item_period_start: periodStart,
    first_item_period_end: periodEnd
  });

  // Handle NULL period dates (can happen during trials or paused subscriptions)
  const periodStartISO = periodStart
    ? new Date(periodStart * 1000).toISOString()
    : null;
  const periodEndISO = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;

  // Get current subscription state to detect status transitions
  const { data: currentSub } = await supabase
    .from('subscriptions')
    .select('status, customer_id, customers(name, email)')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  const previousStatus = currentSub?.status;
  const newStatus = subscription.status;

  // UPSERT pattern: Try to update existing subscription first
  console.log('[DB] Attempting to update subscription:', { stripe_subscription_id: subscription.id });
  const { data: updatedSubs, error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: periodStartISO,
      current_period_end: periodEndISO
    })
    .eq('stripe_subscription_id', subscription.id)
    .select();

  if (updateError) {
    console.error('[DB ERROR] Error updating subscription:', updateError);
    throw updateError;
  }

  // If subscription doesn't exist, create it (handles race condition)
  if (!updatedSubs || updatedSubs.length === 0) {
    console.log('[handleSubscriptionUpdated] Subscription not found, creating it (subscription.updated arrived before checkout.session.completed)');

    const stripeCustomerId = subscription.customer as string;

    // Find or create customer
    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // Customer doesn't exist - fetch from Stripe and create
      console.log('[Stripe API] Fetching customer:', stripeCustomerId);
      const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);

      if (stripeCustomer.deleted) {
        console.error('[handleSubscriptionUpdated] Customer is deleted, cannot create subscription');
        return;
      }

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          stripe_customer_id: stripeCustomerId,
          email: stripeCustomer.email || 'unknown@example.com',
          name: stripeCustomer.name || 'Unknown'
        })
        .select()
        .single();

      if (customerError) {
        console.error('[DB ERROR] Error creating customer:', customerError);
        throw customerError;
      }

      customerId = newCustomer.id;
      console.log('[DB SUCCESS] Customer created:', { customer_id: customerId });
    }

    // Create subscription
    const { error: insertError } = await supabase.from('subscriptions').insert({
      customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: periodStartISO,
      current_period_end: periodEndISO
    });

    if (insertError) {
      console.error('[DB ERROR] Error creating subscription:', insertError);
      throw insertError;
    }

    console.log('[DB SUCCESS] Subscription created from subscription.updated');
  } else {
    console.log('[DB SUCCESS] Subscription updated');
  }

  // Detect payment recovery transition: past_due → active
  if (previousStatus === 'past_due' && newStatus === 'active' && currentSub) {
    const customer = Array.isArray(currentSub.customers)
      ? currentSub.customers[0]
      : currentSub.customers;

    if (customer) {
      console.log('[Stripe] Payment recovered - sending recovery email:', {
        customer_id: customer.id,
        previous_status: previousStatus,
        new_status: newStatus
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
          idempotencyKey: `payment_recovered/${subscription.id}/${Date.now()}`
        });

        console.log('[EMAIL SUCCESS] Payment recovery email sent');
      } catch (emailError) {
        console.error('[EMAIL ERROR] Failed to send payment recovery email:', emailError);
        // Don't throw - email failure shouldn't fail the webhook
      }
    }
  }

  // Audit log
  const stripeCustomerId = subscription.customer as string;
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (customer) {
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'subscription_updated',
      subject: `customer:${customer.id}`,
      metadata: {
        subscription_id: subscription.id,
        status: subscription.status,
        period_start: periodStartISO,
        period_end: periodEndISO,
        status_transition: previousStatus ? `${previousStatus} → ${newStatus}` : newStatus
      }
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient, env: import('$lib/server/env').ServerEnv) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('customer_id, customers(name, email)')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (sub && sub.customers) {
    await supabase
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('stripe_subscription_id', subscription.id);

    // Send cancellation email
    const customer = Array.isArray(sub.customers) ? sub.customers[0] : sub.customers;
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
        { name: 'customer_id', value: sub.customer_id }
      ],
      idempotencyKey: `canceled_notice/${sub.customer_id}/${subscription.id}`
    });

    // Log audit event
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'subscription_canceled',
      subject: `customer:${sub.customer_id}`,
      metadata: {
        subscription_id: subscription.id
      }
    });
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute, stripe: Stripe, supabase: import('@supabase/supabase-js').SupabaseClient, env: import('$lib/server/env').ServerEnv) {
  const chargeId = dispute.charge as string;
  const disputeAmount = dispute.amount;
  const disputeReason = dispute.reason;

  console.log('[Stripe] Dispute created (chargeback):', {
    dispute_id: dispute.id,
    charge_id: chargeId,
    amount: disputeAmount,
    reason: disputeReason
  });

  // Get charge details to find the payment intent
  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['payment_intent']
  });

  const paymentIntent = charge.payment_intent as Stripe.PaymentIntent;
  if (!paymentIntent) {
    console.error('[Stripe] No payment intent found for dispute:', dispute.id);
    return;
  }

  // Find subscription by payment intent metadata or customer
  const stripeCustomerId = charge.customer as string;
  if (!stripeCustomerId) {
    console.error('[Stripe] No customer found for dispute:', dispute.id);
    return;
  }

  // First find customer by Stripe customer ID
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (!customer) {
    console.log('[Stripe] Customer not found for dispute:', stripeCustomerId);
    return;
  }

  // Find subscription by customer ID (may have multiple - get active/past_due ones)
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', customer.id)
    .in('status', ['active', 'past_due', 'trialing']);

  if (!subscriptions || subscriptions.length === 0) {
    console.log('[Stripe] No active subscription found for dispute (customer may have no active subscription):', stripeCustomerId);
    return;
  }

  // Suspend ALL active subscriptions for this customer (chargeback affects the account)
  const subscriptionIds = subscriptions.map(s => s.id);
  const subscriptionStripeIds = subscriptions.map(s => s.stripe_subscription_id).filter(Boolean);

  // Suspend all subscriptions immediately due to chargeback
  const now = new Date().toISOString();
  await supabase
    .from('subscriptions')
    .update({
      status: 'suspended',
      chargeback_at: now
    })
    .in('id', subscriptionIds);

  console.log('[Stripe] Subscriptions auto-suspended due to chargeback:', {
    subscription_count: subscriptions.length,
    subscription_ids: subscriptionStripeIds,
    customer_id: customer.id,
    dispute_id: dispute.id
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
      idempotencyKey: `chargeback/${dispute.id}`
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
        provider: 'Stripe',
        customer_email: redactPII({ email: customer.email }).email,
        subscription_id: redactPII({ subscription_id: subscriptionStripeIds[0] || 'unknown' }).subscription_id,
        amount: `$${(disputeAmount / 100).toFixed(2)}`,
        reason: disputeReason,
        dispute_id: redactPII({ dispute_id: dispute.id }).dispute_id,
        customer_id: customer.id,
        action: 'Subscription auto-suspended'
      }
    );
    console.log('[ALERT SUCCESS] Admin notified of chargeback');
  } catch (alertError) {
    console.error('[ALERT ERROR] Failed to send admin alert:', alertError);
    // Don't throw - alert failure shouldn't fail the webhook
  }

  // Audit log for dispute/chargeback with auto-suspension marker
  await supabase.from('audit_log').insert({
    actor: 'system',
    action: 'payment_reversed',
    subject: `customer:${customer.id}`,
    metadata: {
      payment_provider: 'stripe',
      stripe_subscription_ids: subscriptionStripeIds,
      subscriptions_suspended: subscriptions.length,
      dispute_id: dispute.id,
      dispute_amount: disputeAmount,
      dispute_reason: disputeReason,
      auto_suspended: true,
      note: 'Chargeback received - subscription(s) auto-suspended pending review'
    }
  });
}
