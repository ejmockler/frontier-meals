import { createClient } from '@supabase/supabase-js';

/**
 * Cleanup Expired Discount Code Reservations
 *
 * Problem: When users add items to cart with discount codes, we reserve the code
 * to prevent over-redemption. However, if they abandon checkout, these reservations
 * persist and block legitimate usage.
 *
 * Solution: This job calls the database function cleanup_expired_reservations()
 * which releases expired reservations and decrements the reserved_uses counter.
 *
 * Safety:
 * - Only releases reservations that have expired (older than 15 minutes)
 * - Prevents reserved_uses from going negative using GREATEST()
 * - Uses database function with proper transaction handling
 * - Logs deletion metrics for monitoring
 *
 * Schedule: Every 5 minutes
 */
export async function cleanupDiscountReservations(config: {
	supabaseUrl: string;
	supabaseServiceKey: string;
}): Promise<{ cleaned_up: number }> {
	const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

	console.log('[Discount Cleanup] Starting expired reservation cleanup...');

	try {
		// Call the database function that cleans up expired reservations
		// Returns the count of cleaned up reservations
		const { data, error: cleanupError } = await supabase.rpc('cleanup_expired_reservations');

		if (cleanupError) {
			console.error('[Discount Cleanup] Error calling cleanup function:', cleanupError);
			throw cleanupError;
		}

		const cleanedUpCount = data || 0;

		console.log('[Discount Cleanup] Cleanup complete:', {
			cleaned_up_count: cleanedUpCount,
			timestamp: new Date().toISOString()
		});

		// Query remaining reservation stats for monitoring
		const { count: totalReservations } = await supabase
			.from('discount_code_reservations')
			.select('id', { count: 'exact', head: true });

		const { count: activeReservations } = await supabase
			.from('discount_code_reservations')
			.select('id', { count: 'exact', head: true })
			.gt('expires_at', new Date().toISOString())
			.is('redeemed_at', null);

		console.log('[Discount Cleanup] Database stats after cleanup:', {
			total_reservations: totalReservations || 0,
			active_reservations: activeReservations || 0,
			expired_reservations_remaining: (totalReservations || 0) - (activeReservations || 0)
		});

		return { cleaned_up: cleanedUpCount };
	} catch (error) {
		console.error('[Discount Cleanup] Error during cleanup:', error);
		throw error;
	}
}
