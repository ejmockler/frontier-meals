import { todayInPT } from './timezone';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Singleton client instance to avoid "Multiple GoTrueClient instances" warning
let _supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client for service day checks
 * Uses service role key for database function access
 * Creates a singleton instance to avoid multiple client warnings
 */
function getSupabaseClient(): SupabaseClient | null {
	if (_supabaseClient) return _supabaseClient;

	// In server-side contexts, we'll have access to env variables
	if (typeof process !== 'undefined' && process.env) {
		const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
		const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
		_supabaseClient = createClient(supabaseUrl, supabaseKey);
		return _supabaseClient;
	}
	// In browser contexts, return null (isServiceDay will fall back to hardcoded logic)
	return null;
}

/**
 * Check if a date is a service day using database configuration
 * Falls back to hardcoded weekday logic if database is unavailable
 *
 * @param dateString - Date in YYYY-MM-DD format (Pacific Time)
 * @param clientOverride - Optional Supabase client (for testing)
 * @returns Promise<boolean> - true if service is available on this date
 */
export async function isServiceDay(
	dateString?: string,
	clientOverride?: SupabaseClient
): Promise<boolean> {
	const today = dateString || todayInPT(); // YYYY-MM-DD in Pacific Time

	const supabase = clientOverride || getSupabaseClient();
	if (!supabase) {
		// Fallback to simple weekday check if no database access
		// Use timezone-aware conversion: parse YYYY-MM-DD as Pacific Time, not UTC
		// This avoids hardcoded UTC offset which breaks during DST transitions
		const date = new Date(today); // Parse as local/UTC
		const ptDate = new Date(today + 'T12:00:00'); // Noon to avoid day boundary issues
		const dayOfWeek = ptDate.getUTCDay(); // Get day of week in UTC (works for YYYY-MM-DD strings)
		return dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri
	}

	try {
		// Call the database function is_service_day(date)
		const { data, error } = await supabase.rpc('is_service_day', {
			check_date: today
		});

		if (error) {
			console.error('Error checking service day:', error);
			// Fallback to weekday check on error
			// Use timezone-aware conversion instead of hardcoded -08:00
			const ptDate = new Date(today + 'T12:00:00');
			const dayOfWeek = ptDate.getUTCDay();
			return dayOfWeek >= 1 && dayOfWeek <= 5;
		}

		return data as boolean;
	} catch (err) {
		console.error('Exception checking service day:', err);
		// Fallback to weekday check on exception
		// Use timezone-aware conversion instead of hardcoded -08:00
		const ptDate = new Date(today + 'T12:00:00');
		const dayOfWeek = ptDate.getUTCDay();
		return dayOfWeek >= 1 && dayOfWeek <= 5;
	}
}

/**
 * Get next service date after given date
 * @param after - Date to start searching from (defaults to today)
 * @param clientOverride - Optional Supabase client (for testing)
 */
export async function getNextServiceDate(
	after?: string,
	clientOverride?: SupabaseClient
): Promise<string> {
	// Use timezone-aware date parsing instead of hardcoded -08:00
	// This ensures correct behavior during both PST (UTC-8) and PDT (UTC-7)
	let date = after ? new Date(after + 'T12:00:00') : new Date();

	// Increment day until we find a service day (max 7 days to avoid infinite loop)
	for (let i = 0; i < 7; i++) {
		date.setDate(date.getDate() + 1);
		const dateString = date.toISOString().substring(0, 10);
		if (await isServiceDay(dateString, clientOverride)) {
			return dateString;
		}
	}

	throw new Error('Could not find next service date within 7 days');
}
