import type { PageServerLoad } from './$types';
import { getSupabaseAdmin } from '$lib/server/env';
import { sha256 } from '$lib/utils/crypto';

/**
 * Success Page Server Load
 *
 * Checks the state of the deep link token to determine what to show the user.
 * This enables perceptually appropriate messaging:
 * - New member: Show "Welcome! Connect Telegram" flow
 * - Already member (duplicate attempt): Show "You're already covered!" recognition
 * - Token not yet activated: Show "Processing..." state
 */
export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('t');
	const provider = event.url.searchParams.get('provider') || 'paypal';

	if (!token) {
		return {
			status: 'no_token',
			message: 'Check your email for your connection link.'
		};
	}

	try {
		const supabase = await getSupabaseAdmin(event);
		const tokenHash = await sha256(token);

		// Look up the token to understand the user's state
		const { data: tokenData, error: tokenError } = await supabase
			.from('telegram_deep_link_tokens')
			.select(`
				id,
				customer_id,
				used,
				expires_at,
				customers(
					id,
					email,
					telegram_user_id,
					telegram_handle,
					subscriptions(
						id,
						status,
						current_period_end
					)
				)
			`)
			.eq('token_hash', tokenHash)
			.single();

		if (tokenError || !tokenData) {
			// Token not found - might be processing or invalid
			// Check if there's an active subscription by looking at audit logs
			const { data: auditData } = await supabase
				.from('audit_log')
				.select('metadata')
				.eq('action', 'duplicate_subscription_blocked')
				.ilike('metadata->>blocked_subscription_id', `%${tokenHash.slice(0, 16)}%`)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			if (auditData) {
				// This was a duplicate attempt - the user is already a member
				return {
					status: 'already_member',
					message: "Good news - you're already covered!"
				};
			}

			return {
				status: 'processing',
				message: 'Your subscription is being set up...'
			};
		}

		const customer = Array.isArray(tokenData.customers)
			? tokenData.customers[0]
			: tokenData.customers;

		// Check if customer already has Telegram connected
		const isTelegramLinked = customer?.telegram_user_id != null;

		// Check subscription status
		const subscriptions = customer?.subscriptions || [];
		const activeSubscription = Array.isArray(subscriptions)
			? subscriptions.find((s: { status: string }) => s.status === 'active')
			: subscriptions.status === 'active'
				? subscriptions
				: null;

		if (isTelegramLinked && activeSubscription) {
			// User is fully set up - this is a returning member or duplicate attempt
			return {
				status: 'already_member',
				message: "Welcome back! You're all set.",
				membership: {
					telegramHandle: customer.telegram_handle,
					periodEnd: activeSubscription.current_period_end
				}
			};
		}

		if (tokenData.customer_id && !isTelegramLinked) {
			// Token is activated but Telegram not yet linked - show normal flow
			return {
				status: 'new_member',
				tokenValid: true
			};
		}

		if (!tokenData.customer_id) {
			// Token exists but not yet activated - webhook still processing
			return {
				status: 'processing',
				message: 'Your subscription is being set up...'
			};
		}

		// Default: new member flow
		return {
			status: 'new_member',
			tokenValid: true
		};
	} catch (error) {
		console.error('[Success Page] Error checking membership state:', error);
		return {
			status: 'new_member',
			tokenValid: true
		};
	}
};
