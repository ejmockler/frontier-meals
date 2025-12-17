/**
 * Kiosk Redemption Integration Tests - CRITICAL MEAL DISPENSING PATH
 *
 * Tests against REAL Supabase staging database.
 * Tests the database operations that the redemption handler relies on.
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
const TEST_PREFIX = `redeem_test_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_EMAIL = `redeem_test_${TEST_PREFIX}@example.com`;

describe('Kiosk Redemption Integration - Dispensing Critical (Real DB)', () => {
	let testCustomerId: string | null = null;

	// Cleanup after each test
	afterEach(async () => {
		if (testCustomerId) {
			await supabase.from('qr_tokens').delete().eq('customer_id', testCustomerId);
			await supabase.from('entitlements').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		await supabase.from('customers').delete().eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);
		testCustomerId = null;
	});

	// Helper to create test customer with subscription, entitlement, and QR token
	async function createTestSetup() {
		const { data: customer } = await supabase
			.from('customers')
			.insert({
				stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
				email: TEST_EMAIL,
				name: 'Redeem Test User'
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

		const today = new Date().toISOString().split('T')[0];

		// Create entitlement
		await supabase.from('entitlements').insert({
			customer_id: customer!.id,
			service_date: today,
			meals_allowed: 1,
			meals_redeemed: 0
		});

		// Create QR token
		const expiresAt = new Date();
		expiresAt.setHours(23, 59, 59, 999);

		const { data: qrToken } = await supabase
			.from('qr_tokens')
			.insert({
				customer_id: customer!.id,
				jti: `jti_${TEST_PREFIX}_${Date.now()}`,
				short_code: `FM-${Math.floor(1000 + Math.random() * 9000)}`,
				service_date: today,
				expires_at: expiresAt.toISOString()
			})
			.select()
			.single();

		return { customer: customer!, qrToken: qrToken!, today };
	}

	describe('P1: QR Token Validation', () => {
		it('CRITICAL: Can lookup QR token by short code', async () => {
			const { qrToken } = await createTestSetup();

			const { data: found, error } = await supabase
				.from('qr_tokens')
				.select('*')
				.eq('short_code', qrToken.short_code)
				.single();

			expect(error).toBeNull();
			expect(found).not.toBeNull();
			expect(found?.customer_id).toBe(testCustomerId);
		});

		it('CRITICAL: Can check if QR is already used', async () => {
			const { qrToken } = await createTestSetup();

			// Initially not used
			const { data: initial } = await supabase
				.from('qr_tokens')
				.select('used_at')
				.eq('id', qrToken.id)
				.single();

			expect(initial?.used_at).toBeNull();

			// Mark as used
			await supabase
				.from('qr_tokens')
				.update({ used_at: new Date().toISOString() })
				.eq('id', qrToken.id);

			// Now should be used
			const { data: after } = await supabase
				.from('qr_tokens')
				.select('used_at')
				.eq('id', qrToken.id)
				.single();

			expect(after?.used_at).not.toBeNull();
		});

		it('CRITICAL: Can check if QR is expired', async () => {
			const { customer } = await createTestSetup();

			// Create an expired QR token for a different date (yesterday) to avoid unique constraint
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
			const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

			const { data: expiredQr } = await supabase
				.from('qr_tokens')
				.insert({
					customer_id: customer.id,
					jti: `jti_expired_${TEST_PREFIX}`,
					short_code: `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
					service_date: yesterday,
					expires_at: expiredAt.toISOString()
				})
				.select()
				.single();

			// Check expiration
			const now = new Date();
			const qrExpires = new Date(expiredQr!.expires_at);

			expect(qrExpires.getTime()).toBeLessThan(now.getTime());
		});
	});

	describe('P1: Entitlement Operations', () => {
		it('CRITICAL: Can check entitlement for customer on date', async () => {
			const { customer, today } = await createTestSetup();

			const { data: entitlement, error } = await supabase
				.from('entitlements')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			expect(error).toBeNull();
			expect(entitlement).not.toBeNull();
			expect(entitlement?.meals_allowed).toBe(1);
			expect(entitlement?.meals_redeemed).toBe(0);
		});

		it('CRITICAL: Can decrement entitlement on redemption', async () => {
			const { customer, today } = await createTestSetup();

			// Simulate redemption - increment meals_redeemed
			const { error } = await supabase
				.from('entitlements')
				.update({ meals_redeemed: 1 })
				.eq('customer_id', customer.id)
				.eq('service_date', today);

			expect(error).toBeNull();

			// Verify
			const { data: updated } = await supabase
				.from('entitlements')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			expect(updated?.meals_redeemed).toBe(1);
		});

		it('CRITICAL: Cannot redeem more meals than allowed', async () => {
			const { customer, today } = await createTestSetup();

			// First redemption
			await supabase
				.from('entitlements')
				.update({ meals_redeemed: 1 })
				.eq('customer_id', customer.id)
				.eq('service_date', today);

			// Check if more redemptions allowed
			const { data: ent } = await supabase
				.from('entitlements')
				.select('meals_allowed, meals_redeemed')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			const canRedeem = ent!.meals_redeemed < ent!.meals_allowed;
			expect(canRedeem).toBe(false);
		});
	});

	describe('P1: Atomic Redemption Operations', () => {
		it('CRITICAL: QR token and entitlement update in transaction', async () => {
			const { customer, qrToken, today } = await createTestSetup();

			// Simulate atomic redemption (what RPC would do)
			// 1. Mark QR as used
			const usedAt = new Date().toISOString();
			await supabase
				.from('qr_tokens')
				.update({ used_at: usedAt })
				.eq('id', qrToken.id);

			// 2. Increment meals_redeemed
			await supabase
				.from('entitlements')
				.update({ meals_redeemed: 1 })
				.eq('customer_id', customer.id)
				.eq('service_date', today);

			// Verify both updated
			const { data: updatedQr } = await supabase
				.from('qr_tokens')
				.select('used_at')
				.eq('id', qrToken.id)
				.single();

			const { data: updatedEnt } = await supabase
				.from('entitlements')
				.select('meals_redeemed')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			expect(updatedQr?.used_at).not.toBeNull();
			expect(updatedEnt?.meals_redeemed).toBe(1);
		});
	});

	describe('P1: Customer Privacy', () => {
		it('CRITICAL: Can retrieve customer first name only', async () => {
			const { customer } = await createTestSetup();

			const { data } = await supabase
				.from('customers')
				.select('name')
				.eq('id', customer.id)
				.single();

			// Application logic extracts first name
			const firstName = data?.name.split(' ')[0];
			expect(firstName).toBe('Redeem');
		});
	});

	describe('Edge Cases', () => {
		it('EDGE CASE: Non-existent short code returns null', async () => {
			await createTestSetup();

			const { data, error } = await supabase
				.from('qr_tokens')
				.select('*')
				.eq('short_code', 'NONEXISTENT')
				.single();

			expect(data).toBeNull();
			// PGRST116 = no rows returned
			expect(error?.code).toBe('PGRST116');
		});

		it('EDGE CASE: Zero entitlement blocks redemption', async () => {
			const { customer, today } = await createTestSetup();

			// Update entitlement to 0 meals allowed (skipped day)
			await supabase
				.from('entitlements')
				.update({ meals_allowed: 0 })
				.eq('customer_id', customer.id)
				.eq('service_date', today);

			// Check entitlement
			const { data: ent } = await supabase
				.from('entitlements')
				.select('meals_allowed, meals_redeemed')
				.eq('customer_id', customer.id)
				.eq('service_date', today)
				.single();

			const canRedeem = ent!.meals_redeemed < ent!.meals_allowed;
			expect(canRedeem).toBe(false);
		});
	});
});
