import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true
});

export const POST: RequestHandler = async ({ url, request, getClientAddress }) => {
  // Demo mode: return mock checkout URL without Stripe interaction
  if (IS_DEMO_MODE) {
    logDemoAction('Create Stripe checkout session (demo)');
    return json({ url: `${url.origin}/demo-checkout` });
  }

  // Get client IP address for rate limiting
  // Priority: CF-Connecting-IP (Cloudflare) > X-Forwarded-For > getClientAddress()
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    getClientAddress() ||
    'unknown';

  // Rate limiting: 5 requests per minute per IP
  // Prevents checkout spam and abuse
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.checkout(clientIp),
    maxRequests: 5,
    windowMinutes: 1
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Stripe Checkout] Rate limit exceeded for IP:', clientIp);

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
    // Generate deep link token BEFORE checkout
    // This allows us to pass it in the success URL without an API call
    const deepLinkToken = randomUUID();
    const deepLinkTokenHash = await sha256(deepLinkToken);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_PRICE_ID, // Use the configured Price ID
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
      success_url: `${url.origin}/success?session_id={CHECKOUT_SESSION_ID}&t=${deepLinkToken}`,
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
        source: 'web_landing',
        deep_link_token: deepLinkToken,
        deep_link_token_hash: deepLinkTokenHash
      }
    });

    return json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
};
