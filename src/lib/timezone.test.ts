/**
 * Unit tests for timezone utility functions
 *
 * Tests critical business logic for skip eligibility and date handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSkipEligibleForReimbursement, todayInPT, endOfDayPT, startOfDayPT } from './utils/timezone';

describe('isSkipEligibleForReimbursement', () => {
  beforeEach(() => {
    // Reset date mocks before each test
    vi.useRealTimers();
  });

  it('should be eligible when skipping on Thursday for next week', () => {
    // Mock current time: Thursday 10:00 AM PT
    const thursday = new Date('2025-01-16T18:00:00.000Z'); // 10:00 AM PT
    vi.setSystemTime(thursday);

    // Skip date: next Monday (4 days out)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);
  });

  it('should be eligible when skipping on Friday before 9 AM PT', () => {
    // Mock current time: Friday 8:59 AM PT
    const friday859am = new Date('2025-01-17T16:59:00.000Z'); // 8:59 AM PT
    vi.setSystemTime(friday859am);

    // Skip date: next Monday (3 days out)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);
  });

  it('should NOT be eligible when skipping on Friday at 9:00 AM PT', () => {
    // Mock current time: Friday 9:00 AM PT exactly
    const friday9am = new Date('2025-01-17T17:00:00.000Z'); // 9:00 AM PT
    vi.setSystemTime(friday9am);

    // Skip date: next Monday (3 days out)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
  });

  it('should NOT be eligible when skipping on Friday after 9 AM PT', () => {
    // Mock current time: Friday 10:00 AM PT
    const friday10am = new Date('2025-01-17T18:00:00.000Z'); // 10:00 AM PT
    vi.setSystemTime(friday10am);

    // Skip date: next Monday (3 days out)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
  });

  it('should NOT be eligible when skipping on Saturday', () => {
    // Mock current time: Saturday 10:00 AM PT
    const saturday = new Date('2025-01-18T18:00:00.000Z'); // 10:00 AM PT
    vi.setSystemTime(saturday);

    // Skip date: next Monday (2 days out)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
  });

  it('should NOT be eligible when skipping on Sunday', () => {
    // Mock current time: Sunday 10:00 AM PT
    const sunday = new Date('2025-01-19T18:00:00.000Z'); // 10:00 AM PT
    vi.setSystemTime(sunday);

    // Skip date: next day (Monday)
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
  });

  it('should NOT be eligible when skipping on Monday for same week', () => {
    // Mock current time: Monday 10:00 AM PT
    const monday = new Date('2025-01-20T18:00:00.000Z'); // 10:00 AM PT
    vi.setSystemTime(monday);

    // Skip date: same day
    const skipDate = '2025-01-20'; // Monday

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(false);
  });

  it('should handle Daylight Saving Time transitions', () => {
    // Mock current time: Day before DST starts (Thursday before)
    const beforeDST = new Date('2025-03-06T18:00:00.000Z'); // Thursday 10:00 AM PST
    vi.setSystemTime(beforeDST);

    // Skip date: After DST starts (next Monday)
    const skipDate = '2025-03-10'; // Monday (after DST)

    expect(isSkipEligibleForReimbursement(skipDate)).toBe(true);
  });
});

describe('todayInPT', () => {
  it('should return YYYY-MM-DD in Pacific Time', () => {
    // Mock: UTC midnight (which is 4 PM PT previous day)
    const utcMidnight = new Date('2025-01-16T00:00:00.000Z');
    vi.setSystemTime(utcMidnight);

    const result = todayInPT();

    expect(result).toBe('2025-01-15'); // Should be previous day in PT
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should handle year boundary correctly', () => {
    // Mock: Jan 1 UTC (which is Dec 31 PT)
    const jan1UTC = new Date('2025-01-01T00:00:00.000Z');
    vi.setSystemTime(jan1UTC);

    const result = todayInPT();

    expect(result).toBe('2024-12-31'); // Should be previous year
  });
});

describe('endOfDayPT', () => {
  it('should return 11:59:59.999 PM PT as UTC', () => {
    const date = '2025-01-16';
    const result = endOfDayPT(date);

    // Should be midnight next day in UTC (8 hours ahead of PT)
    expect(result.toISOString()).toBe('2025-01-17T07:59:59.999Z'); // 11:59:59.999 PM PST
  });

  it('should handle DST dates correctly', () => {
    // Date during PDT (7 hours behind UTC)
    const summerDate = '2025-06-15';
    const result = endOfDayPT(summerDate);

    expect(result.toISOString()).toBe('2025-06-16T06:59:59.999Z'); // 11:59:59.999 PM PDT
  });
});

describe('startOfDayPT', () => {
  it('should return midnight PT as UTC', () => {
    const date = '2025-01-16';
    const result = startOfDayPT(date);

    // Should be 8 AM UTC (midnight PST)
    expect(result.toISOString()).toBe('2025-01-16T08:00:00.000Z');
  });

  it('should handle DST dates correctly', () => {
    // Date during PDT (7 hours behind UTC)
    const summerDate = '2025-06-15';
    const result = startOfDayPT(summerDate);

    expect(result.toISOString()).toBe('2025-06-15T07:00:00.000Z'); // midnight PDT
  });
});

describe('Edge cases', () => {
  it('should handle leap year dates', () => {
    const leapDay = '2024-02-29';

    expect(() => startOfDayPT(leapDay)).not.toThrow();
    expect(() => endOfDayPT(leapDay)).not.toThrow();

    const start = startOfDayPT(leapDay);
    const end = endOfDayPT(leapDay);

    expect(start < end).toBe(true);
  });

  it('should handle month boundaries', () => {
    const endOfMonth = '2025-01-31';
    const startOfMonth = '2025-02-01';

    const endPT = endOfDayPT(endOfMonth);
    const startPT = startOfDayPT(startOfMonth);

    // End of Jan 31 PT should be before start of Feb 1 PT
    expect(endPT < startPT).toBe(true);
  });
});
