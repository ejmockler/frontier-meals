import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import * as crypto from 'crypto';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Handle Update Token Consumption Endpoint
 *
 * Validates a handle update token and updates the customer's Telegram handle.
 * Tokens are one-time use, expire after 48 hours, and are SHA-256 hashed in storage.
 */
export const POST: RequestHandler = async ({ request }) => {
	const { token, newHandle } = await request.json();

	if (!token || !newHandle) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Validate handle format: @username (2-32 chars, alphanumeric + underscore)
	const handleRegex = /^@[a-zA-Z0-9_]{2,32}$/;
	if (!handleRegex.test(newHandle)) {
		return json(
			{
				error: 'Invalid handle format',
				code: 'INVALID_HANDLE_FORMAT',
				details: 'Handle must be @username with 2-32 alphanumeric characters or underscores'
			},
			{ status: 400 }
		);
	}

	// Demo mode: return success without database writes
	if (IS_DEMO_MODE) {
		logDemoAction('Handle update (demo)', { token, newHandle });
		return json({
			success: true,
			message: 'Handle updated successfully',
			new_handle: newHandle
		});
	}

	try {
		// Hash the token to match database storage
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

		// Fetch the token record
		const { data: handleToken, error: tokenError } = await supabase
			.from('handle_update_tokens')
			.select('*')
			.eq('token_hash', tokenHash)
			.single();

		if (tokenError || !handleToken) {
			return json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 });
		}

		// Check if already used
		if (handleToken.used_at) {
			return json({ error: 'Token already used', code: 'ALREADY_USED' }, { status: 400 });
		}

		// Check expiry (48 hours)
		const expiresAt = new Date(handleToken.expires_at);
		if (expiresAt < new Date()) {
			return json({ error: 'Token expired', code: 'EXPIRED' }, { status: 400 });
		}

		// Check if handle is already taken by another customer
		const { data: existingCustomer, error: checkError } = await supabase
			.from('customers')
			.select('id, telegram_handle')
			.eq('telegram_handle', newHandle)
			.neq('id', handleToken.customer_id)
			.maybeSingle();

		if (checkError) {
			console.error('[Handle Consume] Error checking handle uniqueness:', checkError);
			return json({ error: 'Database error' }, { status: 500 });
		}

		if (existingCustomer) {
			return json(
				{
					error: 'Handle already in use',
					code: 'HANDLE_TAKEN',
					details: 'This Telegram handle is already linked to another account'
				},
				{ status: 409 }
			);
		}

		// Update customer handle
		const { error: updateError } = await supabase
			.from('customers')
			.update({
				telegram_handle: newHandle,
				updated_at: new Date().toISOString()
			})
			.eq('id', handleToken.customer_id);

		if (updateError) {
			console.error('[Handle Consume] Error updating customer:', updateError);
			return json({ error: 'Failed to update handle' }, { status: 500 });
		}

		// Mark token as used
		await supabase
			.from('handle_update_tokens')
			.update({ used_at: new Date().toISOString() })
			.eq('token_hash', tokenHash);

		// Audit log
		await supabase.from('audit_log').insert({
			actor: `customer:${handleToken.customer_id}`,
			action: 'handle_updated',
			subject: `customer:${handleToken.customer_id}`,
			metadata: {
				new_handle: newHandle,
				token_consumed: true,
				correction_flow: true
			}
		});

		return json({
			success: true,
			message: 'Handle updated successfully',
			new_handle: newHandle
		});
	} catch (error) {
		console.error('[Handle Consume] Unexpected error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
