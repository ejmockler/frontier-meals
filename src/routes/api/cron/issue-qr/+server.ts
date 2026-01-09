import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { issueDailyQRCodes } from '$lib/cron/issue-qr';
import {
  PUBLIC_SUPABASE_URL
} from '$env/static/public';
import {
  SUPABASE_SERVICE_ROLE_KEY,
  QR_PRIVATE_KEY_BASE64,
  CRON_SECRET
} from '$env/static/private';

/**
 * Daily QR Code Issuance Endpoint
 *
 * Triggers the daily QR code generation and email delivery.
 * Should be called once per day at 12 PM PT via Vercel Cron or similar.
 *
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const cronSecret = request.headers.get('cron-secret');

  if (cronSecret !== CRON_SECRET) {
    console.error('[Cron] Unauthorized attempt to trigger QR issuance');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Starting daily QR issuance job');

  try {
    // Decode base64-encoded private key (needed because env vars can't contain newlines)
    // Use Web APIs available in Cloudflare Workers
    const binaryString = atob(QR_PRIVATE_KEY_BASE64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const qrPrivateKey = new TextDecoder().decode(bytes);

    const results = await issueDailyQRCodes({
      supabaseUrl: PUBLIC_SUPABASE_URL,
      supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY,
      qrPrivateKey
    });

    console.log(`[Cron] Job complete. Issued: ${results.issued}, Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.error('[Cron] Errors encountered:', results.errors);
      // TODO: Send alert to @noahchonlee via Telegram
    }

    return json({
      success: true,
      issued: results.issued,
      errors: results.errors
    });
  } catch (error) {
    console.error('[Cron] Fatal error in QR issuance job:', error);

    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};

/**
 * GET endpoint for testing purposes
 * Returns info about the cron job without executing it
 */
export const GET: RequestHandler = async () => {
  return json({
    endpoint: '/api/cron/issue-qr',
    method: 'POST',
    description: 'Daily QR code issuance job',
    schedule: '12:00 PM PT (daily)',
    authorization: 'Cron-Secret header required'
  });
};
