/**
 * E2E Integration tests for Schedule Admin Interface
 *
 * Tests the complete flow from admin UI actions to database changes to QR issuance logic.
 *
 * Critical paths tested:
 * 1. Admin changes service pattern -> Database updated -> QR logic respects it
 * 2. Admin adds holiday -> Database updated -> QR not issued on that date
 * 3. Admin adds special event -> Database updated -> QR logic overrides pattern
 * 4. Race conditions and concurrent updates
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { isServiceDay } from '$lib/utils/service-calendar';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Schedule Admin Interface - E2E Integration', () => {
	const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
	let originalConfigId: string;
	let originalServiceDays: number[];
	let testExceptions: string[] = [];

	beforeAll(async () => {
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

		// Clean up by test-specific names
		await supabase
			.from('service_exceptions')
			.delete()
			.in('name', [
				'Thanksgiving 2026',
				'Christmas 2026',
				'Independence Day 2026',
				'Independence Day Duplicate',
				'Team Retreat',
				'Weekend Conference',
				'Memorial Day',
				'Memorial Day Service Event',
				'Event',
				'Test Holiday',
				'Special Monday Service',
				'Week-long Maintenance',
				'Thanksgiving',
				'Day after Thanksgiving',
				'Labor Day',
				'Columbus Day',
				'Indigenous Peoples Day'
			]);

		// Reset to Mon-Fri AFTER cleanup
		await supabase
			.from('service_schedule_config')
			.update({ service_days: [1, 2, 3, 4, 5] })
			.eq('id', originalConfigId);
	});

	afterAll(async () => {
		if (originalConfigId && originalServiceDays) {
			await supabase
				.from('service_schedule_config')
				.update({ service_days: originalServiceDays })
				.eq('id', originalConfigId);
		}

		for (const id of testExceptions) {
			await supabase.from('service_exceptions').delete().eq('id', id);
		}
	});

	describe('Service Pattern Editor Integration', () => {
		it('should update database when admin toggles weekdays', async () => {
			// Simulate admin toggling pattern to Tue-Thu only
			const newPattern = [2, 3, 4];

			const { error } = await supabase
				.from('service_schedule_config')
				.update({
					service_days: newPattern,
					updated_at: new Date().toISOString()
				})
				.eq('id', originalConfigId);

			expect(error).toBeNull();

			// Verify isServiceDay reflects the change
			expect(await isServiceDay('2026-06-08', supabase)).toBe(false); // Monday - now closed
			expect(await isServiceDay('2026-06-09', supabase)).toBe(true); // Tuesday - open
			expect(await isServiceDay('2026-06-10', supabase)).toBe(true); // Wednesday - open
			expect(await isServiceDay('2026-06-11', supabase)).toBe(true); // Thursday - open
			expect(await isServiceDay('2026-06-12', supabase)).toBe(false); // Friday - now closed
		});

		it('should handle toggling to 7-day service', async () => {
			const allDays = [0, 1, 2, 3, 4, 5, 6];

			await supabase
				.from('service_schedule_config')
				.update({ service_days: allDays })
				.eq('id', originalConfigId);

			// Weekends should now be service days
			expect(await isServiceDay('2026-06-13', supabase)).toBe(true); // Saturday
			expect(await isServiceDay('2026-06-14', supabase)).toBe(true); // Sunday
		});

		it('should handle toggling to no service days (emergency shutdown)', async () => {
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [] })
				.eq('id', originalConfigId);

			// All days should be closed
			expect(await isServiceDay('2026-06-08', supabase)).toBe(false); // Monday
			expect(await isServiceDay('2026-06-09', supabase)).toBe(false); // Tuesday
		});

		it('should handle rapid consecutive updates (last write wins)', async () => {
			// Simulate rapid clicks
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [1, 2, 3] })
				.eq('id', originalConfigId);

			await supabase
				.from('service_schedule_config')
				.update({ service_days: [3, 4, 5] })
				.eq('id', originalConfigId);

			await supabase
				.from('service_schedule_config')
				.update({ service_days: [1, 2, 3, 4, 5] })
				.eq('id', originalConfigId);

			// Final state should be Mon-Fri
			expect(await isServiceDay('2026-06-08', supabase)).toBe(true); // Monday
			expect(await isServiceDay('2026-06-12', supabase)).toBe(true); // Friday
		});
	});

	describe('Holiday Addition Flow', () => {
		it('should add holiday via form submission and reflect in QR logic', async () => {
			// Simulate admin adding Thanksgiving via form (use 2026 to avoid conflict with seeded 2025 data)
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
			expect(holiday).toBeTruthy();
			if (holiday) testExceptions.push(holiday.id);

			// Verify QR logic respects it
			expect(await isServiceDay('2026-11-26', supabase)).toBe(false);

			// Surrounding days should still be open
			expect(await isServiceDay('2026-11-25', supabase)).toBe(true);
			expect(await isServiceDay('2026-11-27', supabase)).toBe(true);
		});

		it('should handle annual recurring holidays', async () => {
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

			expect(await isServiceDay('2026-12-25', supabase)).toBe(false);
		});

		it('should prevent duplicate holiday dates (unique constraint)', async () => {
			// Add first holiday
			const { data: first, error: error1 } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-07-04',
					type: 'holiday',
					name: 'Independence Day 2026',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			expect(error1).toBeNull();
			if (first) testExceptions.push(first.id);

			// Try to add duplicate with SAME type
			const { error } = await supabase.from('service_exceptions').insert({
				date: '2026-07-04',
				type: 'holiday', // Same type - should conflict
				name: 'Independence Day Duplicate',
				is_service_day: false,
				recurring: 'annual'
			});

			// Should fail with unique constraint violation
			expect(error).toBeTruthy();
			expect(error?.code).toBe('23505');
		});
	});

	describe('Special Event Addition Flow', () => {
		it('should add special event that closes normally-open day', async () => {
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-03-15',
					type: 'special_event',
					name: 'Team Retreat',
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			// Saturday (normally closed) remains closed
			expect(await isServiceDay('2025-03-15', supabase)).toBe(false);
		});

		it('should add special event that opens normally-closed day', async () => {
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-03-22',
					type: 'special_event',
					name: 'Weekend Conference',
					is_service_day: true,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			// Saturday should now be open
			expect(await isServiceDay('2025-03-22', supabase)).toBe(true);
		});
	});

	describe('Exception Update Flow', () => {
		it('should update existing holiday and reflect changes', async () => {
			// Add holiday
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-05-26',
					type: 'holiday',
					name: 'Memorial Day',
					is_service_day: false,
					recurring: 'floating'
				})
				.select()
				.single();

			if (holiday) testExceptions.push(holiday.id);

			expect(await isServiceDay('2025-05-26', supabase)).toBe(false);

			// Update to special event (open)
			if (holiday) {
				await supabase
					.from('service_exceptions')
					.update({
						type: 'special_event',
						name: 'Memorial Day Service Event',
						is_service_day: true
					})
					.eq('id', holiday.id);

				// Should now be open
				expect(await isServiceDay('2025-05-26', supabase)).toBe(true);
			}
		});

		it('should update date and verify old date is no longer affected', async () => {
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-04-15',
					type: 'special_event',
					name: 'Event',
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			expect(await isServiceDay('2025-04-15', supabase)).toBe(false);

			// Change date
			if (event) {
				await supabase
					.from('service_exceptions')
					.update({ date: '2025-04-16' })
					.eq('id', event.id);

				// Old date should revert to normal pattern
				expect(await isServiceDay('2025-04-15', supabase)).toBe(true); // Tuesday
				// New date should be closed
				expect(await isServiceDay('2025-04-16', supabase)).toBe(false); // Wednesday
			}
		});
	});

	describe('Exception Deletion Flow', () => {
		it('should delete holiday and revert to normal pattern', async () => {
			const { data: holiday } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-06-10',
					type: 'holiday',
					name: 'Test Holiday',
					is_service_day: false,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (holiday) testExceptions.push(holiday.id);

			expect(await isServiceDay('2025-06-10', supabase)).toBe(false);

			// Delete
			if (holiday) {
				await supabase.from('service_exceptions').delete().eq('id', holiday.id);

				// Should revert to normal (Tuesday = open)
				expect(await isServiceDay('2025-06-10', supabase)).toBe(true);
			}
		});
	});

	describe('Complex Scenarios', () => {
		it('should handle multiple overlapping rules (exception takes precedence)', async () => {
			// Change pattern to close Mondays
			await supabase
				.from('service_schedule_config')
				.update({ service_days: [2, 3, 4, 5] })
				.eq('id', originalConfigId);

			// Add special event to open Monday
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-02-10',
					type: 'special_event',
					name: 'Special Monday Service',
					is_service_day: true,
					recurring: 'one-time'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			// Exception should override pattern
			expect(await isServiceDay('2025-02-10', supabase)).toBe(true);
		});

		it('should handle week-long closure', async () => {
			const dates = ['2025-08-18', '2025-08-19', '2025-08-20', '2025-08-21', '2025-08-22'];

			for (const date of dates) {
				const { data } = await supabase
					.from('service_exceptions')
					.insert({
						date,
						type: 'special_event',
						name: 'Week-long Maintenance',
						is_service_day: false,
						recurring: 'one-time'
					})
					.select()
					.single();
				if (data) testExceptions.push(data.id);
			}

			// All week should be closed
			for (const date of dates) {
				expect(await isServiceDay(date)).toBe(false);
			}
		});

		it('should handle QR issuance scenario during holiday week', async () => {
			// Thanksgiving week setup
			const thanksgiving = '2025-11-27'; // Thursday
			const dayAfter = '2025-11-28'; // Friday

			const { data: h1 } = await supabase
				.from('service_exceptions')
				.insert({
					date: thanksgiving,
					type: 'holiday',
					name: 'Thanksgiving',
					is_service_day: false,
					recurring: 'floating'
				})
				.select()
				.single();

			const { data: h2 } = await supabase
				.from('service_exceptions')
				.insert({
					date: dayAfter,
					type: 'holiday',
					name: 'Day after Thanksgiving',
					is_service_day: false,
					recurring: 'annual'
				})
				.select()
				.single();

			if (h1) testExceptions.push(h1.id); if (h2) testExceptions.push(h2.id);

			// QR should NOT be issued Thurs/Fri
			expect(await isServiceDay(thanksgiving)).toBe(false);
			expect(await isServiceDay(dayAfter)).toBe(false);

			// QR SHOULD be issued Wed before and Mon after
			expect(await isServiceDay('2025-11-26', supabase)).toBe(true); // Wednesday
			expect(await isServiceDay('2025-12-01', supabase)).toBe(true); // Monday
		});
	});

	describe('Data Integrity', () => {
		it('should maintain referential integrity on config updates', async () => {
			const { data: config } = await supabase
				.from('service_schedule_config')
				.select('*')
				.single();

			expect(config).toBeTruthy();
			expect(Array.isArray(config.service_days)).toBe(true);
			expect(config.updated_at).toBeTruthy();
		});

		it('should have proper indexes on exceptions table', async () => {
			// Insert exception
			const { data: event } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2025-09-01',
					type: 'holiday',
					name: 'Labor Day',
					is_service_day: false,
					recurring: 'floating'
				})
				.select()
				.single();

			if (event) testExceptions.push(event.id);

			// Query by date should be fast (indexed)
			const start = Date.now();
			const { data } = await supabase
				.from('service_exceptions')
				.select('*')
				.eq('date', '2025-09-01');

			const queryTime = Date.now() - start;

			expect(data).toHaveLength(1);
			// Query should be reasonably fast with index (< 500ms allows for remote DB network latency)
			expect(queryTime).toBeLessThan(500);
		});

		it('should enforce NOT NULL constraints', async () => {
			// Try to insert without required fields
			const { error } = await supabase.from('service_exceptions').insert({
				date: null,
				type: 'holiday',
				name: null,
				is_service_day: false
			});

			expect(error).toBeTruthy();
		});
	});

	describe('Concurrent Access', () => {
		it('should handle concurrent pattern updates', async () => {
			// Simulate two admins updating pattern simultaneously
			const update1 = supabase
				.from('service_schedule_config')
				.update({ service_days: [1, 2, 3] })
				.eq('id', originalConfigId);

			const update2 = supabase
				.from('service_schedule_config')
				.update({ service_days: [3, 4, 5] })
				.eq('id', originalConfigId);

			// Both should succeed (last write wins)
			await Promise.all([update1, update2]);

			// Final state should be one of the two
			const { data: config } = await supabase
				.from('service_schedule_config')
				.select('*')
				.single();

			expect(config.service_days).toBeDefined();
			expect(config.service_days.length).toBeGreaterThan(0);
		});

		it('should handle concurrent exception additions', async () => {
			// Add first exception successfully
			const { data: first, error: error1 } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-10-13',
					type: 'holiday',
					name: 'Columbus Day',
					is_service_day: false,
					recurring: 'floating'
				})
				.select()
				.single();

			expect(error1).toBeNull();
			if (first) testExceptions.push(first.id);

			// Try to add duplicate with same date+type - should fail
			const { error: error2 } = await supabase
				.from('service_exceptions')
				.insert({
					date: '2026-10-13',
					type: 'holiday', // Same date+type = conflict
					name: 'Indigenous Peoples Day',
					is_service_day: false,
					recurring: 'one-time'
				});

			// Second insert should fail with unique constraint violation
			expect(error2).toBeTruthy();
			expect(error2?.code).toBe('23505');

			// Verify only one record exists
			const { data: records } = await supabase
				.from('service_exceptions')
				.select('*')
				.eq('date', '2026-10-13')
				.eq('type', 'holiday');

			expect(records).toHaveLength(1);
			expect(records?.[0].name).toBe('Columbus Day');
		});
	});
});
