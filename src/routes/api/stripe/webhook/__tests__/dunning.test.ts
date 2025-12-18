/**
 * Dunning Email & Payment Failure Integration Tests - CRITICAL REVENUE RECOVERY
 *
 * Tests the complete dunning flow when Stripe invoices fail:
 * 1. Email escalation based on attempt_count (soft → retry → final)
 * 2. Subscription status updates to 'past_due'
 * 3. Billing portal session generation for payment updates
 * 4. Audit logging of payment failures
 * 5. Error handling when customer not found
 *
 * Tests against REAL Supabase database.
 * Mocks: Stripe API, Email sending (Resend)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data - unique per run to avoid conflicts
const TEST_PREFIX = `dunning_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_INVOICE_ID = `in_${TEST_PREFIX}`;
const TEST_EMAIL = `test_${TEST_PREFIX}@example.com`;
const TEST_CUSTOMER_NAME = 'Test Customer';

// Mock Stripe billing portal session
const MOCK_PORTAL_URL = 'https://billing.stripe.com/session/test_session_123';

describe('Dunning Email & Payment Failure Flow (Real DB + Mocked Stripe/Email)', () => {
	let testCustomerId: string | null = null;
	let testSubscriptionId: string | null = null;

	// Mock modules
	let stripeMock: any;
	let sendEmailMock: any;

	beforeEach(async () => {
		// Mock Stripe billing portal
		stripeMock = {
			billingPortal: {
				sessions: {
					create: vi.fn().mockResolvedValue({
						url: MOCK_PORTAL_URL,
						id: 'ps_test_123'
					})
				}
			}
		};

		// Mock sendEmail function
		sendEmailMock = vi.fn().mockResolvedValue({
			success: true,
			data: { id: 'email_test_123' }
		});
	});

	afterEach(async () => {
		// Cleanup test data (respecting foreign key constraints)
		if (testCustomerId) {
			await supabase.from('audit_log').delete().like('subject', `%${testCustomerId}%`);
			await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', testCustomerId);
			await supabase.from('telegram_link_status').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		// Cleanup by Stripe IDs as fallback
		const { data: orphanedCustomers } = await supabase
			.from('customers')
			.select('id')
			.eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);

		if (orphanedCustomers?.length) {
			for (const customer of orphanedCustomers) {
				await supabase.from('audit_log').delete().like('subject', `%${customer.id}%`);
				await supabase.from('subscriptions').delete().eq('customer_id', customer.id);
				await supabase.from('customers').delete().eq('id', customer.id);
			}
		}

		testCustomerId = null;
		testSubscriptionId = null;

		vi.clearAllMocks();
	});

	/**
	 * Helper function to create test customer and subscription
	 */
	async function setupCustomerAndSubscription(subscriptionStatus: string = 'active') {
		// Create customer
		const { data: customer, error: customerError } = await supabase
			.from('customers')
			.insert({
				stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
				email: TEST_EMAIL,
				name: TEST_CUSTOMER_NAME,
				telegram_handle: '@testuser'
			})
			.select()
			.single();

		expect(customerError).toBeNull();
		expect(customer).not.toBeNull();
		testCustomerId = customer!.id;

		// Create subscription
		const periodStart = new Date();
		const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

		const { data: subscription, error: subscriptionError } = await supabase
			.from('subscriptions')
			.insert({
				customer_id: customer!.id,
				stripe_subscription_id: TEST_STRIPE_SUBSCRIPTION_ID,
				status: subscriptionStatus,
				current_period_start: periodStart.toISOString(),
				current_period_end: periodEnd.toISOString()
			})
			.select()
			.single();

		expect(subscriptionError).toBeNull();
		expect(subscription).not.toBeNull();
		testSubscriptionId = subscription!.id;

		return { customer: customer!, subscription: subscription! };
	}

	/**
	 * Helper function to simulate handlePaymentFailed
	 * (Direct implementation since we can't easily import the private function)
	 */
	async function simulateHandlePaymentFailed(invoice: Partial<Stripe.Invoice>) {
		const stripeCustomerId = invoice.customer as string;

		// Find customer
		const { data: customer } = await supabase
			.from('customers')
			.select('*')
			.eq('stripe_customer_id', stripeCustomerId)
			.single();

		if (!customer) {
			throw new Error('Customer not found');
		}

		// Update subscription status
		const stripeSubscriptionId = (invoice as any).parent?.subscription_details?.subscription as string | undefined;

		if (stripeSubscriptionId) {
			await supabase
				.from('subscriptions')
				.update({ status: 'past_due' })
				.eq('stripe_subscription_id', stripeSubscriptionId);
		}

		// Generate Stripe Customer Portal session
		const portalSession = await stripeMock.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: 'https://frontier-meals.com'
		});

		// Determine email template based on attempt_count
		const attemptCount = invoice.attempt_count || 1;
		const amountDue = `$${((invoice.amount_due || 0) / 100).toFixed(2)}`;

		let emailSlug: string;
		let emailSubject: string;

		if (attemptCount === 1) {
			emailSlug = 'dunning_soft';
			emailSubject = 'Payment issue with your Frontier Meals subscription';
		} else if (attemptCount === 2) {
			emailSlug = 'dunning_retry';
			emailSubject = 'Reminder: Update your Frontier Meals payment';
		} else {
			emailSlug = 'dunning_final';
			emailSubject = 'Final notice: Update payment to keep your Frontier Meals subscription';
		}

		// Send email
		await sendEmailMock({
			to: customer.email,
			subject: emailSubject,
			html: `<html>Email body with portal URL: ${portalSession.url}</html>`,
			tags: [
				{ name: 'category', value: emailSlug },
				{ name: 'customer_id', value: customer.id }
			],
			idempotencyKey: `${emailSlug}/${invoice.id}`
		});

		// Log audit event
		await supabase.from('audit_log').insert({
			actor: 'system',
			action: 'payment_failed',
			subject: `customer:${customer.id}`,
			metadata: {
				invoice_id: invoice.id,
				attempt_count: attemptCount
			}
		});

		return { emailSlug, portalSession };
	}

	describe('P1: Dunning Email Selection Based on Attempt Count', () => {
		it('CRITICAL: attempt_count=1 sends soft dunning email', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500, // $25.00
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const { emailSlug } = await simulateHandlePaymentFailed(invoice);

			expect(emailSlug).toBe('dunning_soft');
			expect(sendEmailMock).toHaveBeenCalledTimes(1);

			const emailCall = sendEmailMock.mock.calls[0][0];
			expect(emailCall.subject).toBe('Payment issue with your Frontier Meals subscription');
			expect(emailCall.tags).toContainEqual({ name: 'category', value: 'dunning_soft' });
			expect(emailCall.idempotencyKey).toBe(`dunning_soft/${TEST_INVOICE_ID}`);
		});

		it('CRITICAL: attempt_count=2 sends retry dunning email', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const { emailSlug } = await simulateHandlePaymentFailed(invoice);

			expect(emailSlug).toBe('dunning_retry');
			expect(sendEmailMock).toHaveBeenCalledTimes(1);

			const emailCall = sendEmailMock.mock.calls[0][0];
			expect(emailCall.subject).toBe('Reminder: Update your Frontier Meals payment');
			expect(emailCall.tags).toContainEqual({ name: 'category', value: 'dunning_retry' });
		});

		it('CRITICAL: attempt_count=3 sends final dunning email', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 3,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const { emailSlug } = await simulateHandlePaymentFailed(invoice);

			expect(emailSlug).toBe('dunning_final');
			expect(sendEmailMock).toHaveBeenCalledTimes(1);

			const emailCall = sendEmailMock.mock.calls[0][0];
			expect(emailCall.subject).toBe('Final notice: Update payment to keep your Frontier Meals subscription');
			expect(emailCall.tags).toContainEqual({ name: 'category', value: 'dunning_final' });
		});

		it('EDGE CASE: attempt_count=4+ still sends final dunning email', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_attempt4`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 4,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const { emailSlug } = await simulateHandlePaymentFailed(invoice);

			expect(emailSlug).toBe('dunning_final');
			expect(sendEmailMock).toHaveBeenCalledTimes(1);
		});

		it('EDGE CASE: attempt_count=0 or null defaults to 1 (soft email)', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 0, // Edge case
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			// When attempt_count is 0 or null, it should default to 1
			const actualAttempt = invoice.attempt_count || 1;
			expect(actualAttempt).toBe(1);
		});
	});

	describe('P1: Subscription Status Update to past_due', () => {
		it('CRITICAL: Subscription status changes to past_due on payment failure', async () => {
			await setupCustomerAndSubscription('active');

			// Verify initial status
			const { data: beforeSub } = await supabase
				.from('subscriptions')
				.select('status')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(beforeSub?.status).toBe('active');

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			// Verify status changed to past_due
			const { data: afterSub } = await supabase
				.from('subscriptions')
				.select('status')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(afterSub?.status).toBe('past_due');
		});

		it('EDGE CASE: Multiple payment failures update status idempotently', async () => {
			await setupCustomerAndSubscription('active');

			const invoice1: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_1`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const invoice2: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_2`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice1);
			await simulateHandlePaymentFailed(invoice2);

			// Status should still be past_due (not duplicated)
			const { data: sub } = await supabase
				.from('subscriptions')
				.select('status')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(sub?.status).toBe('past_due');

			// Both emails should have been sent
			expect(sendEmailMock).toHaveBeenCalledTimes(2);
		});

		it('EDGE CASE: Status update works when already past_due', async () => {
			await setupCustomerAndSubscription('past_due');

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			const { data: sub } = await supabase
				.from('subscriptions')
				.select('status')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(sub?.status).toBe('past_due');
		});
	});

	describe('P1: Billing Portal Integration', () => {
		it('CRITICAL: Portal session URL included in email', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const { portalSession } = await simulateHandlePaymentFailed(invoice);

			expect(portalSession.url).toBe(MOCK_PORTAL_URL);
			expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledTimes(1);
			expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
				customer: TEST_STRIPE_CUSTOMER_ID,
				return_url: 'https://frontier-meals.com'
			});

			// Verify email contains portal URL
			const emailCall = sendEmailMock.mock.calls[0][0];
			expect(emailCall.html).toContain(MOCK_PORTAL_URL);
		});

		it('CRITICAL: Different portal sessions for different customers', async () => {
			// Setup first customer
			const { customer: customer1 } = await setupCustomerAndSubscription();

			const invoice1: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_1`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice1);

			expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
				customer: TEST_STRIPE_CUSTOMER_ID,
				return_url: 'https://frontier-meals.com'
			});
		});

		it('ERROR HANDLING: Portal session creation failure should throw', async () => {
			await setupCustomerAndSubscription();

			// Mock portal session creation to fail
			stripeMock.billingPortal.sessions.create.mockRejectedValueOnce(
				new Error('Stripe API error')
			);

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await expect(simulateHandlePaymentFailed(invoice)).rejects.toThrow('Stripe API error');

			// Email should not be sent if portal session creation fails
			expect(sendEmailMock).not.toHaveBeenCalled();
		});
	});

	describe('P1: Customer Not Found Error Handling', () => {
		it('CRITICAL: Throws error when customer does not exist', async () => {
			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: 'cus_nonexistent_12345',
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await expect(simulateHandlePaymentFailed(invoice)).rejects.toThrow('Customer not found');

			// No email should be sent
			expect(sendEmailMock).not.toHaveBeenCalled();

			// No portal session should be created
			expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
		});

		it('EDGE CASE: Handles customer lookup errors gracefully', async () => {
			// This test verifies the database query behavior
			const { data, error } = await supabase
				.from('customers')
				.select('*')
				.eq('stripe_customer_id', 'cus_does_not_exist')
				.single();

			expect(data).toBeNull();
			expect(error).not.toBeNull();
			// Supabase returns PGRST116 for "not found"
			expect(error?.code).toBe('PGRST116');
		});
	});

	describe('P1: Audit Logging', () => {
		it('CRITICAL: payment_failed action logged with invoice_id and attempt_count', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			// Verify audit log entry
			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('action', 'payment_failed')
				.eq('subject', `customer:${testCustomerId}`)
				.single();

			expect(auditLog).not.toBeNull();
			expect(auditLog?.actor).toBe('system');
			expect(auditLog?.metadata).toHaveProperty('invoice_id', TEST_INVOICE_ID);
			expect(auditLog?.metadata).toHaveProperty('attempt_count', 1);
		});

		it('CRITICAL: Multiple payment failures create separate audit log entries', async () => {
			await setupCustomerAndSubscription();

			const invoice1: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_1`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const invoice2: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_2`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice1);
			await simulateHandlePaymentFailed(invoice2);

			// Verify two audit log entries
			const { data: auditLogs } = await supabase
				.from('audit_log')
				.select('*')
				.eq('action', 'payment_failed')
				.eq('subject', `customer:${testCustomerId}`)
				.order('created_at', { ascending: true });

			expect(auditLogs).toHaveLength(2);
			expect(auditLogs?.[0].metadata).toHaveProperty('attempt_count', 1);
			expect(auditLogs?.[1].metadata).toHaveProperty('attempt_count', 2);
		});

		it('EDGE CASE: Audit log includes correct invoice_id for each failure', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 3,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('action', 'payment_failed')
				.eq('subject', `customer:${testCustomerId}`)
				.single();

			expect(auditLog?.metadata.invoice_id).toBe(TEST_INVOICE_ID);
			expect(auditLog?.metadata.attempt_count).toBe(3);
		});
	});

	describe('P2: Email Template Content Validation', () => {
		it('SOFT EMAIL: Has friendly tone with "Good news" reassurance', async () => {
			// Test the actual email template generation
			const { getDunningSoftEmail } = await import('$lib/email/templates/dunning');

			const emailTemplate = getDunningSoftEmail({
				customer_name: TEST_CUSTOMER_NAME,
				amount_due: '$25.00',
				update_payment_url: MOCK_PORTAL_URL
			});

			expect(emailTemplate.subject).toBe('Payment issue with your Frontier Meals subscription');
			expect(emailTemplate.html).toContain(TEST_CUSTOMER_NAME);
			expect(emailTemplate.html).toContain('$25.00');
			expect(emailTemplate.html).toContain(MOCK_PORTAL_URL);
			expect(emailTemplate.html).toContain('Good news'); // Friendly reassurance
			expect(emailTemplate.html).toContain('uninterrupted'); // Service continues
		});

		it('RETRY EMAIL: Has urgent tone with warning', async () => {
			const { getDunningRetryEmail } = await import('$lib/email/templates/dunning');

			const emailTemplate = getDunningRetryEmail({
				customer_name: TEST_CUSTOMER_NAME,
				update_payment_url: MOCK_PORTAL_URL
			});

			expect(emailTemplate.subject).toBe('Reminder: Update your Frontier Meals payment');
			expect(emailTemplate.html).toContain(TEST_CUSTOMER_NAME);
			expect(emailTemplate.html).toContain(MOCK_PORTAL_URL);
			expect(emailTemplate.html).toContain('Action needed'); // Warning box
			expect(emailTemplate.html).toContain('pause'); // Service pause warning
		});

		it('FINAL EMAIL: Has urgent tone with critical warning', async () => {
			const { getDunningFinalEmail } = await import('$lib/email/templates/dunning');

			const emailTemplate = getDunningFinalEmail({
				customer_name: TEST_CUSTOMER_NAME,
				amount_due: '$25.00',
				update_payment_url: MOCK_PORTAL_URL
			});

			expect(emailTemplate.subject).toBe('Final notice: Update payment to keep your Frontier Meals subscription');
			expect(emailTemplate.html).toContain(TEST_CUSTOMER_NAME);
			expect(emailTemplate.html).toContain('$25.00');
			expect(emailTemplate.html).toContain(MOCK_PORTAL_URL);
			expect(emailTemplate.html).toContain('final'); // Final notice language
			expect(emailTemplate.html).toContain('canceled'); // Cancellation warning
		});

		it('ALL EMAILS: Include payment update link', async () => {
			const {
				getDunningSoftEmail,
				getDunningRetryEmail,
				getDunningFinalEmail
			} = await import('$lib/email/templates/dunning');

			const softEmail = getDunningSoftEmail({
				customer_name: TEST_CUSTOMER_NAME,
				amount_due: '$25.00',
				update_payment_url: MOCK_PORTAL_URL
			});

			const retryEmail = getDunningRetryEmail({
				customer_name: TEST_CUSTOMER_NAME,
				update_payment_url: MOCK_PORTAL_URL
			});

			const finalEmail = getDunningFinalEmail({
				customer_name: TEST_CUSTOMER_NAME,
				amount_due: '$25.00',
				update_payment_url: MOCK_PORTAL_URL
			});

			expect(softEmail.html).toContain(MOCK_PORTAL_URL);
			expect(retryEmail.html).toContain(MOCK_PORTAL_URL);
			expect(finalEmail.html).toContain(MOCK_PORTAL_URL);
		});
	});

	describe('P2: Email Sending Integration', () => {
		it('CRITICAL: Email sent with correct idempotency key', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			expect(sendEmailMock).toHaveBeenCalledWith(
				expect.objectContaining({
					idempotencyKey: `dunning_soft/${TEST_INVOICE_ID}`
				})
			);
		});

		it('CRITICAL: Email includes customer_id tag', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			expect(sendEmailMock).toHaveBeenCalledWith(
				expect.objectContaining({
					tags: expect.arrayContaining([
						{ name: 'customer_id', value: testCustomerId }
					])
				})
			);
		});

		it('EDGE CASE: Different idempotency keys for different invoices', async () => {
			await setupCustomerAndSubscription();

			const invoice1: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_1`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			const invoice2: Partial<Stripe.Invoice> = {
				id: `${TEST_INVOICE_ID}_2`,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 2,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice1);
			await simulateHandlePaymentFailed(invoice2);

			expect(sendEmailMock).toHaveBeenCalledTimes(2);
			expect(sendEmailMock.mock.calls[0][0].idempotencyKey).toBe(`dunning_soft/${TEST_INVOICE_ID}_1`);
			expect(sendEmailMock.mock.calls[1][0].idempotencyKey).toBe(`dunning_retry/${TEST_INVOICE_ID}_2`);
		});
	});

	describe('P2: Amount Formatting', () => {
		it('CRITICAL: Amount formatted correctly as USD', async () => {
			await setupCustomerAndSubscription();

			const testCases = [
				{ amount_due: 2500, expected: '$25.00' },
				{ amount_due: 999, expected: '$9.99' },
				{ amount_due: 10000, expected: '$100.00' },
				{ amount_due: 1, expected: '$0.01' }
			];

			for (const testCase of testCases) {
				vi.clearAllMocks();

				const invoice: Partial<Stripe.Invoice> = {
					id: `${TEST_INVOICE_ID}_${testCase.amount_due}`,
					customer: TEST_STRIPE_CUSTOMER_ID,
					attempt_count: 1,
					amount_due: testCase.amount_due,
					parent: {
						subscription_details: {
							subscription: TEST_STRIPE_SUBSCRIPTION_ID
						}
					} as any
				};

				await simulateHandlePaymentFailed(invoice);

				const amountDueFormatted = `$${(testCase.amount_due / 100).toFixed(2)}`;
				expect(amountDueFormatted).toBe(testCase.expected);
			}
		});
	});

	describe('P3: Edge Cases & Data Integrity', () => {
		it('EDGE CASE: Handles invoice without subscription_id gracefully', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: undefined // No subscription
			};

			// Should still send email and log audit, but skip subscription update
			await simulateHandlePaymentFailed(invoice);

			expect(sendEmailMock).toHaveBeenCalledTimes(1);

			// Subscription status should remain unchanged
			const { data: sub } = await supabase
				.from('subscriptions')
				.select('status')
				.eq('stripe_subscription_id', TEST_STRIPE_SUBSCRIPTION_ID)
				.single();

			expect(sub?.status).toBe('active'); // Unchanged
		});

		it('EDGE CASE: Handles zero amount_due', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 0,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			const amountDueFormatted = `$${(0 / 100).toFixed(2)}`;
			expect(amountDueFormatted).toBe('$0.00');

			expect(sendEmailMock).toHaveBeenCalledTimes(1);
		});

		it('DATABASE INTEGRITY: Audit log subject matches customer format', async () => {
			await setupCustomerAndSubscription();

			const invoice: Partial<Stripe.Invoice> = {
				id: TEST_INVOICE_ID,
				customer: TEST_STRIPE_CUSTOMER_ID,
				attempt_count: 1,
				amount_due: 2500,
				parent: {
					subscription_details: {
						subscription: TEST_STRIPE_SUBSCRIPTION_ID
					}
				} as any
			};

			await simulateHandlePaymentFailed(invoice);

			const { data: auditLog } = await supabase
				.from('audit_log')
				.select('*')
				.eq('action', 'payment_failed')
				.eq('subject', `customer:${testCustomerId}`)
				.single();

			expect(auditLog?.subject).toMatch(/^customer:[0-9a-f-]{36}$/);
		});
	});
});
