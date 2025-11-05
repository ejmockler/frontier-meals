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
  apiVersion: '2025-02-24.acacia'
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
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

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
    console.error('Error creating customer:', customerError);
    throw customerError;
  }

  // Fetch subscription details
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  // Create subscription record
  await supabase.from('subscriptions').insert({
    customer_id: customer.id,
    stripe_subscription_id: stripeSubscriptionId,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
  });

  // Initialize telegram_link_status
  await supabase.from('telegram_link_status').insert({
    customer_id: customer.id,
    is_linked: false
  });

  // Generate Telegram deep link (one-time token)
  const deepLinkToken = randomUUID();
  const tokenHash = await sha256(deepLinkToken);
  const deepLink = `https://t.me/frontier_meals_bot?start=${deepLinkToken}`;

  // Store HASHED deep link token (60-minute expiry)
  const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes
  await supabase.from('telegram_deep_link_tokens').insert({
    customer_id: customer.id,
    token_hash: tokenHash,
    expires_at: tokenExpiresAt.toISOString()
  });

  // Send Telegram link email
  const emailTemplate = getTelegramLinkEmail({
    customer_name: name,
    telegram_handle: telegramHandle || 'Not provided',
    deep_link: deepLink
  });

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

  // Log audit event
  await supabase.from('audit_log').insert({
    actor: 'system',
    action: 'subscription_created',
    subject: `customer:${customer.id}`,
    metadata: {
      stripe_customer_id: stripeCustomerId,
      email
    }
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeCustomerId = invoice.customer as string;
  const stripeSubscriptionId = invoice.subscription as string;

  if (!stripeSubscriptionId) {
    // Not a subscription invoice (e.g., one-time payment)
    return;
  }

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Update subscription with PAID period dates and active status
  // This is critical: only when invoice.paid fires do we grant access to the new period
  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString()
    })
    .eq('stripe_subscription_id', stripeSubscriptionId);

  // Log audit event
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

  console.log(`[Webhook] Invoice paid for customer ${customer.id}, period ${new Date(invoice.period_start * 1000).toISOString()} to ${new Date(invoice.period_end * 1000).toISOString()}`);
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
  if (invoice.subscription) {
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', invoice.subscription as string);
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
  await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);
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
