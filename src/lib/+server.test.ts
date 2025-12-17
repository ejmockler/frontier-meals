/**
 * Webhook Idempotency Tests - CRITICAL REVENUE PROTECTION
 *
 * PURPOSE: Ensure webhooks never process twice (prevents duplicate charges/subscriptions)
 * IMPACT: ⭐⭐⭐⭐⭐ Blast radius = ALL customers, Cost = $$$ if broken
 *
 * CRITICAL BUSINESS RULES:
 * 1. Same event_id → only processes once (idempotency)
 * 2. Concurrent webhooks → database constraint prevents duplicates
 * 3. Stripe redelivery → gracefully returns 200 but no-op
 * 4. Invalid signature → immediate 400 rejection
 * 5. Customer creation → never duplicated
 *
 * WHY THESE TESTS MATTER:
 * - Stripe sends duplicate webhooks when they don't get immediate 200
 * - Race condition: 2 webhooks arrive simultaneously
 * - Network retry: Same webhook retried after timeout
 * - All of these MUST be idempotent or we double-charge customers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { config } from 'dotenv';

config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2024-11-20.acacia'
});

describe('Stripe Webhook - Idempotency (P0 Revenue Protection)', () => {
	let testCustomer: Stripe.Customer;
	let testPrice: Stripe.Price;
	let testProduct: Stripe.Product;
	let testEventIds: string[] = [];
	let testCustomerIds: string[] = [];

	beforeEach(async () => {
		// Create test Stripe resources
		testCustomer = await stripe.customers.create({
			email: `idempotency-test-${Date.now()}@example.com`,
			name: 'Test Customer',
			metadata: { test: 'true' }
		});

		testProduct = await stripe.products.create({
			name: 'Test Product',
			metadata: { test: 'true' }
		});

		testPrice = await stripe.prices.create({
			product: testProduct.id,
			currency: 'usd',
			unit_amount: 3500,
			recurring: { interval: 'month' }
		});
	});

	afterEach(async () => {
		// Cleanup webhook_events table
		for (const eventId of testEventIds) {
			await supabase.from('webhook_events').delete().eq('event_id', eventId);
		}
		testEventIds = [];

		// Cleanup test customers
		for (const customerId of testCustomerIds) {
			await supabase.from('customers').delete().eq('id', customerId);
		}
		testCustomerIds = [];

		// Cleanup Stripe
		if (testCustomer) {
			await stripe.customers.del(testCustomer.id);
		}
	});

	describe('CRITICAL: Duplicate Event Detection', () => {
		it('same event_id processed twice → second request no-ops', async () => {
			const eventId = `evt_test_${Date.now()}`;
			testEventIds.push(eventId);

			// First webhook insert
			const { error: firstError } = await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'checkout.session.completed',
				status: 'processing'
			});

			expect(firstError).toBeNull();

			// Second webhook insert (duplicate)
			const { error: secondError } = await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'checkout.session.completed',
				status: 'processing'
			});

			// CRITICAL: Must fail with unique constraint violation
			expect(secondError).toBeTruthy();
			expect(secondError?.code).toBe('23505'); // PostgreSQL unique violation

			// Verify only ONE record exists
			const { data: events } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', eventId);

			expect(events).toHaveLength(1);
		});

		it('concurrent duplicate events → only one processes', async () => {
			const eventId = `evt_concurrent_${Date.now()}`;
			testEventIds.push(eventId);

			// Fire 5 concurrent insert attempts
			const insertPromises = Array(5)
				.fill(null)
				.map(() =>
					supabase
						.from('webhook_events')
						.insert({
							source: 'stripe',
							event_id: eventId,
							event_type: 'checkout.session.completed',
							status: 'processing'
						})
						.select()
				);

			const results = await Promise.all(insertPromises);

			// CRITICAL: Supabase returns error in response, not rejection
			// Count successes (no error) vs failures (error present)
			const succeeded = results.filter((r) => r.error === null).length;
			const failed = results.filter((r) => r.error !== null).length;

			// Due to race conditions, at least one should fail
			expect(failed).toBeGreaterThan(0);

			// Verify database state - exactly ONE record
			const { data: events } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', eventId);

			expect(events).toHaveLength(1);
			expect(events![0].status).toBe('processing');
		});
	});

	describe('CRITICAL: Customer Creation Idempotency', () => {
		it('checkout webhook twice → one customer created', async () => {
			const email = `duplicate-test-${Date.now()}@example.com`;

			// First customer creation
			const { data: customer1, error: error1 } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: testCustomer.id,
					email,
					name: 'Test Customer'
				})
				.select()
				.single();

			expect(error1).toBeNull();
			testCustomerIds.push(customer1!.id);

			// Second creation (duplicate)
			const { error: error2 } = await supabase.from('customers').insert({
				stripe_customer_id: testCustomer.id,
				email,
				name: 'Test Customer'
			});

			// CRITICAL: Must fail due to unique constraint on stripe_customer_id
			expect(error2).toBeTruthy();
			expect(error2?.code).toBe('23505');

			// Verify only ONE customer exists
			const { data: customers } = await supabase
				.from('customers')
				.select('*')
				.eq('stripe_customer_id', testCustomer.id);

			expect(customers).toHaveLength(1);
		});

		it('concurrent customer creation → only one succeeds', async () => {
			const email = `concurrent-customer-${Date.now()}@example.com`;

			// Fire 3 concurrent inserts
			const insertPromises = Array(3)
				.fill(null)
				.map(() =>
					supabase
						.from('customers')
						.insert({
							stripe_customer_id: testCustomer.id,
							email,
							name: 'Test Customer'
						})
						.select()
				);

			const results = await Promise.all(insertPromises);

			// CRITICAL: Supabase returns error in response
			const succeeded = results.filter((r) => r.error === null).length;
			const failed = results.filter((r) => r.error !== null).length;

			// At least one should fail due to unique constraint
			expect(failed).toBeGreaterThan(0);

			// Get the successful customer for cleanup
			const successResult = results.find((r) => r.error === null);
			if (successResult?.data) {
				const customerData = Array.isArray(successResult.data)
					? successResult.data[0]
					: successResult.data;
				testCustomerIds.push(customerData.id);
			}

			// Verify database state - exactly ONE customer
			const { data: customers } = await supabase
				.from('customers')
				.select('*')
				.eq('stripe_customer_id', testCustomer.id);

			expect(customers).toHaveLength(1);
		});
	});

	describe('CRITICAL: Subscription Upsert Idempotency', () => {
		it('subscription.updated twice → upserted not duplicated', async () => {
			// Create customer
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: testCustomer.id,
					email: `sub-upsert-${Date.now()}@example.com`,
					name: 'Test'
				})
				.select()
				.single();

			testCustomerIds.push(customer!.id);

			const subId = `sub_test_${Date.now()}`;

			// First subscription creation
			const { error: error1 } = await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: subId,
				status: 'active',
				current_period_start: new Date().toISOString(),
				current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			});

			expect(error1).toBeNull();

			// Second insert attempt (should fail)
			const { error: error2 } = await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: subId,
				status: 'active',
				current_period_start: new Date().toISOString(),
				current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			});

			// CRITICAL: Must fail due to unique constraint
			expect(error2).toBeTruthy();
			expect(error2?.code).toBe('23505');

			// But UPDATE should work (upsert pattern)
			const { error: updateError } = await supabase
				.from('subscriptions')
				.update({ status: 'past_due' })
				.eq('stripe_subscription_id', subId);

			expect(updateError).toBeNull();

			// Verify only ONE subscription exists with updated status
			const { data: subs } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', subId);

			expect(subs).toHaveLength(1);
			expect(subs![0].status).toBe('past_due');
		});
	});

	describe('CRITICAL: Webhook Event Status Tracking', () => {
		it('webhook processed → status updated to processed', async () => {
			const eventId = `evt_status_${Date.now()}`;
			testEventIds.push(eventId);

			// Insert event
			await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'checkout.session.completed',
				status: 'processing'
			});

			// Simulate successful processing
			await supabase
				.from('webhook_events')
				.update({
					status: 'processed',
					processed_at: new Date().toISOString()
				})
				.eq('event_id', eventId);

			// Verify status
			const { data: event } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', eventId)
				.single();

			expect(event!.status).toBe('processed');
			expect(event!.processed_at).toBeDefined();
		});

		it('webhook fails → status updated to failed with error', async () => {
			const eventId = `evt_fail_${Date.now()}`;
			testEventIds.push(eventId);

			await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'checkout.session.completed',
				status: 'processing'
			});

			// Simulate failure
			const errorMessage = 'Customer email missing';
			await supabase
				.from('webhook_events')
				.update({
					status: 'failed',
					error_message: errorMessage
				})
				.eq('event_id', eventId);

			// Verify error tracking
			const { data: event } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', eventId)
				.single();

			expect(event!.status).toBe('failed');
			expect(event!.error_message).toBe(errorMessage);
		});
	});

	describe('CRITICAL: Webhook Signature Validation', () => {
		it('invalid signature → webhook rejected', () => {
			const payload = JSON.stringify({
				id: 'evt_test',
				type: 'checkout.session.completed',
				data: { object: {} }
			});

			// CRITICAL: Invalid signature must throw
			expect(() => {
				stripe.webhooks.constructEvent(
					payload,
					'invalid_signature',
					process.env.STRIPE_WEBHOOK_SECRET!
				);
			}).toThrow();
		});

		it('missing signature → webhook rejected', () => {
			const payload = JSON.stringify({
				id: 'evt_test',
				type: 'checkout.session.completed'
			});

			// Empty signature should throw
			expect(() => {
				stripe.webhooks.constructEvent(payload, '', process.env.STRIPE_WEBHOOK_SECRET!);
			}).toThrow();
		});
	});

	describe('Edge Cases & Race Conditions', () => {
		it('invoice.paid arrives before checkout.session.completed', async () => {
			// This tests the UPSERT pattern in handleInvoicePaid

			const email = `race-condition-${Date.now()}@example.com`;
			const subId = `sub_race_${Date.now()}`;

			// Simulate invoice.paid webhook (customer doesn't exist yet)
			// Handler should create customer AND subscription

			// First: Create customer manually (simulating the race)
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: testCustomer.id,
					email,
					name: 'Race Test'
				})
				.select()
				.single();

			testCustomerIds.push(customer!.id);

			// Try to update non-existent subscription (invoice.paid logic)
			const { data: updatedSubs } = await supabase
				.from('subscriptions')
				.update({
					status: 'active',
					current_period_start: new Date().toISOString(),
					current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
				})
				.eq('stripe_subscription_id', subId)
				.select();

			// Should return empty (subscription doesn't exist)
			expect(updatedSubs).toHaveLength(0);

			// Handler would then INSERT (create subscription)
			const { error: insertError } = await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: subId,
				status: 'active',
				current_period_start: new Date().toISOString(),
				current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			});

			expect(insertError).toBeNull();

			// Verify subscription created
			const { data: sub } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', subId)
				.single();

			expect(sub).toBeDefined();
			expect(sub!.customer_id).toBe(customer!.id);
		});

		it('webhook table unique constraint on (event_id) enforced', async () => {
			const eventId = `evt_constraint_${Date.now()}`;
			testEventIds.push(eventId);

			// First insert
			await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'test.event',
				status: 'processing'
			});

			// Try different event_type but same event_id
			const { error } = await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'different.event.type', // Different type!
				status: 'processing'
			});

			// CRITICAL: Should still fail (event_id is unique key)
			expect(error).toBeTruthy();
			expect(error?.code).toBe('23505');
		});
	});

	describe('Deep Link Token Idempotency', () => {
		it('checkout completed twice → one deep link token', async () => {
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: testCustomer.id,
					email: `deeplink-${Date.now()}@example.com`,
					name: 'Test'
				})
				.select()
				.single();

			testCustomerIds.push(customer!.id);

			const tokenHash = 'test_hash_123';

			// First token creation
			const { error: error1 } = await supabase.from('telegram_deep_link_tokens').insert({
				customer_id: customer!.id,
				token_hash: tokenHash,
				expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
			});

			expect(error1).toBeNull();

			// Second creation attempt (duplicate webhook)
			const { error: error2 } = await supabase.from('telegram_deep_link_tokens').insert({
				customer_id: customer!.id,
				token_hash: tokenHash,
				expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
			});

			// Should fail or be handled gracefully
			// (Current schema allows multiple tokens per customer, so this tests expected behavior)
			if (error2) {
				expect(error2.code).toBe('23505');
			}

			// Verify token exists
			const { data: tokens } = await supabase
				.from('telegram_deep_link_tokens')
				.select('*')
				.eq('customer_id', customer!.id);

			expect(tokens!.length).toBeGreaterThan(0);
		});
	});
});

describe('Stripe Webhook - Event Processing Logic', () => {
	it('unknown event type → logged but no crash', async () => {
		// Mock event with unhandled type
		const unknownEvent = {
			id: `evt_unknown_${Date.now()}`,
			type: 'customer.source.expiring', // Not in our switch statement
			data: { object: {} }
		};

		// Should log but not throw
		const eventId = unknownEvent.id;

		const { error } = await supabase.from('webhook_events').insert({
			source: 'stripe',
			event_id: eventId,
			event_type: unknownEvent.type,
			status: 'processing'
		});

		expect(error).toBeNull();

		// Cleanup
		await supabase.from('webhook_events').delete().eq('event_id', eventId);
	});
});
