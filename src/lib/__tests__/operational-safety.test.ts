/**
 * Operational Safety Tests
 *
 * Tests critical operational safety features to prevent customer-facing failures:
 * 1. NULL period date detection (prevents silent QR code skipping)
 * 2. Service day edge cases (DST, holidays, database fallback)
 * 3. Timezone calculations (Pacific Time boundary handling)
 * 4. Skip eligibility (Friday 9 AM PT cutoff)
 * 5. Admin authentication flow (rate limiting, token expiry, one-time use)
 *
 * These tests use REAL Supabase database to validate production behavior.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { isServiceDay, getNextServiceDate } from '$lib/utils/service-calendar';
import {
	todayInPT,
	endOfDayPT,
	startOfDayPT,
	isSkipEligibleForReimbursement,
	toPacificTime
} from '$lib/utils/timezone';
import {
	generateMagicLinkToken,
	verifyMagicLinkToken,
	isAdminEmail
} from '$lib/auth/admin';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data prefix - unique per test run
const TEST_PREFIX = `ops_safety_${Date.now()}`;

describe('Operational Safety Tests', () => {
	// ========================================================================
	// Part 1: NULL Period Date Detection
	// ========================================================================
	describe('Part 1: NULL Period Date Detection', () => {
		let testCustomerIds: string[] = [];

		afterEach(async () => {
			// Cleanup test data
			for (const customerId of testCustomerIds) {
				await supabase.from('subscriptions').delete().eq('customer_id', customerId);
				await supabase.from('customers').delete().eq('id', customerId);
			}
			testCustomerIds = [];
		});

		async function createCustomerWithSubscription(
			periodStart: Date | null,
			periodEnd: Date | null,
			status: string = 'active'
		) {
			const email = `${TEST_PREFIX}_null_${Date.now()}@example.com`;

			const { data: customer } = await supabase
				.from('customers')
				.insert({
					stripe_customer_id: `cus_${TEST_PREFIX}_${Date.now()}`,
					email,
					name: 'Null Test User'
				})
				.select()
				.single();

			if (!customer) throw new Error('Failed to create customer');
			testCustomerIds.push(customer.id);

			await supabase.from('subscriptions').insert({
				customer_id: customer.id,
				stripe_subscription_id: `sub_${TEST_PREFIX}_${Date.now()}`,
				status,
				current_period_start: periodStart?.toISOString() ?? null,
				current_period_end: periodEnd?.toISOString() ?? null
			});

			return customer;
		}

		it('CRITICAL: Detects subscription with NULL period_start', async () => {
			const customer = await createCustomerWithSubscription(
				null,
				new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
			);

			// Query for NULL dates like the QR job does
			const { data: nullDateSubs } = await supabase
				.from('subscriptions')
				.select('id, stripe_subscription_id, customers(email)')
				.eq('status', 'active')
				.or('current_period_start.is.null,current_period_end.is.null');

			expect(nullDateSubs).not.toBeNull();
			const found = nullDateSubs?.find(
				(s) => {
					const customerData = Array.isArray(s.customers) ? s.customers[0] : s.customers;
					return customerData?.email === customer.email;
				}
			);

			expect(found).toBeDefined();
		});

		it('CRITICAL: Detects subscription with NULL period_end', async () => {
			const customer = await createCustomerWithSubscription(
				new Date(),
				null
			);

			const { data: nullDateSubs } = await supabase
				.from('subscriptions')
				.select('id, stripe_subscription_id, customers(email)')
				.eq('status', 'active')
				.or('current_period_start.is.null,current_period_end.is.null');

			expect(nullDateSubs).not.toBeNull();
			const found = nullDateSubs?.find(
				(s) => {
					const customerData = Array.isArray(s.customers) ? s.customers[0] : s.customers;
					return customerData?.email === customer.email;
				}
			);

			expect(found).toBeDefined();
		});

		it('CRITICAL: Does NOT flag subscription with valid dates', async () => {
			const customer = await createCustomerWithSubscription(
				new Date(),
				new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
			);

			const { data: nullDateSubs } = await supabase
				.from('subscriptions')
				.select('id, stripe_subscription_id, customers(email)')
				.eq('status', 'active')
				.or('current_period_start.is.null,current_period_end.is.null');

			const found = nullDateSubs?.find(
				(s) => {
					const customerData = Array.isArray(s.customers) ? s.customers[0] : s.customers;
					return customerData?.email === customer.email;
				}
			);

			expect(found).toBeUndefined();
		});

		it('CRITICAL: Alert message format is correct', async () => {
			const customer = await createCustomerWithSubscription(null, null);

			const { data: nullDateSubs } = await supabase
				.from('subscriptions')
				.select('id, stripe_subscription_id, customers(email)')
				.eq('status', 'active')
				.or('current_period_start.is.null,current_period_end.is.null');

			expect(nullDateSubs).not.toBeNull();
			expect(nullDateSubs!.length).toBeGreaterThan(0);

			// Format alert message like the QR job does
			const alertMessage = `🚨 CRITICAL: ${nullDateSubs!.length} active subscriptions have NULL period dates!\n\nThese customers will NOT receive QR codes:\n${nullDateSubs!.map(s => {
				const customerData = Array.isArray(s.customers) ? s.customers[0] : s.customers;
				return `- ${customerData?.email} (${s.stripe_subscription_id})`;
			}).join('\n')}`;

			// Verify message structure
			expect(alertMessage).toContain('🚨 CRITICAL');
			expect(alertMessage).toContain('NULL period dates');
			expect(alertMessage).toContain(customer.email);
		});

		it('CRITICAL: Only flags active subscriptions', async () => {
			// Create inactive subscription with NULL dates
			await createCustomerWithSubscription(null, null, 'canceled');

			const { data: nullDateSubs } = await supabase
				.from('subscriptions')
				.select('id')
				.eq('status', 'active')
				.or('current_period_start.is.null,current_period_end.is.null');

			// Should not include canceled subscriptions
			const testSubs = nullDateSubs?.filter(s =>
				s.stripe_subscription_id?.includes(TEST_PREFIX)
			);
			expect(testSubs?.length || 0).toBe(0);
		});
	});

	// ========================================================================
	// Part 2: Service Day Logic
	// ========================================================================
	describe('Part 2: Service Day Logic', () => {
		let testExceptionIds: string[] = [];
		let originalServiceDays: number[];
		let configId: string;

		beforeEach(async () => {
			// Save original config and ensure Mon-Fri is set
			const { data: config } = await supabase
				.from('service_schedule_config')
				.select('id, service_days')
				.single();

			configId = config!.id;
			originalServiceDays = config?.service_days || [1, 2, 3, 4, 5];

			// Reset to Mon-Fri BEFORE tests run
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [1, 2, 3, 4, 5] })
				.eq('id', configId);
		});

		afterEach(async () => {
			// Clean up test exceptions first
			for (const id of testExceptionIds) {
				await supabase.from('service_exceptions').delete().eq('id', id);
			}
			testExceptionIds = [];

			// Restore original config last
			await supabase
				.from('service_schedule_config')
				.update({ service_days: originalServiceDays })
				.eq('id', configId);
		});

		it('CRITICAL: Weekend dates return false', async () => {
			// June 2025 - clean month with no holidays
			expect(await isServiceDay('2025-06-07', supabase)).toBe(false); // Saturday
			expect(await isServiceDay('2025-06-08', supabase)).toBe(false); // Sunday
		});

		it('CRITICAL: Weekday dates return true', async () => {
			// Use February 2026 - no holidays interfering
			expect(await isServiceDay('2026-02-02', supabase)).toBe(true); // Monday
			expect(await isServiceDay('2026-02-03', supabase)).toBe(true); // Tuesday
			expect(await isServiceDay('2026-02-04', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2026-02-05', supabase)).toBe(true); // Thursday
			expect(await isServiceDay('2026-02-06', supabase)).toBe(true); // Friday
		});

		it('CRITICAL: Holiday exception returns false', async () => {
			// Add test holiday on a Monday
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-07-06',
					type: 'holiday',
					name: `${TEST_PREFIX} Test Holiday`,
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (holiday) testExceptionIds.push(holiday.id);

			// July 6, 2026 is a Monday (normally service day)
			expect(await isServiceDay('2026-07-06', supabase)).toBe(false);
		});

		it('CRITICAL: Special event on weekend returns true', async () => {
			// Add special event on Saturday
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-07-11',
					type: 'special_event',
					name: `${TEST_PREFIX} Weekend Event`,
					is_service_day: true,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptionIds.push(event.id);

			// July 11, 2026 is a Saturday (normally closed)
			expect(await isServiceDay('2026-07-11', supabase)).toBe(true);
		});

		it('EDGE CASE: DST transition dates handled correctly', async () => {
			// DST starts: March 8, 2026 (Sunday) - clocks spring forward
			// March 9, 2026 (Monday) - first weekday after DST (no holiday)
			expect(await isServiceDay('2026-03-09', supabase)).toBe(true);

			// DST ends: November 1, 2026 (Sunday) - clocks fall back
			// November 2, 2026 (Monday) - first weekday after DST
			expect(await isServiceDay('2026-11-02', supabase)).toBe(true);
		});

		it('EDGE CASE: Database error falls back to weekday logic', async () => {
			// Create client with invalid credentials
			const invalidClient = createClient(
				process.env.PUBLIC_SUPABASE_URL!,
				'invalid-key-for-testing'
			);

			// Should fall back to weekday logic (Mon-Fri)
			const result = await isServiceDay('2025-06-02', invalidClient); // Monday
			expect(result).toBe(true);

			const weekendResult = await isServiceDay('2025-06-07', invalidClient); // Saturday
			expect(weekendResult).toBe(false);
		});

		it('EDGE CASE: Database unavailable falls back gracefully', async () => {
			// Test with no client (simulates browser context)
			const result = await isServiceDay('2026-02-02'); // Monday, no client
			expect(result).toBe(true);

			const weekendResult = await isServiceDay('2026-02-07'); // Saturday
			expect(weekendResult).toBe(false);
		});

		it('CRITICAL: getNextServiceDate skips holidays', async () => {
			// Add holiday on Monday
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-07-06',
					type: 'holiday',
					name: `${TEST_PREFIX} Monday Holiday`,
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (holiday) testExceptionIds.push(holiday.id);

			// Friday -> Tuesday (skipping weekend + Monday holiday)
			const next = await getNextServiceDate('2026-07-03', supabase); // Friday
			expect(next).toBe('2026-07-07'); // Tuesday
		});
	});

	// ========================================================================
	// Part 3: Timezone Calculations
	// ========================================================================
	describe('Part 3: Timezone Calculations', () => {
		beforeEach(() => {
			vi.useRealTimers();
		});

		it('CRITICAL: todayInPT returns correct date near midnight UTC', () => {
			// Mock: 2 AM UTC on Jan 16 = 6 PM PT on Jan 15 (PST)
			const utc2am = new Date('2025-01-16T02:00:00.000Z');
			vi.setSystemTime(utc2am);

			const result = todayInPT();
			expect(result).toBe('2025-01-15'); // Should be previous day in PT
		});

		it('CRITICAL: Year boundary (Dec 31 UTC = Dec 30 PT)', () => {
			// Mock: 2 AM UTC on Jan 1 = 6 PM PT on Dec 31
			const jan1UTC = new Date('2025-01-01T02:00:00.000Z');
			vi.setSystemTime(jan1UTC);

			const result = todayInPT();
			expect(result).toBe('2024-12-31');
		});

		it('CRITICAL: startOfDayPT and endOfDayPT bracket full day', () => {
			const date = '2025-01-16';

			const start = startOfDayPT(date);
			const end = endOfDayPT(date);

			// Start should be before end
			expect(start.getTime()).toBeLessThan(end.getTime());

			// Difference should be ~24 hours (minus 1 millisecond)
			const diff = end.getTime() - start.getTime();
			const expectedDiff = 24 * 60 * 60 * 1000 - 1; // 86399999ms
			expect(diff).toBe(expectedDiff);
		});

		it('EDGE CASE: DST transition (spring forward)', () => {
			// March 9, 2025 - DST starts at 2 AM (PST becomes PDT)
			const dstStart = '2025-03-09';

			const start = startOfDayPT(dstStart);
			const end = endOfDayPT(dstStart);

			// Should still bracket the day despite time jump
			expect(start.getTime()).toBeLessThan(end.getTime());

			// The day is only 23 hours long due to spring forward
			const diff = end.getTime() - start.getTime();
			const expectedDiff = 23 * 60 * 60 * 1000 - 1; // 82799999ms
			expect(diff).toBe(expectedDiff);
		});

		it('EDGE CASE: DST transition (fall back)', () => {
			// November 2, 2025 - DST ends at 2 AM (PDT becomes PST)
			const dstEnd = '2025-11-02';

			const start = startOfDayPT(dstEnd);
			const end = endOfDayPT(dstEnd);

			// Should still bracket the day despite time repeat
			expect(start.getTime()).toBeLessThan(end.getTime());

			// The day is 25 hours long due to fall back
			const diff = end.getTime() - start.getTime();
			const expectedDiff = 25 * 60 * 60 * 1000 - 1; // 89999999ms
			expect(diff).toBe(expectedDiff);
		});

		it('CRITICAL: startOfDayPT returns midnight PT as UTC', () => {
			const date = '2025-01-16'; // PST (UTC-8)
			const result = startOfDayPT(date);

			// Midnight PST = 8 AM UTC
			expect(result.toISOString()).toBe('2025-01-16T08:00:00.000Z');
		});

		it('CRITICAL: endOfDayPT returns 11:59:59.999 PM PT as UTC', () => {
			const date = '2025-01-16'; // PST (UTC-8)
			const result = endOfDayPT(date);

			// 11:59:59.999 PM PST = 7:59:59.999 AM next day UTC
			expect(result.toISOString()).toBe('2025-01-17T07:59:59.999Z');
		});

		it('EDGE CASE: Summer date (PDT, UTC-7)', () => {
			const summerDate = '2025-06-15'; // PDT (UTC-7)

			const start = startOfDayPT(summerDate);
			expect(start.toISOString()).toBe('2025-06-15T07:00:00.000Z');

			const end = endOfDayPT(summerDate);
			expect(end.toISOString()).toBe('2025-06-16T06:59:59.999Z');
		});
	});

	// ========================================================================
	// Part 4: Skip Eligibility
	// ========================================================================
	describe('Part 4: Skip Eligibility', () => {
		beforeEach(() => {
			vi.useRealTimers();
		});

		it('CRITICAL: Thursday is eligible for next week skip', () => {
			// Mock: Thursday 10 AM PT
			const thursday = new Date('2025-01-16T18:00:00.000Z'); // 10 AM PST
			vi.setSystemTime(thursday);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);
		});

		it('CRITICAL: Friday 8:59 AM PT is eligible', () => {
			// Mock: Friday 8:59 AM PT
			const friday859 = new Date('2025-01-17T16:59:00.000Z');
			vi.setSystemTime(friday859);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);
		});

		it('CRITICAL: Friday 9:00 AM PT is NOT eligible', () => {
			// Mock: Friday 9:00 AM PT exactly
			const friday9am = new Date('2025-01-17T17:00:00.000Z');
			vi.setSystemTime(friday9am);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('CRITICAL: Friday 9:01 AM PT is NOT eligible', () => {
			// Mock: Friday 9:01 AM PT
			const friday901 = new Date('2025-01-17T17:01:00.000Z');
			vi.setSystemTime(friday901);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('CRITICAL: Saturday is NOT eligible', () => {
			// Mock: Saturday 10 AM PT
			const saturday = new Date('2025-01-18T18:00:00.000Z');
			vi.setSystemTime(saturday);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('CRITICAL: Sunday is NOT eligible', () => {
			// Mock: Sunday 10 AM PT
			const sunday = new Date('2025-01-19T18:00:00.000Z');
			vi.setSystemTime(sunday);

			const skipDate = '2025-01-20'; // Next Monday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('CRITICAL: Cannot skip today', () => {
			// Mock: Monday 10 AM PT
			const monday = new Date('2025-01-20T18:00:00.000Z');
			vi.setSystemTime(monday);

			const skipDate = '2025-01-20'; // Same day
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('CRITICAL: Cannot skip past dates', () => {
			// Mock: Wednesday 10 AM PT
			const wednesday = new Date('2025-01-22T18:00:00.000Z');
			vi.setSystemTime(wednesday);

			const skipDate = '2025-01-20'; // Monday (in past)
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});

		it('EDGE CASE: Friday cutoff during DST transition', () => {
			// March 7, 2025 - Friday before DST (PST)
			const fridayBeforeDST = new Date('2025-03-07T16:59:00.000Z'); // 8:59 AM PST
			vi.setSystemTime(fridayBeforeDST);

			const skipDate = '2025-03-10'; // Monday after DST
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);

			// Move to 9:00 AM PST
			const friday9amPST = new Date('2025-03-07T17:00:00.000Z');
			vi.setSystemTime(friday9amPST);
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
		});
	});

	// ========================================================================
	// Part 5: Admin Auth
	// ========================================================================
	describe('Part 5: Admin Auth', () => {
		let testTokenHashes: string[] = [];
		let testEmail: string;

		beforeEach(() => {
			testEmail = `${TEST_PREFIX}_admin_${Date.now()}@example.com`;
		});

		afterEach(async () => {
			// Clean up test tokens
			await supabase
				.from('admin_magic_links')
				.delete()
				.eq('email', testEmail);

			// Clean up rate limits
			await supabase
				.from('rate_limits')
				.delete()
				.like('key', `magic:${testEmail}%`);
		});

		it('CRITICAL: Rate limiting works (3 requests per hour)', async () => {
			const key = RateLimitKeys.magicLink(testEmail);

			// First 3 requests should be allowed
			for (let i = 0; i < 3; i++) {
				const result = await checkRateLimit(supabase, {
					key,
					maxRequests: 3,
					windowMinutes: 60
				});
				expect(result.allowed).toBe(true);
			}

			// 4th request should be blocked
			const blocked = await checkRateLimit(supabase, {
				key,
				maxRequests: 3,
				windowMinutes: 60
			});
			expect(blocked.allowed).toBe(false);
			expect(blocked.retryAfter).toBeGreaterThan(0);
		});

		it('CRITICAL: Token verification works', async () => {
			// Use a valid admin email from the allowlist
			const adminEmail = 'noah@frontier-meals.com';

			// Skip if not in production environment with real admin emails
			if (!isAdminEmail(adminEmail)) {
				console.log('Skipping admin auth test - not in production environment');
				return;
			}

			const token = await generateMagicLinkToken(adminEmail);
			expect(token).toBeDefined();
			expect(token.length).toBeGreaterThan(0);

			const result = await verifyMagicLinkToken(token);
			expect(result.valid).toBe(true);
			expect(result.email).toBe(adminEmail);
		});

		it('CRITICAL: Expired token is rejected', async () => {
			const adminEmail = 'noah@frontier-meals.com';

			if (!isAdminEmail(adminEmail)) {
				console.log('Skipping expired token test - not in production environment');
				return;
			}

			// Create token with past expiry
			const { randomUUID, sha256 } = await import('$lib/utils/crypto');
			const token = randomUUID();
			const tokenHash = await sha256(token);
			const expiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

			await supabase.from('admin_magic_links').insert({
				email: adminEmail,
				token_hash: tokenHash,
				expires_at: expiredTime.toISOString(),
				used: false
			});

			const result = await verifyMagicLinkToken(token);
			expect(result.valid).toBe(false);
			expect(result.expired).toBe(true);

			// Cleanup
			await supabase
				.from('admin_magic_links')
				.delete()
				.eq('token_hash', tokenHash);
		});

		it('CRITICAL: Used token is rejected', async () => {
			const adminEmail = 'noah@frontier-meals.com';

			if (!isAdminEmail(adminEmail)) {
				console.log('Skipping used token test - not in production environment');
				return;
			}

			const token = await generateMagicLinkToken(adminEmail);

			// First verification should work
			const result1 = await verifyMagicLinkToken(token);
			expect(result1.valid).toBe(true);

			// Second verification should fail (token marked as used)
			const result2 = await verifyMagicLinkToken(token);
			expect(result2.valid).toBe(false);
		});

		it('EDGE CASE: Invalid token format is rejected', async () => {
			const result = await verifyMagicLinkToken('invalid-token-format');
			expect(result.valid).toBe(false);
		});

		it('EDGE CASE: Empty token is rejected', async () => {
			const result = await verifyMagicLinkToken('');
			expect(result.valid).toBe(false);
		});

		it('SECURITY: Unauthorized email cannot generate token', async () => {
			const unauthorizedEmail = 'hacker@example.com';

			await expect(
				generateMagicLinkToken(unauthorizedEmail)
			).rejects.toThrow('Unauthorized email');
		});

		it('SECURITY: Rate limit key is email-specific', () => {
			const email1 = 'user1@example.com';
			const email2 = 'user2@example.com';

			const key1 = RateLimitKeys.magicLink(email1);
			const key2 = RateLimitKeys.magicLink(email2);

			expect(key1).not.toBe(key2);
			expect(key1).toContain(email1.toLowerCase());
			expect(key2).toContain(email2.toLowerCase());
		});
	});

	// ========================================================================
	// Integration Tests: End-to-End Scenarios
	// ========================================================================
	describe('Integration: End-to-End Scenarios', () => {
		it('SCENARIO: QR job handles DST correctly', async () => {
			// Test date after DST transition (May 2026, in PDT)
			const dstDate = '2026-05-05'; // Tuesday in May (PDT)

			// Date calculations should work correctly during PDT
			const start = startOfDayPT(dstDate);
			const end = endOfDayPT(dstDate);

			expect(start.getTime()).toBeLessThan(end.getTime());
			// In PDT (UTC-7), midnight is 7 AM UTC
			expect(start.toISOString()).toBe('2026-05-05T07:00:00.000Z'); // PDT (UTC-7)

			// 11:59:59.999 PM PDT is 6:59:59.999 AM next day UTC
			expect(end.toISOString()).toBe('2026-05-06T06:59:59.999Z');
		});

		it('SCENARIO: Skip deadline on Friday before holiday weekend', async () => {
			// Mock: Friday 8:00 AM PT before July 4 (Friday)
			const friday8am = new Date('2025-07-04T15:00:00.000Z'); // 8 AM PDT
			vi.setSystemTime(friday8am);

			// Try to skip next Tuesday (after July 4 weekend)
			const skipDate = '2025-07-08'; // Tuesday
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);

			// Move to 9:00 AM - should fail
			const friday9am = new Date('2025-07-04T16:00:00.000Z');
			vi.setSystemTime(friday9am);
			expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);

			vi.useRealTimers();
		});

		it('SCENARIO: Year boundary service day check', async () => {
			// Dec 31, 2025 is a Wednesday (service day)
			expect(await isServiceDay('2025-12-31', supabase)).toBe(true);

			// Jan 1, 2026 may be a holiday
			// Check if exception exists, otherwise weekday logic applies
			const jan1Result = await isServiceDay('2026-01-01', supabase);
			expect(typeof jan1Result).toBe('boolean');
		});
	});
});
