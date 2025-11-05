import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { sha256 } from '$lib/utils/crypto';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Handle Update Page Load
 *
 * Validates the token exists and loads customer information for form pre-fill.
 */
export const load: PageServerLoad = async ({ params }) => {
	const { token } = params;

	if (!token) {
		throw error(400, 'Missing token');
	}

	try {
		// Hash the token to match database storage
		const tokenHash = await sha256(token);

		// Fetch the token record
		const { data: handleToken, error: tokenError } = await supabase
			.from('handle_update_tokens')
			.select('customer_id, expires_at, used_at')
			.eq('token_hash', tokenHash)
			.single();

		if (tokenError || !handleToken) {
			throw error(404, 'Invalid token');
		}

		// Check if already used
		if (handleToken.used_at) {
			throw error(410, 'This link has already been used');
		}

		// Check expiry (48 hours)
		const expiresAt = new Date(handleToken.expires_at);
		if (expiresAt < new Date()) {
			throw error(410, 'This link has expired');
		}

		// Fetch customer data to pre-fill the form
		const { data: customer, error: customerError } = await supabase
			.from('customers')
			.select('telegram_handle')
			.eq('id', handleToken.customer_id)
			.single();

		if (customerError || !customer) {
			throw error(404, 'Customer not found');
		}

		return {
			token,
			prefilled_handle: customer.telegram_handle || ''
		};
	} catch (err) {
		// Re-throw SvelteKit error objects
		if (err instanceof Response) {
			throw err;
		}

		console.error('[Handle Update Page] Error loading:', err);
		throw error(500, 'Failed to load page');
	}
};
