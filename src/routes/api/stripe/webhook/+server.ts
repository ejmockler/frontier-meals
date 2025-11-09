import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '$lib/email/send';
import { getTelegramLinkEmail } from '$lib/email/templates/telegram-link';
import { getDunningSoftEmail, getDunningRetryEmail, getDunningFinalEmail, getCanceledNoticeEmail } from '$lib/email/templates/dunning';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true
});

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request }) => {
  // Demo mode: ignore webhooks (safety check)
  if (IS_DEMO_MODE) {
    logDemoAction('Stripe webhook received (demo) - ignoring');
    return json({ received: true });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // Use async version for Cloudflare Workers (SubtleCrypto is async-only)
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook] Event verified:', { event_id: event.id, event_type: event.type });

  // Check for duplicate events (idempotency)
  // Try to insert event record. If it fails due to unique constraint, it's a duplicate.
  const { data: existingEvent, error: insertError } = await supabase
    .from('webhook_events')
    .insert({
      source: 'stripe',
      event_id: event.id,
      event_type: event.type,
      status: 'processing'
    })
    .select()
    .single();

  // Check if insert failed due to unique constraint violation (PostgreSQL error code 23505)
  if (insertError?.code === '23505') {
    console.log('[Webhook] Duplicate event, skipping:', event.id);
    return json({ received: true });
  }

  if (insertError) {
    console.error('[Webhook] Error inserting event:', insertError);
    return json({ error: 'Database error' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    // Mark event as processed
    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', event.id);

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
      .eq('event_id', event.id);

    return json({ error: 'Webhook processing failed' }, { status: 500 });
  }
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  console.log('[Stripe API] Subscription retrieved:', {
    id: subscription.id,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end
  });

  // Create subscription record with complete data from Stripe API
  console.log('[DB] Creating subscription record:', { customer_id: customer.id, stripe_subscription_id: stripeSubscriptionId });
  const { error: subscriptionError } = await supabase.from('subscriptions').insert({
    customer_id: customer.id,
    stripe_subscription_id: stripeSubscriptionId,
    status: subscription.status,
    current_period_start: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
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
  const emailTemplate = getTelegramLinkEmail({
    customer_name: name,
    telegram_handle: telegramHandle || 'Not provided',
    deep_link: deepLink
  });

  console.log('[EMAIL] Sending telegram link email:', { to: email, customer_id: customer.id });
  try {
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

async function handleInvoicePaid(invoice: Stripe.Invoice) {
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

  // UPSERT pattern: Try to update existing subscription first
  console.log('[DB] Attempting to update subscription:', { stripe_subscription_id: stripeSubscriptionId });
  const { data: updatedSubs, error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString()
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

    // Create subscription with invoice period dates
    const { error: insertError } = await supabase.from('subscriptions').insert({
      customer_id: customerId,
      stripe_subscription_id: stripeSubscriptionId,
      status: 'active',
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString()
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
        period_start: new Date(invoice.period_start * 1000).toISOString(),
        period_end: new Date(invoice.period_end * 1000).toISOString()
      }
    });
  }

  console.log(`[handleInvoicePaid] Complete - period ${new Date(invoice.period_start * 1000).toISOString()} to ${new Date(invoice.period_end * 1000).toISOString()}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
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

  let emailTemplate;
  let emailSlug;

  if (attemptCount === 1) {
    emailTemplate = getDunningSoftEmail({
      customer_name: customer.name,
      amount_due: amountDue,
      update_payment_url: portalSession.url
    });
    emailSlug = 'dunning_soft';
  } else if (attemptCount === 2) {
    emailTemplate = getDunningRetryEmail({
      customer_name: customer.name,
      update_payment_url: portalSession.url
    });
    emailSlug = 'dunning_retry';
  } else {
    emailTemplate = getDunningFinalEmail({
      customer_name: customer.name,
      amount_due: amountDue,
      update_payment_url: portalSession.url
    });
    emailSlug = 'dunning_final';
  }

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

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('[handleSubscriptionUpdated] Processing subscription update:', {
    subscription_id: subscription.id,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end
  });

  // Handle NULL period dates (can happen during trials or paused subscriptions)
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // UPSERT pattern: Try to update existing subscription first
  console.log('[DB] Attempting to update subscription:', { stripe_subscription_id: subscription.id });
  const { data: updatedSubs, error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: periodStart,
      current_period_end: periodEnd
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
      current_period_start: periodStart,
      current_period_end: periodEnd
    });

    if (insertError) {
      console.error('[DB ERROR] Error creating subscription:', insertError);
      throw insertError;
    }

    console.log('[DB SUCCESS] Subscription created from subscription.updated');
  } else {
    console.log('[DB SUCCESS] Subscription updated');
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
        period_start: periodStart,
        period_end: periodEnd
      }
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
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
    const emailTemplate = getCanceledNoticeEmail({ customer_name: customer.name });

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
