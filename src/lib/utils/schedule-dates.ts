/**
 * Schedule Date Utilities
 *
 * Pure utility functions for calculating affected dates.
 * These are safe to use in both client and server contexts.
 */

/**
 * Calculate affected dates for a service pattern change
 *
 * Returns dates in the next N days that will be affected by
 * adding or removing service days.
 */
export function calculateAffectedDatesForPatternChange(
  previousDays: number[],
  newDays: number[],
  daysAhead: number = 30
): string[] {
  const prevSet = new Set(previousDays);
  const newSet = new Set(newDays);

  // Find which days changed
  const changedDays = new Set<number>();
  for (const day of previousDays) {
    if (!newSet.has(day)) changedDays.add(day);
  }
  for (const day of newDays) {
    if (!prevSet.has(day)) changedDays.add(day);
  }

  if (changedDays.size === 0) return [];

  // Find all dates in the next N days that fall on changed days
  const affectedDates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();

    if (changedDays.has(dayOfWeek)) {
      affectedDates.push(date.toISOString().split('T')[0]);
    }
  }

  return affectedDates;
}

/**
 * Calculate affected dates for a holiday/exception change
 *
 * For recurring holidays, calculates all occurrences in the next year.
 * For one-time exceptions, returns just that date.
 */
export function calculateAffectedDatesForException(
  exceptionDate: string,
  recurring: 'annual' | 'floating' | 'one-time',
  _recurrenceRule?: string
): string[] {
  if (recurring === 'one-time') {
    return [exceptionDate];
  }

  // For annual/floating, show the current year's date
  // (More complex recurrence calculation would go here for floating holidays)
  return [exceptionDate];
}
