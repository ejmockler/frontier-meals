import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';

/**
 * Expired Token Cleanup Cron Job
 *
 * ISSUE EC-1: No cleanup cron for abandoned checkout tokens
 *
 * Problem: Tokens created at checkout but never used (user abandons) accumulate in database.
 * This job removes expired AND unused tokens to prevent database bloat.
 *
 * Safety:
 * - Only deletes tokens that are BOTH expired AND unused
 * - Preserves tokens that were used (for audit trail)
 * - Logs deletion metrics for monitoring
 *
 * Schedule: Daily at 2am UTC (see .github/workflows/cron-cleanup.yml)
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async (event) => {
	const env = await getEnv(event);
	const cronSecret = event.request.headers.get('Cron-Secret');

	if (cronSecret !== env.CRON_SECRET) {
		console.error('[Cleanup Tokens] Unauthorized cron attempt');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	console.log('[Cleanup Tokens] Starting expired token cleanup...');

	try {
		const supabase = await getSupabaseAdmin(event);
		const now = new Date().toISOString();

		// Delete tokens that are BOTH expired AND unused
		// Keep used tokens for audit trail (they might be referenced in audit_log)
		const { data: deletedTokens, error: deleteError } = await supabase
			.from('telegram_deep_link_tokens')
			.delete()
			.lt('expires_at', now) // Expired
			.eq('used', false) // AND unused
			.select('id, expires_at, paypal_custom_id');

		if (deleteError) {
			console.error('[Cleanup Tokens] Error deleting expired tokens:', deleteError);
			throw deleteError;
		}

		const deletedCount = deletedTokens?.length || 0;

		// Calculate breakdown by type
		const paypalTokens = deletedTokens?.filter(t => t.paypal_custom_id !== null).length || 0;
		const stripeTokens = deletedTokens?.filter(t => t.paypal_custom_id === null).length || 0;

		console.log('[Cleanup Tokens] Cleanup complete:', {
			total_deleted: deletedCount,
			paypal_checkout_tokens: paypalTokens,
			stripe_tokens: stripeTokens,
			timestamp: now
		});

		// Query remaining token stats for monitoring
		const { count: totalTokens } = await supabase
			.from('telegram_deep_link_tokens')
			.select('id', { count: 'exact', head: true });

		const { count: unusedTokens } = await supabase
			.from('telegram_deep_link_tokens')
			.select('id', { count: 'exact', head: true })
			.eq('used', false);

		const { count: expiredButUsed } = await supabase
			.from('telegram_deep_link_tokens')
			.select('id', { count: 'exact', head: true })
			.lt('expires_at', now)
			.eq('used', true);

		console.log('[Cleanup Tokens] Database stats after cleanup:', {
			total_tokens: totalTokens || 0,
			unused_active_tokens: (unusedTokens || 0),
			expired_but_used_tokens: expiredButUsed || 0
		});

		return json({
			success: true,
			deleted_count: deletedCount,
			breakdown: {
				paypal_checkout_tokens: paypalTokens,
				stripe_tokens: stripeTokens
			},
			stats: {
				total_tokens: totalTokens || 0,
				unused_active_tokens: unusedTokens || 0,
				expired_but_used_tokens: expiredButUsed || 0
			},
			timestamp: now
		});
	} catch (error) {
		console.error('[Cleanup Tokens] Error during cleanup:', error);

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
