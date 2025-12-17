/**
 * Telegram /start Integration Tests - CRITICAL ACTIVATION PATH
 *
 * Tests against REAL Supabase staging database.
 * Tests the database operations that the Telegram webhook relies on.
 *
 * IMPORTANT: These tests create real records and clean up after themselves.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data IDs - unique per test run
const TEST_PREFIX = `telegram_test_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_EMAIL = `telegram_test_${TEST_PREFIX}@example.com`;

describe('Telegram /start Integration - Activation Critical (Real DB)', () => {
	let testCustomerId: string | null = null;

	// Cleanup after each test
	afterEach(async () => {
		if (testCustomerId) {
			await supabase.from('audit_log').delete().like('subject', `%${testCustomerId}%`);
			await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', testCustomerId);
			await supabase.from('telegram_link_status').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		await supabase.from('customers').delete().eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);
		testCustomerId = null;
	});

	// Helper to create test customer with deep link token
	async function createTestCustomerWithToken(options: { expired?: boolean; used?: boolean } = {}) {
		const { data: customer } = await supabase
			.from('customers')
			.insert({
				stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
				email: TEST_EMAIL,
				name: 'Telegram Test User'
			})
			.select()
			.single();

		testCustomerId = customer?.id || null;

		const periodStart = new Date();
		const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

		await supabase.from('subscriptions').insert({
			customer_id: customer!.id,
			stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
			status: 'active',
			current_period_start: periodStart.toISOString(),
			current_period_end: periodEnd.toISOString()
		});

		// Create telegram link status
		await supabase.from('telegram_link_status').insert({
			customer_id: customer!.id,
			is_linked: false
		});

		// Create deep link token
		const expiresAt = options.expired
			? new Date(Date.now() - 24 * 60 * 60 * 1000) // Expired yesterday
			: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

		const tokenHash = `sha256_${TEST_PREFIX}_${Date.now()}`;

		const { data: token } = await supabase
			.from('telegram_deep_link_tokens')
			.insert({
				customer_id: customer!.id,
				token_hash: tokenHash,
				expires_at: expiresAt.toISOString(),
				used: options.used || false,
				used_at: options.used ? new Date().toISOString() : null
			})
			.select()
			.single();

		return { customer: customer!, token: token!, tokenHash };
	}

	describe('P1: Deep Link Token Validation', () => {
		it('CRITICAL: Can lookup token by hash', async () => {
			const { token, tokenHash } = await createTestCustomerWithToken();

			const { data: found, error } = await supabase
				.from('telegram_deep_link_tokens')
				.select('*')
				.eq('token_hash', tokenHash)
				.single();

			expect(error).toBeNull();
			expect(found).not.toBeNull();
			expect(found?.customer_id).toBe(testCustomerId);
		});

		it('CRITICAL: Can check if token is expired', async () => {
			const { token } = await createTestCustomerWithToken({ expired: true });

			const now = new Date();
			const tokenExpires = new Date(token.expires_at);

			expect(tokenExpires.getTime()).toBeLessThan(now.getTime());
		});

		it('CRITICAL: Can check if token is already used', async () => {
			const { token } = await createTestCustomerWithToken({ used: true });

			expect(token.used).toBe(true);
			expect(token.used_at).not.toBeNull();
		});

		it('CRITICAL: Valid token passes all checks', async () => {
			const { token } = await createTestCustomerWithToken();

			const now = new Date();
			const tokenExpires = new Date(token.expires_at);

			// Not expired
			expect(tokenExpires.getTime()).toBeGreaterThan(now.getTime());
			// Not used
			expect(token.used).toBe(false);
		});
	});

	describe('P1: Account Linking Operations', () => {
		it('CRITICAL: Can update customer with telegram_user_id', async () => {
			const { customer } = await createTestCustomerWithToken();
			const telegramUserId = 123456789;

			const { error } = await supabase
				.from('customers')
				.update({ telegram_user_id: telegramUserId })
				.eq('id', customer.id);

			expect(error).toBeNull();

			// Verify
			const { data: updated } = await supabase
				.from('customers')
				.select('telegram_user_id')
				.eq('id', customer.id)
				.single();

			expect(updated?.telegram_user_id).toBe(telegramUserId);
		});

		it('CRITICAL: Can mark token as used', async () => {
			const { token } = await createTestCustomerWithToken();

			const usedAt = new Date().toISOString();
			const { error } = await supabase
				.from('telegram_deep_link_tokens')
				.update({ used: true, used_at: usedAt })
				.eq('id', token.id);

			expect(error).toBeNull();

			// Verify
			const { data: updated } = await supabase
				.from('telegram_deep_link_tokens')
				.select('used, used_at')
				.eq('id', token.id)
				.single();

			expect(updated?.used).toBe(true);
			expect(updated?.used_at).not.toBeNull();
		});

		it('CRITICAL: Can update telegram_link_status', async () => {
			const { customer } = await createTestCustomerWithToken();

			const { error } = await supabase
				.from('telegram_link_status')
				.update({ is_linked: true, last_seen_at: new Date().toISOString() })
				.eq('customer_id', customer.id);

			expect(error).toBeNull();

			// Verify
			const { data: status } = await supabase
				.from('telegram_link_status')
				.select('is_linked, last_seen_at')
				.eq('customer_id', customer.id)
				.single();

			expect(status?.is_linked).toBe(true);
			expect(status?.last_seen_at).not.toBeNull();
		});
	});

	describe('P1: Already Linked Customer Detection', () => {
		it('CRITICAL: Can find customer by telegram_user_id', async () => {
			const { customer } = await createTestCustomerWithToken();
			const telegramUserId = 987654321;

			// Link the customer
			await supabase
				.from('customers')
				.update({ telegram_user_id: telegramUserId })
				.eq('id', customer.id);

			// Find by telegram user id
			const { data: found, error } = await supabase
				.from('customers')
				.select('*')
				.eq('telegram_user_id', telegramUserId)
				.single();

			expect(error).toBeNull();
			expect(found).not.toBeNull();
			expect(found?.id).toBe(customer.id);
		});

		it('CRITICAL: Not linked customer returns null', async () => {
			await createTestCustomerWithToken();

			const { data, error } = await supabase
				.from('customers')
				.select('*')
				.eq('telegram_user_id', 999999999) // Non-existent
				.single();

			expect(data).toBeNull();
			expect(error?.code).toBe('PGRST116'); // No rows found
		});
	});

	describe('P1: Audit Logging', () => {
		it('CRITICAL: Can create audit log entry for linking', async () => {
			const { customer } = await createTestCustomerWithToken();

			const { error } = await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'telegram_linked',
				subject: `customer:${customer.id}`,
				metadata: {
					telegram_user_id: 123456789,
					telegram_username: 'testuser'
				}
			});

			expect(error).toBeNull();

			// Verify
			const { data: log } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer.id}`)
				.single();

			expect(log).not.toBeNull();
			expect(log?.action).toBe('telegram_linked');
		});
	});

	describe('Edge Cases', () => {
		it('EDGE CASE: Non-existent token hash returns null', async () => {
			await createTestCustomerWithToken();

			const { data, error } = await supabase
				.from('telegram_deep_link_tokens')
				.select('*')
				.eq('token_hash', 'sha256_nonexistent')
				.single();

			expect(data).toBeNull();
			expect(error?.code).toBe('PGRST116');
		});

		it('EDGE CASE: Multiple tokens per customer', async () => {
			const { customer } = await createTestCustomerWithToken();

			// Create second token
			const tokenHash2 = `sha256_${TEST_PREFIX}_2`;
			await supabase.from('telegram_deep_link_tokens').insert({
				customer_id: customer.id,
				token_hash: tokenHash2,
				expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
				used: false
			});

			// Query all tokens for customer
			const { data: tokens } = await supabase
				.from('telegram_deep_link_tokens')
				.select('*')
				.eq('customer_id', customer.id);

			expect(tokens?.length).toBe(2);
		});
	});

	describe('P1: Security Constraints', () => {
		it('CRITICAL: Token foreign key requires valid customer', async () => {
			const { error } = await supabase.from('telegram_deep_link_tokens').insert({
				customer_id: '00000000-0000-0000-0000-000000000000',
				token_hash: 'sha256_orphan',
				expires_at: new Date().toISOString(),
				used: false
			});

			expect(error).not.toBeNull();
			expect(error?.code).toBe('23503'); // Foreign key violation
		});
	});
});
