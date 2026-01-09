import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanupRateLimits } from '$lib/utils/rate-limit';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';

/**
 * Rate Limit Cleanup Cron Job
 * Removes old rate limit records to prevent table bloat
 *
 * Schedule: Weekly (Sunday 3am UTC)
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async (event) => {
  const env = await getEnv(event);
  const cronSecret = event.request.headers.get('Cron-Secret');

  if (cronSecret !== env.CRON_SECRET) {
    console.error('[Cleanup Rate Limits] Unauthorized cron attempt');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cleanup Rate Limits] Starting rate limit cleanup...');

  try {
    const supabase = await getSupabaseAdmin(event);
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
