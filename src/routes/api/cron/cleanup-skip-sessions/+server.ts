import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';

/**
 * Skip Sessions Cleanup Cron Job
 *
 * ISSUE EC-4: Skip sessions cleanup function exists but no cron calls it
 *
 * Problem: Expired skip sessions (5 minute TTL) accumulate in database.
 * The cleanup function exists in migration 20251109000006_telegram_skip_sessions.sql
 * but was never wired up to a scheduled job.
 *
 * Safety:
 * - Only deletes sessions that have expired (expires_at < NOW)
 * - Uses database function with SECURITY DEFINER
 * - Logs deletion metrics for monitoring
 *
 * Schedule: Daily at 3am UTC (see .github/workflows/cron-cleanup.yml)
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async (event) => {
	const env = await getEnv(event);
	const cronSecret = event.request.headers.get('Cron-Secret');

	if (cronSecret !== env.CRON_SECRET) {
		console.error('[Cleanup Skip Sessions] Unauthorized cron attempt');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	console.log('[Cleanup Skip Sessions] Starting expired session cleanup...');

	try {
		const supabase = await getSupabaseAdmin(event);

		// Call the database function that deletes expired sessions
		// Returns the count of deleted sessions
		const { data, error: cleanupError } = await supabase.rpc('cleanup_expired_skip_sessions');

		if (cleanupError) {
			console.error('[Cleanup Skip Sessions] Error calling cleanup function:', cleanupError);
			throw cleanupError;
		}

		const deletedCount = data || 0;

		console.log('[Cleanup Skip Sessions] Cleanup complete:', {
			deleted_count: deletedCount,
			timestamp: new Date().toISOString()
		});

		// Query remaining session stats for monitoring
		const { count: totalSessions } = await supabase
			.from('telegram_skip_sessions')
			.select('telegram_user_id', { count: 'exact', head: true });

		const { count: activeSessions } = await supabase
			.from('telegram_skip_sessions')
			.select('telegram_user_id', { count: 'exact', head: true })
			.gt('expires_at', new Date().toISOString());

		console.log('[Cleanup Skip Sessions] Database stats after cleanup:', {
			total_sessions: totalSessions || 0,
			active_sessions: activeSessions || 0,
			expired_sessions_remaining: (totalSessions || 0) - (activeSessions || 0)
		});

		return json({
			success: true,
			deleted_count: deletedCount,
			stats: {
				total_sessions: totalSessions || 0,
				active_sessions: activeSessions || 0,
				expired_sessions_remaining: (totalSessions || 0) - (activeSessions || 0)
			},
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Cleanup Skip Sessions] Error during cleanup:', error);

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

/**
 * GET endpoint for testing purposes
 * Returns info about the cron job without executing it
 */
export const GET: RequestHandler = async () => {
	return json({
		endpoint: '/api/cron/cleanup-skip-sessions',
		method: 'POST',
		description: 'Cleanup expired Telegram skip sessions (5 minute TTL)',
		schedule: 'Daily at 3am UTC',
		authorization: 'Cron-Secret header required',
		database_function: 'cleanup_expired_skip_sessions()',
		retention_policy: 'Deletes sessions where expires_at < NOW()'
	});
};
