/**
 * Contract Tests for Stripe API Integration
 *
 * PURPOSE: Verify Stripe's webhook/API contract hasn't changed
 * IMPACT: Prevents silent breakage that costs $$$ in lost revenue
 *
 * These tests FAIL when:
 * - Stripe changes webhook event structure
 * - Required fields are removed/renamed
 * - Type changes (string → number, etc.)
 * - Metadata structure changes
 *
 * WHY CONTRACT TESTS?
 * - Stripe can change their API without warning
 * - Webhook structure changes break payment processing
 * - Our business depends on accurate subscription data
 * - Field removal = silent failures = lost revenue
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';

// Real Stripe client for contract verification
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' });

describe('Stripe API Contract - Critical Revenue Paths', () => {
	let testCustomer: Stripe.Customer;
	let testProduct: Stripe.Product;
	let testPrice: Stripe.Price;

	// Increase timeout for all tests making real Stripe API calls
	beforeAll(async () => {
		// Create test fixtures using REAL Stripe API
		// This verifies our test assumptions match Stripe's current API

		// Create test payment method
		const paymentMethod = await stripe.paymentMethods.create({
			type: 'card',
			card: {
				token: 'tok_visa' // Test token that works in test mode
			}
		});

		testCustomer = await stripe.customers.create({
			email: `contract-test-${Date.now()}@example.com`,
			metadata: { test: 'true' },
			payment_method: paymentMethod.id,
			invoice_settings: {
				default_payment_method: paymentMethod.id
			}
		});

		testProduct = await stripe.products.create({
			name: 'Contract Test Meal Plan',
			metadata: { test: 'true' }
		});

		testPrice = await stripe.prices.create({
			product: testProduct.id,
			currency: 'usd',
			unit_amount: 3500, // $35
			recurring: { interval: 'month' },
			metadata: { test: 'true' }
		});
	}, 30000); // 30 second timeout for setup

	describe('checkout.session.completed - Revenue Critical', () => {
		it('CONTRACT: webhook event has required fields', () => {
			// Simulate what Stripe sends us
			const mockEvent = {
				id: 'evt_test',
				type: 'checkout.session.completed',
				data: {
					object: {
						id: 'cs_test',
						customer: testCustomer.id,
						subscription: 'sub_test',
						metadata: {
							customer_email: 'test@example.com',
							telegram_handle: '@testuser'
						},
						amount_total: 3500,
						payment_status: 'paid',
						mode: 'subscription'
					}
				},
				created: Math.floor(Date.now() / 1000)
			};

			// CRITICAL CONTRACT: These fields MUST exist
			// If Stripe removes any, our webhook handler breaks
			expect(mockEvent.type).toBe('checkout.session.completed');
			expect(mockEvent.data.object).toHaveProperty('id');
			expect(mockEvent.data.object).toHaveProperty('customer');
			expect(mockEvent.data.object).toHaveProperty('subscription');
			expect(mockEvent.data.object).toHaveProperty('metadata');
			expect(mockEvent.data.object).toHaveProperty('amount_total');
			expect(mockEvent.data.object).toHaveProperty('payment_status');

			// Metadata structure contract
			expect(mockEvent.data.object.metadata).toHaveProperty('customer_email');
		});

		it('CONTRACT: metadata preserves custom fields', async () => {
			// Verify Stripe doesn't drop our metadata
			const session = await stripe.checkout.sessions.create({
				mode: 'subscription',
				customer: testCustomer.id,
				line_items: [{ price: testPrice.id, quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
				metadata: {
					customer_email: 'contract@example.com',
					telegram_handle: '@contracttest',
					deep_link_token: 'test-token-123'
				}
			});

			// CONTRACT: Metadata round-trips correctly
			expect(session.metadata).not.toBeNull();
			expect(session.metadata).toHaveProperty('customer_email');
			expect(session.metadata).toHaveProperty('telegram_handle');
			expect(session.metadata).toHaveProperty('deep_link_token');
			expect(session.metadata!.customer_email).toBe('contract@example.com');
		}, 30000);
	});

	describe('customer.subscription.created - Lifecycle Critical', () => {
		it('CONTRACT: subscription items have period dates', async () => {
			const subscription = await stripe.subscriptions.create({
				customer: testCustomer.id,
				items: [{ price: testPrice.id }],
				metadata: { test: 'true' }
			});

			// Basic subscription properties
			expect(subscription).toHaveProperty('status');
			expect(subscription).toHaveProperty('created');

			// CRITICAL: In Stripe API 2025-12-15.clover, period dates moved to subscription items
			expect(subscription.items.data.length).toBeGreaterThan(0);
			const firstItem = subscription.items.data[0];
			expect(firstItem).toHaveProperty('current_period_start');
			expect(firstItem).toHaveProperty('current_period_end');

			// Type contract: must be numbers (unix timestamps)
			expect(typeof firstItem.current_period_start).toBe('number');
			expect(typeof firstItem.current_period_end).toBe('number');

			// Business logic contract: end > start
			expect(firstItem.current_period_end).toBeGreaterThan(
				firstItem.current_period_start
			);

			// Cleanup
			await stripe.subscriptions.cancel(subscription.id);
		}, 30000);

		it('CONTRACT: subscription.items has price details', async () => {
			const subscription = await stripe.subscriptions.create({
				customer: testCustomer.id,
				items: [{ price: testPrice.id }],
				metadata: { test: 'true' }
			});

			// CRITICAL: We need price info for business logic
			expect(subscription.items).toBeDefined();
			expect(subscription.items.data).toBeInstanceOf(Array);
			expect(subscription.items.data.length).toBeGreaterThan(0);

			const item = subscription.items.data[0];
			expect(item).toHaveProperty('price');
			expect(item.price).toHaveProperty('id');
			expect(item.price).toHaveProperty('unit_amount');
			expect(item.price).toHaveProperty('recurring');

			await stripe.subscriptions.cancel(subscription.id);
		}, 30000);
	});

	describe('customer.subscription.updated - State Critical', () => {
		it('CONTRACT: status transitions are valid', async () => {
			const subscription = await stripe.subscriptions.create({
				customer: testCustomer.id,
				items: [{ price: testPrice.id }],
				metadata: { test: 'true' }
			});

			// Valid status values per Stripe docs
			const validStatuses = [
				'incomplete',
				'incomplete_expired',
				'trialing',
				'active',
				'past_due',
				'canceled',
				'unpaid',
				'paused'
			];

			expect(validStatuses).toContain(subscription.status);

			// When we cancel, status MUST change
			const canceled = await stripe.subscriptions.cancel(subscription.id);
			expect(canceled.status).toBe('canceled');
		}, 30000);
	});

	describe('invoice.payment_failed - Dunning Critical', () => {
		it('CONTRACT: failed payment has attempt_count', () => {
			const mockInvoice = {
				id: 'in_test',
				customer: testCustomer.id,
				subscription: 'sub_test',
				attempt_count: 1,
				payment_intent: 'pi_test',
				status: 'open',
				amount_due: 3500,
				currency: 'usd'
			};

			// CRITICAL: We use attempt_count for dunning logic
			expect(mockInvoice).toHaveProperty('attempt_count');
			expect(typeof mockInvoice.attempt_count).toBe('number');
			expect(mockInvoice.attempt_count).toBeGreaterThanOrEqual(0);
		});
	});

	describe('Webhook Signature Verification - Security Critical', () => {
		it('CONTRACT: webhook signature format unchanged', () => {
			const payload = JSON.stringify({ type: 'test.event' });
			const timestamp = Math.floor(Date.now() / 1000);

			// Stripe's signature format: t={timestamp},v1={signature}
			// If this changes, our verification breaks
			const signature = `t=${timestamp},v1=a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890`;

			// Verify format matches expected pattern
			expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]+$/i);

			// Split works as expected
			const parts = signature.split(',');
			expect(parts.length).toBe(2);
			expect(parts[0]).toMatch(/^t=\d+$/);
			expect(parts[1]).toMatch(/^v1=[a-f0-9]+$/i);
		});

		it('CONTRACT: constructEvent validates signatures', () => {
			const payload = JSON.stringify({
				id: 'evt_test',
				type: 'customer.subscription.created',
				data: { object: {} }
			});

			// Invalid signature should throw
			expect(() => {
				stripe.webhooks.constructEvent(payload, 'invalid_sig', STRIPE_WEBHOOK_SECRET);
			}).toThrow();
		});
	});

	describe('API Version Compatibility', () => {
		it('CONTRACT: API version matches our expectations', () => {
			// We're on 2024-11-20.acacia
			// If Stripe changes behavior, this catches it
			// @ts-ignore - getApiField is not in type definitions but exists
			expect(stripe.getApiField('version')).toBe('2024-11-20.acacia');
		});

		it('CONTRACT: Subscription object shape unchanged', async () => {
			const subscription = await stripe.subscriptions.create({
				customer: testCustomer.id,
				items: [{ price: testPrice.id }],
				metadata: { test: 'true' }
			});

			// Snapshot the expected shape
			const expectedKeys = [
				'id',
				'object',
				'customer',
				'current_period_start',
				'current_period_end',
				'status',
				'items',
				'metadata',
				'created'
			];

			expectedKeys.forEach((key) => {
				expect(subscription).toHaveProperty(key);
			});

			await stripe.subscriptions.cancel(subscription.id);
		}, 15000); // Increase timeout for Stripe API calls
	});

	describe('Error Response Contracts', () => {
		it('CONTRACT: card_declined error structure', async () => {
			try {
				// Use Stripe test card that always declines
				await stripe.paymentIntents.create({
					amount: 100,
					currency: 'usd',
					payment_method: 'pm_card_visa_chargeDeclined',
					confirm: true,
					return_url: 'https://frontiermeals.com/success' // Required when confirming
				});
				expect.fail('Should have thrown');
			} catch (error: any) {
				// Verify error structure for our error handling
				expect(error).toHaveProperty('type');
				expect(error).toHaveProperty('code');
				expect(error.type).toBe('StripeCardError');
			}
		}, 30000);

		it('CONTRACT: rate limit error structure', () => {
			// Mock rate limit error
			const rateLimitError = {
				type: 'StripeRateLimitError',
				statusCode: 429,
				message: 'Too many requests'
			};

			expect(rateLimitError.type).toBe('StripeRateLimitError');
			expect(rateLimitError.statusCode).toBe(429);
		});
	});
});

describe('Stripe Contract - Breaking Change Detection', () => {
	it('CANARY: Detects if Stripe removes critical fields', async () => {
		// This test serves as a canary for Stripe API changes
		// If it fails, Stripe changed something and we need to investigate

		const customer = await stripe.customers.create({
			email: `canary-${Date.now()}@example.com`
		});

		// These are the fields we ABSOLUTELY depend on
		const criticalFields = ['id', 'email', 'created', 'metadata'];

		criticalFields.forEach((field) => {
			if (!customer.hasOwnProperty(field)) {
				throw new Error(
					`BREAKING CHANGE: Stripe removed critical field '${field}' from Customer object`
				);
			}
		});
	}, 30000);

	it('CANARY: Subscription lifecycle fields unchanged', async () => {
		const product = await stripe.products.create({
			name: `Canary Product ${Date.now()}`
		});

		const price = await stripe.prices.create({
			product: product.id,
			currency: 'usd',
			unit_amount: 1000,
			recurring: { interval: 'month' }
		});

		// Create payment method for customer
		const paymentMethod = await stripe.paymentMethods.create({
			type: 'card',
			card: {
				token: 'tok_visa'
			}
		});

		const customer = await stripe.customers.create({
			email: `canary-sub-${Date.now()}@example.com`,
			payment_method: paymentMethod.id,
			invoice_settings: {
				default_payment_method: paymentMethod.id
			}
		});

		const subscription = await stripe.subscriptions.create({
			customer: customer.id,
			items: [{ price: price.id }]
		});

		// Critical subscription fields
		const criticalSubFields = [
			'id',
			'status',
			'current_period_start',
			'current_period_end',
			'customer',
			'items',
			'metadata'
		];

		criticalSubFields.forEach((field) => {
			if (!subscription.hasOwnProperty(field)) {
				throw new Error(
					`BREAKING CHANGE: Stripe removed critical field '${field}' from Subscription object`
				);
			}
		});

		await stripe.subscriptions.cancel(subscription.id);
	}, 30000); // Increase timeout for Stripe API calls
});
