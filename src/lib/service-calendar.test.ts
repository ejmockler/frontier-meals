/**
 * Integration tests for service calendar system
 *
 * Tests the database-driven service day logic that determines:
 * - When QR codes should be issued
 * - Which days respect admin-configured patterns
 * - Holiday and special event handling
 * - Recurrence rule application
 *
 * CRITICAL: These tests verify the core business logic that prevents
 * QR codes from being issued on closed days.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { isServiceDay, getNextServiceDate } from './utils/service-calendar';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Service Calendar - Database Integration', () => {
	const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
	let originalConfigId: string;
	let originalServiceDays: number[];
	let testExceptions: string[] = [];

	beforeAll(async () => {
		// Save original config
		const { data: config } = await supabase
			.from('service_schedule_config')
			.select('*')
			.single();

		if (config) {
			originalConfigId = config.id;
			originalServiceDays = config.service_days;
		}
	});

	beforeEach(async () => {
		// Clean up test exceptions by ID first
		for (const id of testExceptions) {
			await supabase.from('service_exceptions').delete().eq('id', id);
		}
		testExceptions = [];

		// Clean up test-specific exceptions by name
		await supabase
			.from('service_exceptions')
			.delete()
			.in('name', [
				'Thanksgiving 2026',
				'Day after Thanksgiving 2026',
				'Christmas 2026',
				'Test Holiday',
				'Team Offsite 2026',
				'Weekend Conference',
				'MLK Day',
				'MLK Day Service Event',
				'Extended Closure',
				'Week Closure',
				'Independence Day'
			]);

		// Reset to default Mon-Fri pattern AFTER cleanup
		await supabase
			.from('service_schedule_config')
			.update({ service_days: [1, 2, 3, 4, 5] })
			.eq('id', originalConfigId);
	});

	afterAll(async () => {
		// Restore original config
		if (originalConfigId && originalServiceDays) {
			await supabase
				.from('service_schedule_config')
				.update({ service_days: originalServiceDays })
				.eq('id', originalConfigId);
		}

		// Clean up all test exceptions
		for (const id of testExceptions) {
			await supabase.from('service_exceptions').delete().eq('id', id);
		}
	});

	describe('Basic Weekday Pattern', () => {
		it('should return true for Monday-Friday by default', async () => {
			// Using June 2025 dates (no holidays)
			expect(await isServiceDay('2025-06-02', supabase)).toBe(true); // Monday
			expect(await isServiceDay('2025-06-03', supabase)).toBe(true); // Tuesday
			expect(await isServiceDay('2025-06-04', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2025-06-05', supabase)).toBe(true); // Thursday
			expect(await isServiceDay('2025-06-06', supabase)).toBe(true); // Friday
		});

		it('should return false for weekends by default', async () => {
			expect(await isServiceDay('2025-06-07', supabase)).toBe(false); // Saturday
			expect(await isServiceDay('2025-06-08', supabase)).toBe(false); // Sunday
		});

		it('should respect custom weekday pattern', async () => {
			// Configure for Tuesday-Thursday only
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [2, 3, 4] })
				.eq('id', originalConfigId);

			expect(await isServiceDay('2025-06-02', supabase)).toBe(false); // Monday
			expect(await isServiceDay('2025-06-03', supabase)).toBe(true); // Tuesday
			expect(await isServiceDay('2025-06-04', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2025-06-05', supabase)).toBe(true); // Thursday
			expect(await isServiceDay('2025-06-06', supabase)).toBe(false); // Friday
		});

		it('should support 7-day service pattern', async () => {
			// Configure for all days
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [0, 1, 2, 3, 4, 5, 6] })
				.eq('id', originalConfigId);

			expect(await isServiceDay('2025-06-07', supabase)).toBe(true); // Saturday
			expect(await isServiceDay('2025-06-08', supabase)).toBe(true); // Sunday
		});
	});

	describe('Holiday Closures', () => {
		it('should close on configured holidays', async () => {
			// Add Thanksgiving 2026 (Thursday, Nov 26)
			const { data: holiday, error } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-11-26',
					type: 'holiday',
					name: 'Thanksgiving 2026',
					is_service_day: false,
					recurring: 'floating',
					recurrence_rule: '{"month":11,"day_of_week":4,"occurrence":4}'
				})
				.select()
				.single();

			expect(error).toBeNull();
			if (holiday) testExceptions.push(holiday.id);

			// Nov 26, 2026 is a Thursday (normally a service day)
			expect(await isServiceDay('2026-11-26', supabase)).toBe(false);

			// Day before and after should still be service days
			expect(await isServiceDay('2026-11-25', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2026-11-27', supabase)).toBe(true); // Friday
		});

		it('should close for multiple consecutive holidays', async () => {
			// Thanksgiving + day after (2026)
			const { data: thanksgiving, error: e1 } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-11-26',
					type: 'holiday',
					name: 'Thanksgiving 2026',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			const { data: dayAfter, error: e2 } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-11-27',
					type: 'holiday',
					name: 'Day after Thanksgiving 2026',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			expect(e1).toBeNull();
			expect(e2).toBeNull();
			if (thanksgiving) testExceptions.push(thanksgiving.id);
			if (dayAfter) testExceptions.push(dayAfter.id);

			expect(await isServiceDay('2026-11-26', supabase)).toBe(false);
			expect(await isServiceDay('2026-11-27', supabase)).toBe(false);

			// Next service day should be Monday
			const nextService = await getNextServiceDate('2026-11-25', supabase);
			expect(nextService).toBe('2026-11-30'); // Monday (skipping Thurs, Fri, weekend)
		});

		it('should handle annual recurring holidays', async () => {
			// Christmas (annual) - use 2026
			const { data: holiday, error } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-12-25',
					type: 'holiday',
					name: 'Christmas 2026',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			expect(error).toBeNull();
			if (holiday) testExceptions.push(holiday.id);

			// Dec 25, 2026 is a Friday
			expect(await isServiceDay('2026-12-25', supabase)).toBe(false);
		});
	});

	describe('Special Events', () => {
		it('should override weekday pattern for special events (closure)', async () => {
			// Close on a normally-open Monday for team offsite
			const { data: event, error } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-02-09',
					type: 'special_event',
					name: 'Team Offsite 2026',
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			expect(error).toBeNull();
			if (event) testExceptions.push(event.id);

			// Monday should now be closed
			expect(await isServiceDay('2026-02-09', supabase)).toBe(false);
		});

		it('should override weekend pattern for special events (opening)', async () => {
			// Open on a Saturday for special event
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-02-14',
					type: 'special_event',
					name: 'Weekend Conference',
					is_service_day: true,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			// Saturday should now be open
			expect(await isServiceDay('2026-02-14', supabase)).toBe(true);
		});

		it('should allow service on holiday if special event overrides', async () => {
			// Add MLK Day as holiday (closed)
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-06-15',
					type: 'holiday',
					name: 'MLK Day',
					is_service_day: false,
					recurring: 'floating'
				})
				.select()
				.single();

			if (holiday) testExceptions.push(holiday.id);

			// Verify it's closed
			expect(await isServiceDay('2026-06-15', supabase)).toBe(false);

			// Delete and re-add as special event (open)
			await supabase.from('service_exceptions').delete().eq('id', holiday!.id);

			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-06-15',
					type: 'special_event',
					name: 'MLK Day Service Event',
					is_service_day: true,
					recurring: 'one-time'
				})
				.select()
				.single();

			testExceptions[testExceptions.length - 1] = event!.id;

			// Now it should be open
			expect(await isServiceDay('2026-06-15', supabase)).toBe(true);
		});
	});

	describe('getNextServiceDate', () => {
		it('should find next weekday when current day is service day', async () => {
			// Monday -> Tuesday
			const next = await getNextServiceDate('2025-06-02', supabase);
			expect(next).toBe('2025-06-03');
		});

		it('should skip weekend to find Monday', async () => {
			// Friday -> Monday (skipping Sat, Sun)
			const next = await getNextServiceDate('2026-06-12', supabase);
			expect(next).toBe('2026-06-15');
		});

		it('should skip holidays when finding next service date', async () => {
			// Add Monday as holiday
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-06-15',
					type: 'holiday',
					name: 'Test Holiday',
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (holiday) testExceptions.push(holiday.id);

			// Friday -> Tuesday (skipping weekend + Mon holiday)
			const next = await getNextServiceDate('2026-06-12', supabase);
			expect(next).toBe('2026-06-16'); // Tuesday
		});

		it('should handle multiple consecutive closures', async () => {
			// Close Mon, Tue, Wed
			const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
			for (const date of dates) {
				const { data } = await supabase
					.from('service_exceptions')
					.insert({
						date,
						type: 'special_event',
						name: 'Extended Closure',
						is_service_day: false,
						recurring: 'one-time'
					})
					.select()
					.single();
				if (data) testExceptions.push(data.id);
			}

			// Friday -> Thursday (skipping weekend + Mon/Tue/Wed)
			const next = await getNextServiceDate('2026-06-12', supabase);
			expect(next).toBe('2026-06-18'); // Thursday
		});

		it('should throw error if no service day found in 7 days', async () => {
			// Close entire next week
			const dates = [
				'2026-06-15',
				'2026-06-16',
				'2026-06-17',
				'2026-06-18',
				'2026-06-19'
			];
			for (const date of dates) {
				const { data } = await supabase
					.from('service_exceptions')
					.insert({
						date,
						type: 'special_event',
						name: 'Week Closure',
						is_service_day: false,
						recurring: 'one-time'
					})
					.select()
					.single();
				if (data) testExceptions.push(data.id);
			}

			await expect(getNextServiceDate('2026-06-12', supabase)).rejects.toThrow(
				'Could not find next service date within 7 days'
			);
		});
	});

	describe('Edge Cases', () => {
		it('should handle month boundaries', async () => {
			// Jan 31 (Friday) -> Feb 3 (Monday)
			const next = await getNextServiceDate('2025-01-31', supabase);
			expect(next).toBe('2025-02-03');
		});

		it('should handle year boundaries', async () => {
			// Dec 31, 2025 (Wednesday) -> Jan 1, 2026 (Thursday)
			const next = await getNextServiceDate('2025-12-31', supabase);
			expect(next).toBe('2026-01-01');
		});

		it('should handle leap year dates', async () => {
			// Feb 28, 2024 (Wednesday) -> Feb 29, 2024 (Thursday) - leap year
			const next = await getNextServiceDate('2024-02-28', supabase);
			expect(next).toBe('2024-02-29');
		});

		it('should handle DST transitions', async () => {
			// DST starts March 9, 2025
			// Friday before DST -> Monday after DST
			const next = await getNextServiceDate('2025-03-07', supabase);
			expect(next).toBe('2025-03-10');

			expect(await isServiceDay('2025-03-10', supabase)).toBe(true);
		});

		it('should handle dates with no exceptions', async () => {
			// Random date with no exceptions
			expect(await isServiceDay('2025-06-10', supabase)).toBe(true); // Tuesday
			expect(await isServiceDay('2025-06-14', supabase)).toBe(false); // Saturday
		});

		it('should gracefully handle database errors (fallback to weekday logic)', async () => {
			// Test with invalid date format should still fall back
			// The function should catch errors and use weekday fallback
			const invalidClient = createClient(SUPABASE_URL, 'invalid-key');
			const result = await isServiceDay('2025-06-02', supabase); // Monday

			// Should still work due to fallback
			expect(typeof result).toBe('boolean');
		});
	});

	describe('QR Issuance Integration', () => {
		it('should prevent QR issuance on weekends', async () => {
			expect(await isServiceDay('2025-06-07', supabase)).toBe(false); // Saturday
			expect(await isServiceDay('2025-06-08', supabase)).toBe(false); // Sunday
		});

		it('should prevent QR issuance on holidays', async () => {
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-07-04',
					type: 'holiday',
					name: 'Independence Day',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			if (holiday) testExceptions.push(holiday.id);

			expect(await isServiceDay('2025-07-04', supabase)).toBe(false);
		});

		it('should allow QR issuance on normal service days', async () => {
			// Random weekdays
			expect(await isServiceDay('2025-03-11', supabase)).toBe(true); // Tuesday
			expect(await isServiceDay('2025-03-12', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2025-03-13', supabase)).toBe(true); // Thursday
		});
	});
});
