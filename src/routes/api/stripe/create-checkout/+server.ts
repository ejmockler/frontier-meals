import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true
});

export const POST: RequestHandler = async ({ url }) => {
  // Demo mode: return mock checkout URL without Stripe interaction
  if (IS_DEMO_MODE) {
    logDemoAction('Create Stripe checkout session (demo)');
    return json({ url: `${PUBLIC_SITE_URL}/demo-checkout` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Frontier Meals Daily Subscription',
              description: 'Fresh chef-prepared meal delivered daily'
            },
            recurring: {
              interval: 'month'
            },
            unit_amount: 36000 // $360/month (30 days × $12/day)
          },
          quantity: 1
        }
      ],
      custom_fields: [
        {
          key: 'telegram_handle',
          label: {
            type: 'custom',
            custom: 'Telegram Handle (e.g. @username)'
          },
          type: 'text'
        }
      ],
      success_url: `${url.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      consent_collection: {
        terms_of_service: 'required'
      },
      custom_text: {
        terms_of_service_acceptance: {
          message: `By subscribing to Frontier Meals, you agree to receive daily QR codes via email and manage your subscription through our Telegram bot.`
        }
      },
      metadata: {
        source: 'web_landing'
      }
    });

    return json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
};
