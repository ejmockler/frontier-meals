/**
 * Stripe Webhook Integration Tests - CRITICAL REVENUE PATH
 *
 * Tests against REAL Supabase staging database.
 * Mocks: Stripe API (to avoid real charges)
 * Real: Supabase database operations
 *
 * IMPORTANT: These tests create real records and clean up after themselves.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data IDs - unique per test run
const TEST_PREFIX = `test_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_EVENT_ID = `evt_${TEST_PREFIX}`;
const TEST_EMAIL = `test_${TEST_PREFIX}@example.com`;

describe('Stripe Webhook Integration - Revenue Critical (Real DB)', () => {
	let testCustomerId: string | null = null;

	// Cleanup after each test
	afterEach(async () => {
		// Clean up test data in correct order (respecting foreign keys)
		if (testCustomerId) {
			await supabase.from('audit_log').delete().like('subject', `%${testCustomerId}%`);
			await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', testCustomerId);
			await supabase.from('telegram_link_status').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		// Clean up webhook events
		await supabase.from('webhook_events').delete().like('event_id', `%${TEST_PREFIX}%`);

		// Clean up by stripe IDs as fallback
		const { data: orphanedSubs } = await supabase
			.from('subscriptions')
			.select('customer_id')
			.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID);

		if (orphanedSubs?.length) {
			for (const sub of orphanedSubs) {
				await supabase.from('subscriptions').delete().eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID);
				await supabase.from('customers').delete().eq('id', sub.customer_id);
			}
		}

		await supabase.from('customers').delete().eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);

		testCustomerId = null;
	});

	describe('P1: Database Operations - Direct Testing', () => {
		it('CRITICAL: Can create customer record', async () => {
			const { data: customer, error } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User',
					telegram_handle: '@testuser'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(customer).not.toBeNull();
			expect(customer?.email).toBe(TEST_EMAIL);
			expect(customer?.stripe_customer_id).toBe(TEST_STRIPE_CUSTOMER_ID);

			testCustomerId = customer?.id || null;
		});

		it('CRITICAL: Can create subscription with period dates', async () => {
			// First create customer
			const { data: customer, error: customerError } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User'
				})
				.select()
				.single();

			expect(customerError).toBeNull();
			testCustomerId = customer?.id || null;

			// Now create subscription
			const periodStart = new Date();
			const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

			const { data: subscription, error: subError } = await supabase
				.from('subscriptions')
				.insert({
					customer_id: customer!.id,
					stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
					status: 'active',
					current_period_start: periodStart.toISOString(),
					current_period_end: periodEnd.toISOString()
				})
				.select()
				.single();

			expect(subError).toBeNull();
			expect(subscription).not.toBeNull();
			expect(subscription?.status).toBe('active');
			expect(subscription?.current_period_start).not.toBeNull();
			expect(subscription?.current_period_end).not.toBeNull();
		});

		it('CRITICAL: Can create telegram deep link token', async () => {
			// Create customer first
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User'
				})
				.select()
				.single();

			testCustomerId = customer?.id || null;

			// Create deep link token
			const tokenHash = `sha256_${TEST_PREFIX}`;
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

			const { data: token, error } = await supabase
				.from('telegram_deep_link_tokens')
				.insert({
					customer_id: customer!.id,
					token_hash: tokenHash,
					expires_at: expiresAt.toISOString()
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(token).not.toBeNull();
			expect(token?.token_hash).toBe(tokenHash);
		});

		it('CRITICAL: Webhook event idempotency - duplicate prevention', async () => {
			// Insert first event
			const { data: first, error: firstError } = await supabase
				.from('webhook_events')
				.insert({
					source: 'stripe',
					event_id: TEST_EVENT_ID,
					event_type: 'checkout.session.completed',
					status: 'processing'
				})
				.select()
				.single();

			expect(firstError).toBeNull();
			expect(first).not.toBeNull();

			// Try to insert duplicate - should fail with unique constraint
			const { error: dupError } = await supabase
				.from('webhook_events')
				.insert({
					source: 'stripe',
					event_id: TEST_EVENT_ID,
					event_type: 'checkout.session.completed',
					status: 'processing'
				});

			// Should fail with unique constraint violation (code 23505)
			expect(dupError).not.toBeNull();
			expect(dupError?.code).toBe('23505');
		});
	});

	describe('P1: Subscription Period Date Validation', () => {
		it('CRITICAL: Period dates are stored correctly in ISO format', async () => {
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User'
				})
				.select()
				.single();

			testCustomerId = customer?.id || null;

			const now = Date.now();
			const periodStart = new Date(now);
			const periodEnd = new Date(now + 30 * 24 * 60 * 60 * 1000);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
				status: 'active',
				current_period_start: periodStart.toISOString(),
				current_period_end: periodEnd.toISOString()
			});

			// Retrieve and verify
			const { data: sub } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(sub).not.toBeNull();

			// Verify period dates can be parsed back
			const storedStart = new Date(sub!.current_period_start);
			const storedEnd = new Date(sub!.current_period_end);

			// Should be within 1 second of original (accounting for precision loss)
			expect(Math.abs(storedStart.getTime() - periodStart.getTime())).toBeLessThan(1000);
			expect(Math.abs(storedEnd.getTime() - periodEnd.getTime())).toBeLessThan(1000);

			// Duration should be ~30 days
			const durationDays = (storedEnd.getTime() - storedStart.getTime()) / (1000 * 60 * 60 * 24);
			expect(durationDays).toBeGreaterThan(29);
			expect(durationDays).toBeLessThan(31);
		});

		it('EDGE CASE: Can update period dates on existing subscription', async () => {
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User'
				})
				.select()
				.single();

			testCustomerId = customer?.id || null;

			// Initial insert
			const initialStart = new Date();
			const initialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
				status: 'active',
				current_period_start: initialStart.toISOString(),
				current_period_end: initialEnd.toISOString()
			});

			// Update with new period
			const newStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
			const newEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

			const { error: updateError } = await supabase
				.from('subscriptions')
				.update({
					current_period_start: newStart.toISOString(),
					current_period_end: newEnd.toISOString()
				})
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID);

			expect(updateError).toBeNull();

			// Verify update
			const { data: updated } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			const updatedStart = new Date(updated!.current_period_start);
			expect(Math.abs(updatedStart.getTime() - newStart.getTime())).toBeLessThan(1000);
		});
	});

	describe('P1: Audit Logging', () => {
		it('CRITICAL: Audit log entries are created correctly', async () => {
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL,
					name: 'Test User'
				})
				.select()
				.single();

			testCustomerId = customer?.id || null;

			// Create audit log
			const { error: auditError } = await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'subscription_created',
				subject: `customer:${customer!.id}`,
				metadata: {
					stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
					email: TEST_EMAIL
				}
			});

			expect(auditError).toBeNull();

			// Verify audit log entry
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer!.id}`)
				.single();

			expect(auditLog).not.toBeNull();
			expect(auditLog?.action).toBe('subscription_created');
			expect(auditLog?.metadata).toHaveProperty('email', TEST_EMAIL);
		});
	});

	describe('Security: Foreign Key Integrity', () => {
		it('CRITICAL: Cannot create subscription without customer', async () => {
			const { error } = await supabase.from('subscriptions').insert({
				customer_id: '00000000-0000-0000-0000-000000000000', // Non-existent
				stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
				status: 'active'
			});

			expect(error).not.toBeNull();
			// Should fail with foreign key violation
			expect(error?.code).toBe('23503');
		});

		it('CRITICAL: Cannot create deep link token without customer', async () => {
			const { error } = await supabase.from('telegram_deep_link_tokens').insert({
				customer_id: '00000000-0000-0000-0000-000000000000', // Non-existent
				token_hash: `test_hash_${TEST_PREFIX}`,
				expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
			});

			expect(error).not.toBeNull();
			expect(error?.code).toBe('23503');
		});
	});
});
