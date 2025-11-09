import { todayInPT } from './timezone';

/**
 * Days when SF restaurants are typically closed
 * Frontier Tower is always open - but no meals available if restaurants closed
 * Format: MM-DD (month-day, leading zeros)
 *
 * Update annually for floating holidays like Thanksgiving
 */
const RESTAURANT_CLOSED_DAYS = new Set([
  '01-01', // New Year's Day
  '05-26', // Memorial Day 2025 (last Monday of May)
  '07-04', // Independence Day
  '09-01', // Labor Day 2025 (first Monday of September)
  '11-27', // Thanksgiving 2025 (fourth Thursday of November)
  '11-28', // Day after Thanksgiving 2025 (most restaurants closed)
  '12-24', // Christmas Eve (many restaurants close early/all day)
  '12-25', // Christmas Day
  '12-31', // New Year's Eve (many restaurants close early/all day)
]);

/**
 * Check if today is a service day (weekday or major holiday)
 * Returns true if QR codes should be issued today
 */
export function isServiceDay(dateString?: string): boolean {
  const today = dateString || todayInPT(); // YYYY-MM-DD in Pacific Time
  const date = new Date(today + 'T12:00:00-08:00'); // Parse in Pacific Time at noon

  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
  const monthDay = today.substring(5); // Extract MM-DD from YYYY-MM-DD

  // No service if restaurants are closed (holidays)
  if (RESTAURANT_CLOSED_DAYS.has(monthDay)) {
    return false;
  }

  // Service on weekdays (Mon-Fri)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    return true;
  }

  // No service on weekends
  return false;
}

/**
 * Get next service date after given date
 */
export function getNextServiceDate(after?: string): string {
  let date = after ? new Date(after + 'T12:00:00-08:00') : new Date();

  // Increment day until we find a service day (max 7 days to avoid infinite loop)
  for (let i = 0; i < 7; i++) {
    date.setDate(date.getDate() + 1);
    const dateString = date.toISOString().substring(0, 10);
    if (isServiceDay(dateString)) {
      return dateString;
    }
  }

  throw new Error('Could not find next service date within 7 days');
}
