/**
 * QR Issuance Integration Tests - CRITICAL DELIVERY PATH
 *
 * Tests against REAL Supabase staging database.
 * Tests the database operations that the QR issuance job relies on.
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
const TEST_PREFIX = `qr_test_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_EMAIL = `qr_test_${TEST_PREFIX}@example.com`;

describe('QR Issuance Integration - Delivery Critical (Real DB)', () => {
	let testCustomerId: string | null = null;

	// Cleanup after each test
	afterEach(async () => {
		if (testCustomerId) {
			// Delete in order respecting foreign keys
			await supabase.from('qr_tokens').delete().eq('customer_id', testCustomerId);
			await supabase.from('entitlements').delete().eq('customer_id', testCustomerId);
			await supabase.from('skips').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		// Fallback cleanup by stripe ID
		await supabase.from('customers').delete().eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);

		testCustomerId = null;
	});

	// Helper to create test customer with subscription
	async function createTestCustomerWithSubscription() {
		const { data: customer } = await supabase
			.from('customers')
			.insert({
				stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
				email: TEST_EMAIL,
				name: 'QR Test User'
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

		return customer!;
	}

	describe('P1: QR Token Database Operations', () => {
		it('CRITICAL: Can create QR token for customer', async () => {
			const customer = await createTestCustomerWithSubscription();

			const today = new Date().toISOString().split('T')[0];
			const expiresAt = new Date();
			expiresAt.setHours(23, 59, 59, 999);

			const { data: qrToken, error } = await supabase
				.from('qr_tokens')
				.insert({
					customer_id: customer.id,
					jti: `jti_${TEST_PREFIX}_${Date.now()}`,
					short_code: `FM-${Math.floor(1000 + Math.random() * 9000)}`,
					service_date: today,
					expires_at: expiresAt.toISOString()
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(qrToken).not.toBeNull();
			expect(qrToken?.customer_id).toBe(customer.id);
			expect(qrToken?.service_date).toBe(today);
			expect(qrToken?.used_at).toBeNull();
		});

		it('CRITICAL: QR tokens have unique constraint on customer+date', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// First insert
			await supabase.from('qr_tokens').insert({
				customer_id: customer.id,
				jti: `jti_${TEST_PREFIX}_1`,
				short_code: `FM-0001`,
				service_date: today,
				expires_at: new Date().toISOString()
			});

			// Second insert same day - should fail
			const { error } = await supabase.from('qr_tokens').insert({
				customer_id: customer.id,
				jti: `jti_${TEST_PREFIX}_2`,
				short_code: `FM-0002`,
				service_date: today,
				expires_at: new Date().toISOString()
			});

			expect(error).not.toBeNull();
			expect(error?.code).toBe('23505'); // Unique constraint violation
		});

		it('CRITICAL: Can mark QR token as used', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// Create QR token
			const { data: qrToken } = await supabase
				.from('qr_tokens')
				.insert({
					customer_id: customer.id,
					jti: `jti_${TEST_PREFIX}_mark`,
					short_code: `FM-1234`,
					service_date: today,
					expires_at: new Date().toISOString()
				})
				.select()
				.single();

			// Mark as used
			const usedAt = new Date().toISOString();
			const { error } = await supabase
				.from('qr_tokens')
				.update({ used_at: usedAt })
				.eq('id', qrToken!.id);

			expect(error).toBeNull();

			// Verify
			const { data: updated } = await supabase
				.from('qr_tokens')
				.select('*')
				.eq('id', qrToken!.id)
				.single();

			expect(updated?.used_at).not.toBeNull();
		});
	});

	describe('P1: Entitlement Database Operations', () => {
		it('CRITICAL: Can create entitlement for customer', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			const { data: entitlement, error } = await supabase
				.from('entitlements')
				.insert({
					customer_id: customer.id,
					service_date: today,
					meals_allowed: 1,
					meals_redeemed: 0
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(entitlement).not.toBeNull();
			expect(entitlement?.meals_allowed).toBe(1);
			expect(entitlement?.meals_redeemed).toBe(0);
		});

		it('CRITICAL: Entitlement update preserves meals_redeemed', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// Create entitlement with some redeemed meals
			await supabase.from('entitlements').insert({
				customer_id: customer.id,
				service_date: today,
				meals_allowed: 2,
				meals_redeemed: 1
			});

			// Update meals_allowed only (simulating re-run of QR job)
			const { error } = await supabase
				.from('entitlements')
				.update({ meals_allowed: 3 })
				.eq('customer_id', customer.id)
				.eq('service_date', today);

			expect(error).toBeNull();

			// Verify meals_redeemed is preserved
			const { data: updated } = await supabase
				.from('entitlements')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			expect(updated?.meals_allowed).toBe(3);
			expect(updated?.meals_redeemed).toBe(1); // Should be preserved!
		});

		it('CRITICAL: Entitlements have unique constraint on customer+date', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// First insert
			await supabase.from('entitlements').insert({
				customer_id: customer.id,
				service_date: today,
				meals_allowed: 1,
				meals_redeemed: 0
			});

			// Second insert same day - should fail
			const { error } = await supabase.from('entitlements').insert({
				customer_id: customer.id,
				service_date: today,
				meals_allowed: 1,
				meals_redeemed: 0
			});

			expect(error).not.toBeNull();
			expect(error?.code).toBe('23505'); // Unique constraint violation
		});
	});

	describe('P1: Skipped Dates', () => {
		it('CRITICAL: Can create skipped date for customer', async () => {
			const customer = await createTestCustomerWithSubscription();
			const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

			const { data: skipped, error } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: tomorrow
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(skipped).not.toBeNull();
			expect(skipped?.skip_date).toBe(tomorrow);
		});

		it('CRITICAL: Can check if date is skipped', async () => {
			const customer = await createTestCustomerWithSubscription();
			const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

			// Insert skipped date
			await supabase.from('skips').insert({
				customer_id: customer.id,
				skip_date: tomorrow
			});

			// Query for skipped dates
			const { data: skippedDates } = await supabase
				.from('skips')
				.select('skip_date')
				.eq('customer_id', customer.id);

			expect(skippedDates).not.toBeNull();
			expect(skippedDates?.length).toBe(1);
			expect(skippedDates?.[0].skip_date).toBe(tomorrow);
		});

		it('EDGE CASE: Skipped date creates zero entitlement', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// Mark today as skipped
			await supabase.from('skips').insert({
				customer_id: customer.id,
				skip_date: today
			});

			// Create zero entitlement (what the QR job would do)
			const { data: entitlement, error } = await supabase
				.from('entitlements')
				.insert({
					customer_id: customer.id,
					service_date: today,
					meals_allowed: 0, // Skipped = 0 meals
					meals_redeemed: 0
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(entitlement?.meals_allowed).toBe(0);
		});
	});

	describe('P1: Query Patterns Used by QR Job', () => {
		it('CRITICAL: Can query active subscriptions with period dates', async () => {
			const customer = await createTestCustomerWithSubscription();

			// Query like the QR job does
			const { data: activeCustomers, error } = await supabase
				.from('customers')
				.select(`
					id,
					email,
					name,
					subscriptions!inner(
						status,
						current_period_start,
						current_period_end
					)
				`)
				.eq('id', customer.id)
				.eq('subscriptions.status', 'active');

			expect(error).toBeNull();
			expect(activeCustomers).not.toBeNull();
			expect(activeCustomers?.length).toBe(1);
			expect(activeCustomers?.[0].subscriptions).toBeDefined();
		});

		it('CRITICAL: Can query customers with skipped dates', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// Add a skipped date
			await supabase.from('skips').insert({
				customer_id: customer.id,
				skip_date: today
			});

			// Query with left join on skips
			const { data: customerWithSkips, error } = await supabase
				.from('customers')
				.select(`
					id,
					email,
					skips(skip_date)
				`)
				.eq('id', customer.id);

			expect(error).toBeNull();
			expect(customerWithSkips).not.toBeNull();
			expect(customerWithSkips?.[0].skips).toBeDefined();
			expect(customerWithSkips?.[0].skips.length).toBe(1);
		});

		it('CRITICAL: Can check if customer already has QR for today', async () => {
			const customer = await createTestCustomerWithSubscription();
			const today = new Date().toISOString().split('T')[0];

			// Create QR token
			await supabase.from('qr_tokens').insert({
				customer_id: customer.id,
				jti: `jti_${TEST_PREFIX}_check`,
				short_code: 'FM-TEST',
				service_date: today,
				expires_at: new Date().toISOString()
			});

			// Check if QR exists for today
			const { data: existingQR } = await supabase
				.from('qr_tokens')
				.select('id')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			expect(existingQR).not.toBeNull();
			expect(existingQR?.id).toBeDefined();
		});
	});
});
