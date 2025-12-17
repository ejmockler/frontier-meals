import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } from '$env/static/private';
import { cleanupRateLimits } from '$lib/utils/rate-limit';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Rate Limit Cleanup Cron Job
 * Removes old rate limit records to prevent table bloat
 *
 * Schedule: Every hour
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 *
 * Environment variables:
 * - CRON_SECRET: Secret token for cron job authorization
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for database access
 *
 * Cloudflare Pages Cron Setup:
 * Add to wrangler.toml:
 * ```toml
 * [triggers]
 * crons = ["0 * * * *"]  # Every hour at minute 0
 * ```
 */
export const GET: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const cronSecret = request.headers.get('Cron-Secret');

  if (cronSecret !== CRON_SECRET) {
    console.error('[Cleanup Rate Limits] Unauthorized cron attempt');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cleanup Rate Limits] Starting rate limit cleanup...');

  try {
    // Clean up records older than 24 hours
    const deletedCount = await cleanupRateLimits(supabase, 24);

    console.log('[Cleanup Rate Limits] Cleanup complete:', {
      deleted_count: deletedCount,
      timestamp: new Date().toISOString()
    });

    return json({
      success: true,
      deleted_count: deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Cleanup Rate Limits] Error during cleanup:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};
