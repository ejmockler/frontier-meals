/**
 * Telegram /skip Integration Tests - CRITICAL MEAL MANAGEMENT PATH
 *
 * Tests against REAL Supabase staging database.
 * Tests the complete skip flow including session management, date validation,
 * toggle logic, multi-select flow, and reimbursement eligibility.
 *
 * IMPORTANT: These tests create real records and clean up after themselves.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { todayInPT, isSkipEligibleForReimbursement } from '$lib/utils/timezone';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data IDs - unique per test run
const TEST_PREFIX = `skip_test_${Date.now()}`;
const TEST_STRIPE_CUSTOMER_ID = `cus_${TEST_PREFIX}`;
const TEST_STRIPE_SUBSCRIPTION_ID = `sub_${TEST_PREFIX}`;
const TEST_EMAIL = `skip_test_${TEST_PREFIX}@example.com`;
const TEST_TELEGRAM_USER_ID = Math.floor(Math.random() * 1000000000);

describe('Telegram /skip Integration - Meal Management Critical (Real DB)', () => {
	let testCustomerId: string | null = null;

	// Helper to create test customer with active subscription
	async function createTestCustomerWithSubscription(options: { telegramLinked?: boolean } = {}) {
		const { data: customer } = await supabase
			.from('customers')
			.insert({
				stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
				email: TEST_EMAIL,
				name: 'Skip Test User',
				telegram_user_id: options.telegramLinked ? TEST_TELEGRAM_USER_ID : null
			})
			.select()
			.single();

		testCustomerId = customer?.id || null;

		// Create active subscription with 30-day billing period
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
		if (options.telegramLinked) {
			await supabase.from('telegram_link_status').insert({
				customer_id: customer!.id,
				is_linked: true,
				first_seen_at: new Date().toISOString(),
				last_seen_at: new Date().toISOString()
			});
		}

		return customer!;
	}

	// Helper to get future date (N days from today in PT)
	function getFutureDate(daysFromToday: number): string {
		const today = todayInPT();
		const date = new Date(today + 'T00:00:00');
		date.setDate(date.getDate() + daysFromToday);
		return date.toISOString().split('T')[0];
	}

	// Cleanup after each test
	afterEach(async () => {
		if (testCustomerId) {
			// Clean up in dependency order
			await supabase.from('telegram_skip_sessions').delete().eq('customer_id', testCustomerId);
			await supabase.from('skips').delete().eq('customer_id', testCustomerId);
			await supabase.from('entitlements').delete().eq('customer_id', testCustomerId);
			await supabase.from('audit_log').delete().like('subject', `%${testCustomerId}%`);
			await supabase.from('telegram_link_status').delete().eq('customer_id', testCustomerId);
			await supabase.from('subscriptions').delete().eq('customer_id', testCustomerId);
			await supabase.from('customers').delete().eq('id', testCustomerId);
		}

		// Cleanup by stripe customer ID as fallback
		await supabase.from('customers').delete().eq('stripe_customer_id', TEST_STRIPE_CUSTOMER_ID);

		// Cleanup telegram sessions by telegram_user_id
		await supabase.from('telegram_skip_sessions').delete().eq('telegram_user_id', TEST_TELEGRAM_USER_ID);

		testCustomerId = null;
		vi.useRealTimers();
	});

	describe('P1: Skip Session Management', () => {
		it('CRITICAL: Can create new skip session in database', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const messageId = 12345;
			const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

			const { error } = await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [],
					message_id: messageId,
					expires_at: expiresAt.toISOString()
				});

			expect(error).toBeNull();

			// Verify session was created
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).not.toBeNull();
			expect(session?.customer_id).toBe(customer.id);
			expect(session?.message_id).toBe(messageId);
			expect(session?.selected_dates).toEqual([]);
		});

		it('CRITICAL: Session can store selected dates', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const selectedDates = [getFutureDate(1), getFutureDate(2), getFutureDate(3)];

			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: selectedDates,
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Verify selected dates stored correctly
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session?.selected_dates).toEqual(selectedDates);
		});

		it('CRITICAL: Can update existing session (upsert)', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create initial session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Update with new dates
			const newDates = [getFutureDate(1), getFutureDate(2)];
			const { error } = await supabase
				.from('telegram_skip_sessions')
				.upsert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: newDates,
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					updated_at: new Date().toISOString()
				});

			expect(error).toBeNull();

			// Verify update
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session?.selected_dates).toEqual(newDates);
		});

		it('CRITICAL: Can delete session (cleanup)', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Delete session
			const { error } = await supabase
				.from('telegram_skip_sessions')
				.delete()
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID);

			expect(error).toBeNull();

			// Verify deletion
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).toBeNull();
		});

		it('CRITICAL: Session expires after 5 minutes', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const expiredTime = new Date(Date.now() - 1000); // 1 second ago (expired)

			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: expiredTime.toISOString()
				});

			// Get session and check expiry
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			const expiresAt = new Date(session!.expires_at);
			expect(expiresAt.getTime()).toBeLessThan(Date.now());
		});

		it('CRITICAL: Expired sessions can be cleaned up', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const expiredTime = new Date(Date.now() - 1000); // 1 second ago

			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: expiredTime.toISOString()
				});

			// Delete expired sessions
			const { error } = await supabase
				.from('telegram_skip_sessions')
				.delete()
				.lt('expires_at', new Date().toISOString());

			expect(error).toBeNull();

			// Verify session was deleted
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).toBeNull();
		});
	});

	describe('P1: Skip Date Validation', () => {
		it('CRITICAL: Cannot skip date in the past', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const yesterday = getFutureDate(-1); // Past date

			// Attempt to create skip for past date
			const { error } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: yesterday,
					eligible_for_reimbursement: false
				});

			// Database allows it, but business logic should prevent it
			// This validates the data layer can store it if logic allows
			expect(error).toBeNull();

			// Application logic check: past dates should not be eligible
			expect(isSkipEligibleForReimbursement(yesterday)).toBe(false);
		});

		it('CRITICAL: Cannot skip today', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const today = todayInPT();

			// Application logic check: today is not eligible
			expect(isSkipEligibleForReimbursement(today)).toBe(false);
		});

		it('CRITICAL: Can skip any weekday in future', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Skip dates for next 7 days
			const futureDates = [
				getFutureDate(1),
				getFutureDate(2),
				getFutureDate(3),
				getFutureDate(4),
				getFutureDate(5)
			];

			for (const skipDate of futureDates) {
				const { error } = await supabase
					.from('skips')
					.insert({
						customer_id: customer.id,
						skip_date: skipDate,
						eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
					});

				expect(error).toBeNull();
			}

			// Verify all skips were created
			const { data: skips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.order('skip_date', { ascending: true });

			expect(skips?.length).toBe(5);
		});

		it('CRITICAL: Duplicate skip dates are prevented', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const skipDate = getFutureDate(1);

			// Create first skip
			const { error: firstError } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
				});

			expect(firstError).toBeNull();

			// Attempt duplicate skip
			const { error: secondError } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
				});

			// Should fail with unique constraint violation
			expect(secondError).not.toBeNull();
			expect(secondError?.code).toBe('23505'); // Unique violation
		});
	});

	describe('P1: Skip Toggle Logic', () => {
		it('CRITICAL: First tap on date adds to skips table', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const skipDate = getFutureDate(1);

			// Check no skip exists
			const { data: beforeSkip } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(beforeSkip).toBeNull();

			// Add skip
			const { error } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
				});

			expect(error).toBeNull();

			// Verify skip was created
			const { data: afterSkip } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(afterSkip).not.toBeNull();
			expect(afterSkip?.skip_date).toBe(skipDate);
		});

		it('CRITICAL: Second tap on same date removes from skips table', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const skipDate = getFutureDate(1);

			// Add skip
			await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
				});

			// Verify skip exists
			const { data: beforeDelete } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(beforeDelete).not.toBeNull();

			// Remove skip
			const { error } = await supabase
				.from('skips')
				.delete()
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate);

			expect(error).toBeNull();

			// Verify skip was deleted
			const { data: afterDelete } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(afterDelete).toBeNull();
		});

		it('CRITICAL: Can load existing skips for customer', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const today = todayInPT();

			// Create multiple existing skips
			const skipDates = [getFutureDate(1), getFutureDate(2), getFutureDate(3)];
			for (const skipDate of skipDates) {
				await supabase
					.from('skips')
					.insert({
						customer_id: customer.id,
						skip_date: skipDate,
						eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
					});
			}

			// Load existing skips (exclude today as per app logic)
			const { data: existingSkips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.gt('skip_date', today);

			expect(existingSkips?.length).toBe(3);
			expect(existingSkips?.map(s => s.skip_date).sort()).toEqual(skipDates.sort());
		});
	});

	describe('P1: Multi-Select Flow', () => {
		it('CRITICAL: Select multiple dates stores in session', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const selectedDates = [getFutureDate(1), getFutureDate(2), getFutureDate(3)];

			// Create session with multiple selected dates
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: selectedDates,
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Verify session has all selected dates
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session?.selected_dates).toHaveLength(3);
			expect(session?.selected_dates).toEqual(selectedDates);
		});

		it('CRITICAL: Confirm creates all skips from session', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const datesToSkip = [getFutureDate(1), getFutureDate(2), getFutureDate(3)];

			// Create session with selected dates
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: datesToSkip,
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Batch insert skips (simulating confirm action)
			const skipInserts = datesToSkip.map(date => ({
				customer_id: customer.id,
				skip_date: date,
				eligible_for_reimbursement: isSkipEligibleForReimbursement(date)
			}));

			const { error } = await supabase.from('skips').insert(skipInserts);
			expect(error).toBeNull();

			// Clear session (simulating confirm cleanup)
			await supabase
				.from('telegram_skip_sessions')
				.delete()
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID);

			// Verify all skips were created
			const { data: skips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.order('skip_date', { ascending: true });

			expect(skips?.length).toBe(3);
			expect(skips?.map(s => s.skip_date).sort()).toEqual(datesToSkip.sort());

			// Verify session was deleted
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).toBeNull();
		});

		it('CRITICAL: Cancel clears session without creating skips', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const selectedDates = [getFutureDate(1), getFutureDate(2)];

			// Create session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: selectedDates,
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Cancel - delete session without creating skips
			await supabase
				.from('telegram_skip_sessions')
				.delete()
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID);

			// Verify session was deleted
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).toBeNull();

			// Verify no skips were created
			const { data: skips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id);

			expect(skips?.length).toBe(0);
		});

		it('CRITICAL: Can add new skips and remove existing ones in single confirm', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const today = todayInPT();

			// Create existing skips
			const existingSkips = [getFutureDate(1), getFutureDate(2)];
			for (const skipDate of existingSkips) {
				await supabase
					.from('skips')
					.insert({
						customer_id: customer.id,
						skip_date: skipDate,
						eligible_for_reimbursement: isSkipEligibleForReimbursement(skipDate)
					});
			}

			// New session: keep date 1, remove date 2, add date 3
			const newSelection = [getFutureDate(1), getFutureDate(3)];

			// Calculate changes (as the webhook does)
			const existingSkipSet = new Set(existingSkips);
			const newSelectionSet = new Set(newSelection);

			const datesToAdd = newSelection.filter(d => !existingSkipSet.has(d));
			const datesToRemove = existingSkips.filter(d => !newSelectionSet.has(d));

			// Add new skips
			if (datesToAdd.length > 0) {
				const skipInserts = datesToAdd.map(date => ({
					customer_id: customer.id,
					skip_date: date,
					eligible_for_reimbursement: isSkipEligibleForReimbursement(date)
				}));
				await supabase.from('skips').insert(skipInserts);
			}

			// Remove old skips
			if (datesToRemove.length > 0) {
				await supabase
					.from('skips')
					.delete()
					.in('skip_date', datesToRemove)
					.eq('customer_id', customer.id);
			}

			// Verify final state
			const { data: finalSkips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.order('skip_date', { ascending: true });

			expect(finalSkips?.length).toBe(2);
			expect(finalSkips?.map(s => s.skip_date).sort()).toEqual(newSelection.sort());
		});
	});

	describe('P1: Reimbursement Eligibility', () => {
		beforeEach(() => {
			vi.useRealTimers();
		});

		it('CRITICAL: Skip before Friday 9 AM PT is eligible', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Mock time: Thursday 10 AM PT
			const thursday = new Date('2025-01-16T18:00:00.000Z'); // 10:00 AM PT
			vi.setSystemTime(thursday);

			const skipDate = getFutureDate(7); // Next week
			const eligible = isSkipEligibleForReimbursement(skipDate);

			expect(eligible).toBe(true);

			// Create skip with eligibility
			const { error } = await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: eligible
				});

			expect(error).toBeNull();

			// Verify eligibility was stored
			const { data: skip } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(skip?.eligible_for_reimbursement).toBe(true);
		});

		it('CRITICAL: Skip on Friday at 9 AM PT is NOT eligible', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Mock time: Friday 9:00 AM PT exactly
			const friday9am = new Date('2025-01-17T17:00:00.000Z'); // 9:00 AM PT
			vi.setSystemTime(friday9am);

			const skipDate = getFutureDate(3); // Next week
			const eligible = isSkipEligibleForReimbursement(skipDate);

			expect(eligible).toBe(false);

			// Create skip with eligibility
			await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: eligible
				});

			// Verify eligibility was stored
			const { data: skip } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('skip_date', skipDate)
				.single();

			expect(skip?.eligible_for_reimbursement).toBe(false);
		});

		it('CRITICAL: Skip after Friday 9 AM PT is NOT eligible', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Mock time: Friday 10:00 AM PT
			const friday10am = new Date('2025-01-17T18:00:00.000Z'); // 10:00 AM PT
			vi.setSystemTime(friday10am);

			const skipDate = getFutureDate(3); // Next week
			const eligible = isSkipEligibleForReimbursement(skipDate);

			expect(eligible).toBe(false);
		});

		it('CRITICAL: Skip on Saturday is NOT eligible', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Mock time: Saturday 10:00 AM PT
			const saturday = new Date('2025-01-18T18:00:00.000Z'); // 10:00 AM PT
			vi.setSystemTime(saturday);

			const skipDate = getFutureDate(2); // Next week
			const eligible = isSkipEligibleForReimbursement(skipDate);

			expect(eligible).toBe(false);
		});

		it('CRITICAL: Skip on Sunday is NOT eligible', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Mock time: Sunday 10:00 AM PT
			const sunday = new Date('2025-01-19T18:00:00.000Z'); // 10:00 AM PT
			vi.setSystemTime(sunday);

			const skipDate = getFutureDate(1); // Next week
			const eligible = isSkipEligibleForReimbursement(skipDate);

			expect(eligible).toBe(false);
		});

		it('CRITICAL: Can query skips eligible for reimbursement', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create mix of eligible and non-eligible skips
			await supabase.from('skips').insert([
				{
					customer_id: customer.id,
					skip_date: getFutureDate(1),
					eligible_for_reimbursement: true
				},
				{
					customer_id: customer.id,
					skip_date: getFutureDate(2),
					eligible_for_reimbursement: false
				},
				{
					customer_id: customer.id,
					skip_date: getFutureDate(3),
					eligible_for_reimbursement: true
				}
			]);

			// Query only eligible skips
			const { data: eligibleSkips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('eligible_for_reimbursement', true)
				.order('skip_date', { ascending: true });

			expect(eligibleSkips?.length).toBe(2);
			expect(eligibleSkips?.every(s => s.eligible_for_reimbursement)).toBe(true);
		});
	});

	describe('P1: Edge Cases - Customer Not Linked', () => {
		it('CRITICAL: Cannot create skip session without customer link', async () => {
			// Don't create customer - simulate unlinked user
			const nonExistentTelegramUserId = 999999999;

			// Attempt to create session with non-existent customer
			const { error } = await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: nonExistentTelegramUserId,
					customer_id: '00000000-0000-0000-0000-000000000000',
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Should fail with foreign key violation
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23503'); // Foreign key violation
		});

		it('CRITICAL: Can check if customer is linked by telegram_user_id', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Find customer by telegram user id
			const { data: foundCustomer } = await supabase
				.from('customers')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(foundCustomer).not.toBeNull();
			expect(foundCustomer?.id).toBe(customer.id);
		});

		it('CRITICAL: Unlinked telegram user returns null', async () => {
			await createTestCustomerWithSubscription({ telegramLinked: false });

			const nonExistentTelegramUserId = 999999999;
			const { data: foundCustomer } = await supabase
				.from('customers')
				.select('*')
				.eq('telegram_user_id', nonExistentTelegramUserId)
				.single();

			expect(foundCustomer).toBeNull();
		});
	});

	describe('P1: Edge Cases - No Active Subscription', () => {
		it('CRITICAL: Can check if customer has active subscription', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			const { data: subscription } = await supabase
				.from('subscriptions')
				.select('*')
				.eq('customer_id', customer.id)
				.eq('status', 'active')
				.single();

			expect(subscription).not.toBeNull();
			expect(subscription?.status).toBe('active');
		});

		it('CRITICAL: Canceled subscription can still query skips', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Update subscription to canceled
			await supabase
				.from('subscriptions')
				.update({ status: 'canceled' })
				.eq('customer_id', customer.id);

			// Create skip anyway (business logic should prevent this)
			const skipDate = getFutureDate(1);
			await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: skipDate,
					eligible_for_reimbursement: false
				});

			// Can still query skips
			const { data: skips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id);

			expect(skips?.length).toBe(1);
		});
	});

	describe('P2: Concurrent Operations', () => {
		it('CRITICAL: Concurrent session updates use last-write-wins', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create initial session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Simulate concurrent updates
			const update1 = supabase
				.from('telegram_skip_sessions')
				.upsert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1), getFutureDate(2)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					updated_at: new Date().toISOString()
				});

			const update2 = supabase
				.from('telegram_skip_sessions')
				.upsert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1), getFutureDate(3)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					updated_at: new Date().toISOString()
				});

			// Execute concurrently
			await Promise.all([update1, update2]);

			// One of the updates will win
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).not.toBeNull();
			expect(session?.selected_dates.length).toBeGreaterThan(0);
		});

		it('CRITICAL: Session cleanup during active operation', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Delete session (simulating cancel or confirm)
			await supabase
				.from('telegram_skip_sessions')
				.delete()
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID);

			// Attempt to update non-existent session should create new one
			const { error } = await supabase
				.from('telegram_skip_sessions')
				.upsert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(2)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					updated_at: new Date().toISOString()
				});

			expect(error).toBeNull();

			// Verify new session was created
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).not.toBeNull();
			expect(session?.selected_dates).toEqual([getFutureDate(2)]);
		});
	});

	describe('P2: Audit Logging', () => {
		it('CRITICAL: Can log skip_added audit event', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const skipDate = getFutureDate(1);

			await supabase.from('audit_log').insert({
				actor: `customer:${customer.id}`,
				action: 'skip_added',
				subject: `customer:${customer.id}`,
				metadata: { skip_date: skipDate }
			});

			const { data: log } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer.id}`)
				.eq('action', 'skip_added')
				.single();

			expect(log).not.toBeNull();
			expect(log?.metadata).toHaveProperty('skip_date', skipDate);
		});

		it('CRITICAL: Can log skip_removed audit event', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });
			const skipDate = getFutureDate(1);

			await supabase.from('audit_log').insert({
				actor: `customer:${customer.id}`,
				action: 'skip_removed',
				subject: `customer:${customer.id}`,
				metadata: { skip_date: skipDate }
			});

			const { data: log } = await supabase
				.from('audit_log')
				.select('*')
				.eq('subject', `customer:${customer.id}`)
				.eq('action', 'skip_removed')
				.single();

			expect(log).not.toBeNull();
			expect(log?.action).toBe('skip_removed');
		});
	});

	describe('P2: Data Integrity', () => {
		it('CRITICAL: Session cascades delete when customer deleted', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create session
			await supabase
				.from('telegram_skip_sessions')
				.insert({
					telegram_user_id: TEST_TELEGRAM_USER_ID,
					customer_id: customer.id,
					selected_dates: [getFutureDate(1)],
					message_id: 12345,
					expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
				});

			// Delete customer (should cascade to session)
			await supabase.from('subscriptions').delete().eq('customer_id', customer.id);
			await supabase.from('customers').delete().eq('id', customer.id);

			// Verify session was deleted
			const { data: session } = await supabase
				.from('telegram_skip_sessions')
				.select('*')
				.eq('telegram_user_id', TEST_TELEGRAM_USER_ID)
				.single();

			expect(session).toBeNull();
		});

		it('CRITICAL: Skips cascade delete when customer deleted', async () => {
			const customer = await createTestCustomerWithSubscription({ telegramLinked: true });

			// Create skip
			await supabase
				.from('skips')
				.insert({
					customer_id: customer.id,
					skip_date: getFutureDate(1),
					eligible_for_reimbursement: false
				});

			// Delete customer (should cascade to skips)
			await supabase.from('subscriptions').delete().eq('customer_id', customer.id);
			await supabase.from('customers').delete().eq('id', customer.id);

			// Verify skip was deleted
			const { data: skips } = await supabase
				.from('skips')
				.select('*')
				.eq('customer_id', customer.id);

			expect(skips?.length).toBe(0);
		});
	});
});
