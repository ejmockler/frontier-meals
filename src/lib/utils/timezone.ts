import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, isBefore, isAfter, startOfDay, endOfDay, addWeeks, nextFriday, previousFriday, getDay } from 'date-fns';

/**
 * Pacific Time Utility Library
 *
 * All time operations for Frontier Meals use Pacific Time (America/Los_Angeles)
 * to ensure consistent behavior across the application.
 *
 * This timezone automatically handles:
 * - PST (UTC-8) - November through March
 * - PDT (UTC-7) - March through November
 */

const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * Get the current date/time in Pacific Time
 */
export function nowInPT(): Date {
	return toZonedTime(new Date(), PACIFIC_TZ);
}

/**
 * Convert a date to Pacific Time
 */
export function toPacificTime(date: Date | string): Date {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	return toZonedTime(dateObj, PACIFIC_TZ);
}

/**
 * Convert a Pacific Time date to UTC for database storage
 */
export function fromPacificTime(date: Date): Date {
	return fromZonedTime(date, PACIFIC_TZ);
}

/**
 * Get today's date in Pacific Time (YYYY-MM-DD format)
 */
export function todayInPT(): string {
	return format(nowInPT(), 'yyyy-MM-dd', { timeZone: PACIFIC_TZ });
}

/**
 * Get tomorrow's date in Pacific Time (YYYY-MM-DD format)
 */
export function tomorrowInPT(): string {
	const tomorrow = addDays(nowInPT(), 1);
	return format(tomorrow, 'yyyy-MM-dd', { timeZone: PACIFIC_TZ });
}

/**
 * Format a date in Pacific Time
 */
export function formatInPT(date: Date | string, formatString: string): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	return format(dateObj, formatString, { timeZone: PACIFIC_TZ });
}

/**
 * Get the end of day (11:59:59.999 PM) in Pacific Time for a given date
 * Returns UTC Date object for database storage
 */
export function endOfDayPT(date: Date | string): Date {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	const ptDate = toPacificTime(dateObj);
	const endOfDayPT = setMilliseconds(
		setSeconds(
			setMinutes(
				setHours(ptDate, 23),
				59
			),
			59
		),
		999
	);
	return fromPacificTime(endOfDayPT);
}

/**
 * Get the start of day (12:00:00.000 AM) in Pacific Time for a given date
 * Returns UTC Date object for database storage
 */
export function startOfDayPT(date: Date | string): Date {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	const ptDate = toPacificTime(dateObj);
	const startOfDayPT = setMilliseconds(
		setSeconds(
			setMinutes(
				setHours(ptDate, 0),
				0
			),
			0
		),
		0
	);
	return fromPacificTime(startOfDayPT);
}

/**
 * Check if a date string (YYYY-MM-DD) is today in Pacific Time
 */
export function isToday(dateString: string): boolean {
	return dateString === todayInPT();
}

/**
 * Check if a date string (YYYY-MM-DD) is tomorrow in Pacific Time
 */
export function isTomorrow(dateString: string): boolean {
	return dateString === tomorrowInPT();
}

/**
 * Check if a date string (YYYY-MM-DD) is in the past relative to Pacific Time
 */
export function isInPast(dateString: string): boolean {
	const date = new Date(dateString + 'T00:00:00');
	const today = new Date(todayInPT() + 'T00:00:00');
	return isBefore(date, today);
}

/**
 * Check if a date string (YYYY-MM-DD) is in the future relative to Pacific Time
 */
export function isInFuture(dateString: string): boolean {
	const date = new Date(dateString + 'T00:00:00');
	const today = new Date(todayInPT() + 'T00:00:00');
	return isAfter(date, today);
}

/**
 * Get the next Friday at 09:00 AM PT from a given date
 * This is the week boundary for skip eligibility
 *
 * Returns UTC Date object for database comparison
 */
export function getNextFridayBoundary(date: Date | string = new Date()): Date {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	const ptDate = toPacificTime(dateObj);

	// Get the day of week (0 = Sunday, 5 = Friday)
	const dayOfWeek = getDay(ptDate);

	// If it's Friday before 9 AM, use today
	// If it's Friday after 9 AM or any other day, use next Friday
	let fridayDate: Date;

	if (dayOfWeek === 5) {
		// It's Friday - check if before or after 9 AM
		const nineAM = setMilliseconds(setSeconds(setMinutes(setHours(ptDate, 9), 0), 0), 0);
		if (isBefore(ptDate, nineAM)) {
			// Before 9 AM - use today
			fridayDate = ptDate;
		} else {
			// After 9 AM - use next Friday
			fridayDate = addWeeks(ptDate, 1);
		}
	} else if (dayOfWeek < 5) {
		// Before Friday this week - use upcoming Friday
		fridayDate = nextFriday(ptDate);
	} else {
		// Saturday or Sunday - use next Friday
		fridayDate = nextFriday(ptDate);
	}

	// Set to 9:00 AM
	const fridayAt9AM = setMilliseconds(
		setSeconds(
			setMinutes(
				setHours(fridayDate, 9),
				0
			),
			0
		),
		0
	);

	return fromPacificTime(fridayAt9AM);
}

/**
 * Get the current week boundary (most recent Friday 09:00 AM PT)
 * Returns UTC Date object for database comparison
 */
export function getCurrentWeekBoundary(): Date {
	const now = nowInPT();
	const dayOfWeek = getDay(now);

	// If it's Friday after 9 AM or later in the week, use this Friday
	// Otherwise use previous Friday
	let fridayDate: Date;

	if (dayOfWeek === 5) {
		// It's Friday - check if before or after 9 AM
		const nineAM = setMilliseconds(setSeconds(setMinutes(setHours(now, 9), 0), 0), 0);
		if (isBefore(now, nineAM)) {
			// Before 9 AM - use previous Friday
			fridayDate = addWeeks(now, -1);
		} else {
			// After 9 AM - use today
			fridayDate = now;
		}
	} else if (dayOfWeek > 5 || dayOfWeek === 0) {
		// Saturday or Sunday - use yesterday's Friday
		fridayDate = previousFriday(now);
	} else {
		// Monday-Thursday - use previous Friday
		fridayDate = previousFriday(now);
	}

	// Set to 9:00 AM
	const fridayAt9AM = setMilliseconds(
		setSeconds(
			setMinutes(
				setHours(fridayDate, 9),
				0
			),
			0
		),
		0
	);

	return fromPacificTime(fridayAt9AM);
}

/**
 * Check if a skip date is eligible for reimbursement
 *
 * A skip is eligible if it's for a week AFTER the current Friday 09:00 PT boundary
 *
 * @param skipDate - The date being skipped (YYYY-MM-DD format)
 * @returns true if eligible for reimbursement
 */
export function isSkipEligibleForReimbursement(skipDate: string): boolean {
	const skipDateObj = new Date(skipDate + 'T00:00:00');
	const nextBoundary = getNextFridayBoundary();

	// Skip must be in a week that starts AFTER the next boundary
	// This means the skip date must be >= the Friday after next boundary
	const weekAfterBoundary = addWeeks(nextBoundary, 1);

	return !isBefore(skipDateObj, weekAfterBoundary);
}
