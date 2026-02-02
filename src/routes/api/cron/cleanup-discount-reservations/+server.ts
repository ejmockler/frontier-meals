import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, getSupabaseAdmin } from '$lib/server/env';
import { cleanupDiscountReservations } from '$lib/cron/cleanup-discount-reservations';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * Discount Code Reservation Cleanup Cron Job
 *
 * Problem: When users add items to cart with discount codes, we reserve the code
 * to prevent over-redemption. However, if they abandon checkout, these reservations
 * persist and block legitimate usage.
 *
 * Solution: This job calls cleanup_expired_reservations() database function every
 * 5 minutes to release expired reservations and decrement reserved_uses counter.
 *
 * Safety:
 * - Only releases reservations older than 15 minutes
 * - Prevents reserved_uses from going negative using GREATEST()
 * - Uses database function with proper transaction handling
 * - Logs deletion metrics for monitoring
 *
 * Schedule: Every 5 minutes (see GitHub Actions workflow)
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async (event) => {
	const env = await getEnv(event);
	const cronSecret = event.request.headers.get('Cron-Secret');

	if (cronSecret !== env.CRON_SECRET) {
		console.error('[Discount Cleanup] Unauthorized cron attempt');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	console.log('[Discount Cleanup] Starting cron job...');

	try {
		const result = await cleanupDiscountReservations({
			supabaseUrl: PUBLIC_SUPABASE_URL,
			supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY
		});

		// Query stats after cleanup using admin client
		const supabase = await getSupabaseAdmin(event);

		const { count: totalReservations } = await supabase
			.from('discount_code_reservations')
			.select('id', { count: 'exact', head: true });

		const { count: activeReservations } = await supabase
			.from('discount_code_reservations')
			.select('id', { count: 'exact', head: true })
			.gt('expires_at', new Date().toISOString())
			.is('redeemed_at', null);

		return json({
			success: true,
			cleaned_up: result.cleaned_up,
			stats: {
				total_reservations: totalReservations || 0,
				active_reservations: activeReservations || 0,
				expired_reservations_remaining: (totalReservations || 0) - (activeReservations || 0)
			},
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Discount Cleanup] Error during cleanup:', error);

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
		endpoint: '/api/cron/cleanup-discount-reservations',
		method: 'POST',
		description: 'Cleanup expired discount code reservations (15 minute TTL)',
		schedule: 'Every 5 minutes',
		authorization: 'Cron-Secret header required',
		database_function: 'cleanup_expired_reservations()',
		retention_policy: 'Releases reservations where expires_at < NOW() AND redeemed_at IS NULL'
	});
};
