/**
 * Stripe Webhook Handler Business Logic Tests
 *
 * CRITICAL REVENUE PATH - Tests actual handler logic, not just DB operations
 *
 * Tests against REAL Supabase staging database
 * Mocks: Stripe API calls
 * Real: Database operations, business logic validation
 *
 * Coverage:
 * 1. handleCheckoutCompleted - Full flow with Stripe API integration
 * 2. handleInvoicePaid - Period validation, zero-duration detection
 * 3. handlePaymentFailed - Dunning email logic by attempt count
 * 4. handleSubscriptionDeleted - Status update and cancellation email
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type Stripe from 'stripe';

dotenv.config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data IDs - unique per test run
const TEST_PREFIX = `handler_${Date.now()}`;
const createTestId = (type: string) => `${type}_${TEST_PREFIX}_${Math.random().toString(36).substring(7)}`;

// Mock email sending
vi.mock('$lib/email/send', () => ({
	sendEmail: vi.fn().mockResolvedValue({ success: true })
}));

// Mock Stripe
vi.mock('stripe', () => {
	const mockStripe = {
		subscriptions: {
			retrieve: vi.fn()
		},
		customers: {
			retrieve: vi.fn()
		},
		billingPortal: {
			sessions: {
				create: vi.fn()
			}
		},
		webhooks: {
			constructEventAsync: vi.fn()
		}
	};

	return {
		default: vi.fn(() => mockStripe)
	};
});

describe('Stripe Webhook Handlers - Business Logic (Real DB)', () => {
	let testCustomerIds: string[] = [];
	let testEventIds: string[] = [];
	let stripe: any;

	beforeEach(async () => {
		// Get mock Stripe instance
		const StripeConstructor = (await import('stripe')).default;
		stripe = new StripeConstructor('test-key', { apiVersion: '2025-10-29.clover' });

		// Reset mocks
		vi.clearAllMocks();
	});

	afterEach(async () => {
		// Cleanup test data in correct order (respecting foreign keys)
		for (const customerId of testCustomerIds) {
			await supabase.from('audit_log').delete().like('subject', `%${customerId}%`);
			await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', customerId);
			await supabase.from('telegram_link_status').delete().eq('customer_id', customerId);
			await supabase.from('subscriptions').delete().eq('customer_id', customerId);
			await supabase.from('customers').delete().eq('id', customerId);
		}

		// Clean up webhook events
		for (const eventId of testEventIds) {
			await supabase.from('webhook_events').delete().eq('event_id', eventId);
		}

		// Clean up by prefix as fallback
		await supabase.from('webhook_events').delete().like('event_id', `%${TEST_PREFIX}%`);
		await supabase.from('customers').delete().like('stripe_customer_id', `%${TEST_PREFIX}%`);

		testCustomerIds = [];
		testEventIds = [];
	});

	describe('handleCheckoutCompleted - Complete Flow', () => {
		it('CRITICAL: Creates customer, subscription, telegram_link_status, and deep_link_token', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;
			const deepLinkToken = `token_${createTestId('dl')}`;
			const deepLinkTokenHash = `hash_${createTestId('dl')}`;

			// Mock Stripe subscription retrieval with valid period dates
			const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
			const periodStart = now;
			const periodEnd = now + 30 * 24 * 60 * 60; // 30 days

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: periodStart,
							current_period_end: periodEnd
						}
					]
				}
			});

			// Create checkout session mock
			const session: Partial<Stripe.Checkout.Session> = {
				customer: stripeCustomerId,
				subscription: stripeSubscriptionId,
				customer_details: {
					email: testEmail,
					name: 'Test User',
					address: null,
					phone: null,
					tax_exempt: 'none',
					tax_ids: null
				},
				custom_fields: [
					{
						key: 'telegram_handle',
						label: { custom: 'Telegram Handle', type: 'custom' },
						type: 'text',
						text: { value: '@testuser' },
						optional: false
					}
				],
				metadata: {
					deep_link_token: deepLinkToken,
					deep_link_token_hash: deepLinkTokenHash
				}
			};

			// Import and call the handler
			const { POST } = await import('../+server');

			// Create mock request with webhook event
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'checkout.session.completed',
				data: { object: session }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			// Execute handler
			const response = await POST({ request: mockRequest as any });
			const result = await response.json();

			expect(result).toEqual({ received: true });

			// Verify customer created
			const { data: customer } = await supabase
				.from('customers')
				.select('*')
				.eq('stripe_customer_id', stripeCustomerId)
				.single();

			expect(customer).not.toBeNull();
			expect(customer?.email).toBe(testEmail);
			expect(customer?.name).toBe('Test User');
			expect(customer?.telegram_handle).toBe('@testuser');
			testCustomerIds.push(customer!.id);

			// Verify subscription created with period dates
			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(subscription).not.toBeNull();
			expect(subscription?.status).toBe('active');
			expect(subscription?.current_period_start).not.toBeNull();
			expect(subscription?.current_period_end).not.toBeNull();

			// Verify period dates are correct
			const storedStart = new Date(subscription!.current_period_start).getTime() / 1000;
			const storedEnd = new Date(subscription!.current_period_end).getTime() / 1000;
			expect(Math.abs(storedStart - periodStart)).toBeLessThan(2); // Within 2 seconds
			expect(Math.abs(storedEnd - periodEnd)).toBeLessThan(2);

			// Verify telegram_link_status created
			const { data: linkStatus } = await supabase
				.from('telegram_link_status')
				.select('*')
				.eq('customer_id', customer!.id)
				.single();

			expect(linkStatus).not.toBeNull();
			expect(linkStatus?.is_linked).toBe(false);

			// Verify deep_link_token created
			const { data: token } = await supabase
				.from('telegram_deep_link_tokens')
				.select('*')
				.eq('customer_id', customer!.id)
				.single();

			expect(token).not.toBeNull();
			expect(token?.token_hash).toBe(deepLinkTokenHash);
			expect(new Date(token!.expires_at).getTime()).toBeGreaterThan(Date.now());

			// Verify email was called
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: testEmail,
					subject: expect.stringContaining('Telegram'),
					tags: expect.arrayContaining([
						{ name: 'category', value: 'telegram_link' },
						{ name: 'customer_id', value: customer!.id }
					])
				})
			);

			// Verify audit log created
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer!.id}`)
				.eq('action', 'subscription_created')
				.single();

			expect(auditLog).not.toBeNull();
			expect(auditLog?.actor).toBe('system');
		});

		it('EDGE CASE: Handles empty subscription items array (no period dates)', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;
			const deepLinkToken = createTestId('dl');
			const deepLinkTokenHash = `hash_${deepLinkToken}`;

			// Mock Stripe subscription with NO items (edge case)
			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [] // Empty array - no period dates available
				}
			});

			const session: Partial<Stripe.Checkout.Session> = {
				customer: stripeCustomerId,
				subscription: stripeSubscriptionId,
				customer_details: {
					email: testEmail,
					name: 'Test User',
					address: null,
					phone: null,
					tax_exempt: 'none',
					tax_ids: null
				},
				custom_fields: [
					{
						key: 'telegram_handle',
						label: { custom: 'Telegram Handle', type: 'custom' },
						type: 'text',
						text: { value: '@testuser' },
						optional: false
					}
				],
				metadata: {
					deep_link_token: deepLinkToken,
					deep_link_token_hash: deepLinkTokenHash
				}
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'checkout.session.completed',
				data: { object: session }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			await POST({ request: mockRequest as any });

			// Verify subscription created with NULL period dates
			const { data: customer } = await supabase
				.from('customers')
				.select('id')
				.eq('stripe_customer_id', stripeCustomerId)
				.single();
			testCustomerIds.push(customer!.id);

			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(subscription).not.toBeNull();
			expect(subscription?.status).toBe('active');
			expect(subscription?.current_period_start).toBeNull();
			expect(subscription?.current_period_end).toBeNull();
		});

		it('EDGE CASE: Throws error when deep_link_token missing from metadata', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: Math.floor(Date.now() / 1000),
							current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
						}
					]
				}
			});

			// Session WITHOUT deep_link_token in metadata
			const session: Partial<Stripe.Checkout.Session> = {
				customer: stripeCustomerId,
				subscription: stripeSubscriptionId,
				customer_details: {
					email: testEmail,
					name: 'Test User',
					address: null,
					phone: null,
					tax_exempt: 'none',
					tax_ids: null
				},
				metadata: {} // Missing deep_link_token!
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'checkout.session.completed',
				data: { object: session }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });
			const result = await response.json();

			// Should fail gracefully
			expect(response.status).toBe(500);
			expect(result.error).toBe('Webhook processing failed');

			// Verify webhook event marked as failed
			const { data: event } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', webhookEvent.id)
				.single();

			expect(event?.status).toBe('failed');
			expect(event?.error_message).toContain('Missing deep link token');

			// Cleanup customer if created
			const { data: customer } = await supabase
				.from('customers')
				.select('id')
				.eq('stripe_customer_id', stripeCustomerId)
				.maybeSingle();
			if (customer) {
				testCustomerIds.push(customer.id);
			}
		});
	});

	describe('handleInvoicePaid - Period Validation', () => {
		it('CRITICAL: Rejects invalid period dates where end <= start', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			// Create customer first
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			// Create subscription
			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			// Mock Stripe with INVALID dates (end <= start)
			const now = Math.floor(Date.now() / 1000);
			const periodStart = now;
			const periodEnd = now - 1000; // END BEFORE START!

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: periodStart,
							current_period_end: periodEnd // Invalid!
						}
					]
				}
			});

			// Create invoice.paid event
			const invoice: Partial<Stripe.Invoice> = {
				id: createTestId('in'),
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				period_start: periodStart,
				period_end: periodEnd,
				billing_reason: 'subscription_cycle',
				amount_due: 2000,
				amount_paid: 2000,
				attempt_count: 1
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.paid',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });

			// Should fail due to validation
			expect(response.status).toBe(500);

			// Verify webhook event marked as failed with validation error
			const { data: event } = await supabase
				.from('webhook_events')
				.select('*')
				.eq('event_id', webhookEvent.id)
				.single();

			expect(event?.status).toBe('failed');
			expect(event?.error_message).toContain('Invalid subscription period');
		});

		it('CRITICAL: Rejects zero-duration periods (< 1 day)', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			// Create customer and subscription
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			// Mock Stripe with zero-duration period (1 hour)
			const now = Math.floor(Date.now() / 1000);
			const periodStart = now;
			const periodEnd = now + 3600; // Only 1 hour (< 1 day)

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: periodStart,
							current_period_end: periodEnd
						}
					]
				}
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: createTestId('in'),
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				billing_reason: 'subscription_cycle',
				amount_due: 2000,
				amount_paid: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.paid',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });

			// Should succeed but skip update (logged warning)
			expect(response.status).toBe(200);

			// Verify period dates NOT updated
			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(subscription?.current_period_start).toBeNull();
			expect(subscription?.current_period_end).toBeNull();
		});

		it('CRITICAL: Does NOT overwrite existing valid period dates', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			// Create customer
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			// Create subscription with VALID existing dates
			const existingStart = new Date();
			const existingEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active',
				current_period_start: existingStart.toISOString(),
				current_period_end: existingEnd.toISOString()
			});

			// Mock Stripe with DIFFERENT dates
			const now = Math.floor(Date.now() / 1000);
			const newPeriodStart = now + 10000;
			const newPeriodEnd = now + 30 * 24 * 60 * 60 + 10000;

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: newPeriodStart,
							current_period_end: newPeriodEnd
						}
					]
				}
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: createTestId('in'),
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				billing_reason: 'subscription_cycle',
				amount_due: 2000,
				amount_paid: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.paid',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			await POST({ request: mockRequest as any });

			// Verify existing dates NOT overwritten
			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			const storedStart = new Date(subscription!.current_period_start);
			const storedEnd = new Date(subscription!.current_period_end);

			// Should still have original dates
			expect(Math.abs(storedStart.getTime() - existingStart.getTime())).toBeLessThan(1000);
			expect(Math.abs(storedEnd.getTime() - existingEnd.getTime())).toBeLessThan(1000);
		});

		it('SUCCESS: Updates subscription with valid period dates', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			// Create customer
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			// Create subscription WITHOUT period dates
			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			// Mock Stripe with valid dates
			const now = Math.floor(Date.now() / 1000);
			const periodStart = now;
			const periodEnd = now + 30 * 24 * 60 * 60; // 30 days

			stripe.subscriptions.retrieve.mockResolvedValue({
				id: stripeSubscriptionId,
				status: 'active',
				items: {
					data: [
						{
							id: 'si_test',
							current_period_start: periodStart,
							current_period_end: periodEnd
						}
					]
				}
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: createTestId('in'),
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				billing_reason: 'subscription_cycle',
				amount_due: 2000,
				amount_paid: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.paid',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });
			expect(response.status).toBe(200);

			// Verify period dates updated
			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(subscription?.current_period_start).not.toBeNull();
			expect(subscription?.current_period_end).not.toBeNull();

			const storedStart = new Date(subscription!.current_period_start).getTime() / 1000;
			const storedEnd = new Date(subscription!.current_period_end).getTime() / 1000;
			expect(Math.abs(storedStart - periodStart)).toBeLessThan(2);
			expect(Math.abs(storedEnd - periodEnd)).toBeLessThan(2);

			// Verify audit log
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer!.id}`)
				.eq('action', 'invoice_paid')
				.single();

			expect(auditLog).not.toBeNull();
		});
	});

	describe('handlePaymentFailed - Dunning Email Logic', () => {
		it('CRITICAL: Sends soft email on first attempt (attempt_count=1)', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;
			const invoiceId = createTestId('in');

			// Create customer and subscription
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			// Mock portal session
			stripe.billingPortal.sessions.create.mockResolvedValue({
				url: 'https://billing.stripe.com/session/test123'
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: invoiceId,
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				attempt_count: 1, // FIRST ATTEMPT
				amount_due: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.payment_failed',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });
			expect(response.status).toBe(200);

			// Verify soft email sent
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: testEmail,
					subject: 'Payment issue with your Frontier Meals subscription',
					tags: expect.arrayContaining([
						{ name: 'category', value: 'dunning_soft' },
						{ name: 'customer_id', value: customer!.id }
					]),
					idempotencyKey: `dunning_soft/${invoiceId}`
				})
			);

			// Verify subscription status updated to past_due
			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(subscription?.status).toBe('past_due');

			// Verify audit log
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer!.id}`)
				.eq('action', 'payment_failed')
				.single();

			expect(auditLog).not.toBeNull();
			expect(auditLog?.metadata).toHaveProperty('attempt_count', 1);
		});

		it('CRITICAL: Sends retry email on second attempt (attempt_count=2)', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;
			const invoiceId = createTestId('in');

			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			stripe.billingPortal.sessions.create.mockResolvedValue({
				url: 'https://billing.stripe.com/session/test123'
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: invoiceId,
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				attempt_count: 2, // SECOND ATTEMPT
				amount_due: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.payment_failed',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			await POST({ request: mockRequest as any });

			// Verify retry email sent
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: testEmail,
					subject: 'Reminder: Update your Frontier Meals payment',
					tags: expect.arrayContaining([
						{ name: 'category', value: 'dunning_retry' }
					]),
					idempotencyKey: `dunning_retry/${invoiceId}`
				})
			);
		});

		it('CRITICAL: Sends final email on third+ attempt (attempt_count>=3)', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;
			const invoiceId = createTestId('in');

			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			stripe.billingPortal.sessions.create.mockResolvedValue({
				url: 'https://billing.stripe.com/session/test123'
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: invoiceId,
				customer: stripeCustomerId,
				parent: {
					subscription_details: {
						subscription: stripeSubscriptionId
					}
				} as any,
				attempt_count: 3, // THIRD ATTEMPT
				amount_due: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.payment_failed',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			await POST({ request: mockRequest as any });

			// Verify final email sent
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: testEmail,
					subject: 'Final notice: Update payment to keep your Frontier Meals subscription',
					tags: expect.arrayContaining([
						{ name: 'category', value: 'dunning_final' }
					]),
					idempotencyKey: `dunning_final/${invoiceId}`
				})
			);
		});

		it('CRITICAL: Creates portal session with correct return URL', async () => {
			const stripeCustomerId = createTestId('cus');
			const testEmail = `${createTestId('test')}@example.com`;

			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			stripe.billingPortal.sessions.create.mockResolvedValue({
				url: 'https://billing.stripe.com/session/test123'
			});

			const invoice: Partial<Stripe.Invoice> = {
				id: createTestId('in'),
				customer: stripeCustomerId,
				attempt_count: 1,
				amount_due: 2000
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'invoice.payment_failed',
				data: { object: invoice }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			await POST({ request: mockRequest as any });

			// Verify portal session created
			expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
				customer: stripeCustomerId,
				return_url: 'https://frontier-meals.com'
			});
		});
	});

	describe('handleSubscriptionDeleted - Cancellation Flow', () => {
		it('CRITICAL: Updates status to canceled and sends cancellation email', async () => {
			const stripeCustomerId = createTestId('cus');
			const stripeSubscriptionId = createTestId('sub');
			const testEmail = `${createTestId('test')}@example.com`;

			// Create customer and subscription
			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: stripeCustomerId,
					email: testEmail,
					name: 'Test User'
				})
				.select()
				.single();
			testCustomerIds.push(customer!.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer!.id,
				stripe_subscription_id: stripeSubscriptionId,
				status: 'active'
			});

			const subscription: Partial<Stripe.Subscription> = {
				id: stripeSubscriptionId,
				customer: stripeCustomerId,
				status: 'canceled'
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'customer.subscription.deleted',
				data: { object: subscription }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });
			expect(response.status).toBe(200);

			// Verify subscription status updated to canceled
			const { data: updatedSub } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('stripe_subscription_id', stripeSubscriptionId)
				.single();

			expect(updatedSub?.status).toBe('canceled');

			// Verify cancellation email sent
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: testEmail,
					subject: 'Your Frontier Meals subscription has been canceled',
					tags: expect.arrayContaining([
						{ name: 'category', value: 'canceled_notice' },
						{ name: 'customer_id', value: customer!.id }
					]),
					idempotencyKey: `canceled_notice/${customer!.id}/${stripeSubscriptionId}`
				})
			);

			// Verify audit log
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer!.id}`)
				.eq('action', 'subscription_canceled')
				.single();

			expect(auditLog).not.toBeNull();
			expect(auditLog?.metadata).toHaveProperty('subscription_id', stripeSubscriptionId);
		});

		it('SUCCESS: Handles non-existent subscription gracefully', async () => {
			const stripeSubscriptionId = createTestId('sub');

			const subscription: Partial<Stripe.Subscription> = {
				id: stripeSubscriptionId,
				status: 'canceled'
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: createTestId('evt'),
				type: 'customer.subscription.deleted',
				data: { object: subscription }
			};
			testEventIds.push(webhookEvent.id);

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			// Should not throw
			const response = await POST({ request: mockRequest as any });
			expect(response.status).toBe(200);

			// Email should NOT be sent
			const { sendEmail } = await import('$lib/email/send');
			expect(sendEmail).not.toHaveBeenCalled();
		});
	});

	describe('Webhook Idempotency', () => {
		it('CRITICAL: Duplicate events are skipped', async () => {
			const eventId = createTestId('evt');
			const stripeCustomerId = createTestId('cus');
			const testEmail = `${createTestId('test')}@example.com`;

			// First, manually insert webhook event
			await supabase.from('webhook_events').insert({
				source: 'stripe',
				event_id: eventId,
				event_type: 'checkout.session.completed',
				status: 'processed'
			});
			testEventIds.push(eventId);

			const session: Partial<Stripe.Checkout.Session> = {
				customer: stripeCustomerId,
				customer_details: {
					email: testEmail,
					name: 'Test User',
					address: null,
					phone: null,
					tax_exempt: 'none',
					tax_ids: null
				}
			};

			const { POST } = await import('../+server');
			const webhookEvent = {
				id: eventId, // SAME EVENT ID
				type: 'checkout.session.completed',
				data: { object: session }
			};

			stripe.webhooks.constructEventAsync.mockResolvedValue(webhookEvent);

			const mockRequest = {
				text: () => Promise.resolve(JSON.stringify(webhookEvent)),
				headers: {
					get: (name: string) => name === 'stripe-signature' ? 'valid-signature' : null
				}
			};

			const response = await POST({ request: mockRequest as any });
			expect(response.status).toBe(200);

			// Customer should NOT be created (duplicate)
			const { data: customer } = await supabase
				.from('customers')
				.select('*')
				.eq('stripe_customer_id', stripeCustomerId)
				.maybeSingle();

			expect(customer).toBeNull();
		});
	});
});
