import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	sendScheduleChangeNotification,
	getActiveCustomerCount
} from '$lib/email/schedule-notifications';
import { getAdminSession } from '$lib/auth/session';
import { validateCSRFFromFormData } from '$lib/auth/csrf';

// C2 FIX: Date format validation helper
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateFormat(date: string): boolean {
	return DATE_FORMAT_REGEX.test(date);
}

// C3 FIX: Recurrence rule validation helper
interface RecurrenceRule {
	type: 'floating';
	month: number;
	week: number;
	dayOfWeek: number;
}

function isValidRecurrenceRule(rule: unknown): rule is RecurrenceRule {
	if (typeof rule !== 'object' || rule === null) return false;
	const r = rule as Record<string, unknown>;
	return (
		r.type === 'floating' &&
		typeof r.month === 'number' && r.month >= 1 && r.month <= 12 &&
		typeof r.week === 'number' && r.week >= 1 && r.week <= 5 &&
		typeof r.dayOfWeek === 'number' && r.dayOfWeek >= 0 && r.dayOfWeek <= 6
	);
}

async function fetchHolidays(supabase: any) {
	const { data: exceptions } = await supabase
		.from('service_exceptions')
		.select('*')
		.eq('type', 'holiday')
		.order('date', { ascending: true });

	return exceptions || [];
}

async function fetchSpecialEvents(supabase: any) {
	const { data: exceptions } = await supabase
		.from('service_exceptions')
		.select('*')
		.eq('type', 'special_event')
		.order('date', { ascending: true });

	return exceptions || [];
}

export const load: PageServerLoad = async ({ locals: { supabase }, parent, depends }) => {
	depends('app:schedule-config');
	depends('app:schedule-exceptions');

	// Session already validated by parent layout - just get it
	const { session } = await parent();

	// Load service schedule config
	const { data: config } = await supabase
		.from('service_schedule_config')
		.select('*')
		.single();

	return {
		config: config || { service_days: [1, 2, 3, 4, 5] },
		holidays: fetchHolidays(supabase),
		specialEvents: fetchSpecialEvents(supabase),
		// Stream this - don't await (only used for display in notification modal)
		activeCustomerCount: getActiveCustomerCount(supabase)
	};
};

export const actions: Actions = {
	updateServicePattern: async ({ request, cookies, locals: { supabase } }) => {
		const session = await getAdminSession(cookies);
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();

		// C10 FIX: Validate CSRF token
		if (!await validateCSRFFromFormData(formData, session.sessionId)) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		// Get staff ID from email
		const { data: staff } = await supabase
			.from('staff_accounts')
			.select('id')
			.eq('email', session.email)
			.single();

		const serviceDaysStr = formData.get('service_days') as string;

		if (!serviceDaysStr) {
			return fail(400, { error: 'Missing service_days' });
		}

		// C1 FIX: Wrap JSON.parse in try-catch
		let serviceDays: unknown;
		try {
			serviceDays = JSON.parse(serviceDaysStr);
		} catch {
			return fail(400, { error: 'Invalid service_days format. Please provide valid JSON.' });
		}

		// C4 FIX: Validate service_days array contains only integers 0-6
		if (!Array.isArray(serviceDays)) {
			return fail(400, { error: 'service_days must be an array' });
		}
		for (const day of serviceDays) {
			if (!Number.isInteger(day) || day < 0 || day > 6) {
				return fail(400, { error: 'service_days must contain only integers from 0 (Sunday) to 6 (Saturday)' });
			}
		}

		const { error } = await supabase
			.from('service_schedule_config')
			.update({
				service_days: serviceDays,
				updated_at: new Date().toISOString(),
				updated_by: staff?.id || null
			})
			.eq('id', (await supabase.from('service_schedule_config').select('id').single()).data?.id);

		if (error) {
			console.error('Error updating service pattern:', error);
			return fail(500, { error: 'Failed to update service pattern' });
		}

		return { success: true };
	},

	addException: async ({ request, cookies, locals: { supabase } }) => {
		const session = await getAdminSession(cookies);
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();

		// C10 FIX: Validate CSRF token
		if (!await validateCSRFFromFormData(formData, session.sessionId)) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		// Get staff ID from email
		const { data: staff } = await supabase
			.from('staff_accounts')
			.select('id')
			.eq('email', session.email)
			.single();

		const date = formData.get('date') as string;
		const type = formData.get('type') as string;
		const name = formData.get('name') as string;
		const isServiceDay = formData.get('is_service_day') === 'true';
		const recurring = formData.get('recurring') as string;
		const recurrenceRule = formData.get('recurrence_rule') as string;

		if (!date || !type || !name) {
			return fail(400, { error: 'Missing required fields' });
		}

		// C2 FIX: Validate date format
		if (!isValidDateFormat(date)) {
			return fail(400, { error: 'Invalid date format. Please use YYYY-MM-DD format.' });
		}

		// C3 FIX: Validate recurrence_rule if provided
		let parsedRecurrenceRule: RecurrenceRule | null = null;
		if (recurrenceRule) {
			try {
				parsedRecurrenceRule = JSON.parse(recurrenceRule);
			} catch {
				return fail(400, { error: 'Invalid recurrence_rule format. Please provide valid JSON.' });
			}
			if (!isValidRecurrenceRule(parsedRecurrenceRule)) {
				return fail(400, {
					error: 'Invalid recurrence_rule structure. Expected: { type: "floating", month: 1-12, week: 1-5, dayOfWeek: 0-6 }'
				});
			}
		}

		const { error } = await supabase.from('service_exceptions').insert({
			date,
			type,
			name,
			is_service_day: isServiceDay,
			recurring: recurring || 'one-time',
			recurrence_rule: parsedRecurrenceRule,
			created_by: staff?.id || null
		});

		if (error) {
			console.error('Error adding exception:', error);
			return fail(500, { error: 'Failed to add exception' });
		}

		return { success: true };
	},

	updateException: async ({ request, cookies, locals: { supabase } }) => {
		const session = await getAdminSession(cookies);
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();

		// C10 FIX: Validate CSRF token
		if (!await validateCSRFFromFormData(formData, session.sessionId)) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const id = formData.get('id') as string;
		const date = formData.get('date') as string;
		const type = formData.get('type') as string;
		const name = formData.get('name') as string;
		const isServiceDay = formData.get('is_service_day') === 'true';
		const recurring = formData.get('recurring') as string;
		const recurrenceRule = formData.get('recurrence_rule') as string;

		if (!id || !date || !type || !name) {
			return fail(400, { error: 'Missing required fields' });
		}

		// C2 FIX: Validate date format
		if (!isValidDateFormat(date)) {
			return fail(400, { error: 'Invalid date format. Please use YYYY-MM-DD format.' });
		}

		// C3 FIX: Validate recurrence_rule if provided
		let parsedRecurrenceRule: RecurrenceRule | null = null;
		if (recurrenceRule) {
			try {
				parsedRecurrenceRule = JSON.parse(recurrenceRule);
			} catch {
				return fail(400, { error: 'Invalid recurrence_rule format. Please provide valid JSON.' });
			}
			if (!isValidRecurrenceRule(parsedRecurrenceRule)) {
				return fail(400, {
					error: 'Invalid recurrence_rule structure. Expected: { type: "floating", month: 1-12, week: 1-5, dayOfWeek: 0-6 }'
				});
			}
		}

		const { error } = await supabase
			.from('service_exceptions')
			.update({
				date,
				type,
				name,
				is_service_day: isServiceDay,
				recurring: recurring || 'one-time',
				recurrence_rule: parsedRecurrenceRule,
				updated_at: new Date().toISOString()
			})
			.eq('id', id);

		if (error) {
			console.error('Error updating exception:', error);
			return fail(500, { error: 'Failed to update exception' });
		}

		return { success: true };
	},

	deleteException: async ({ request, cookies, locals: { supabase } }) => {
		const session = await getAdminSession(cookies);
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();

		// C10 FIX: Validate CSRF token
		if (!await validateCSRFFromFormData(formData, session.sessionId)) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { error: 'Missing exception ID' });
		}

		const { error } = await supabase.from('service_exceptions').delete().eq('id', id);

		if (error) {
			console.error('Error deleting exception:', error);
			return fail(500, { error: 'Failed to delete exception' });
		}

		return { success: true };
	},

	sendNotification: async ({ request, cookies, locals: { supabase } }) => {
		const session = await getAdminSession(cookies);
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();

		// C10 FIX: Validate CSRF token
		if (!await validateCSRFFromFormData(formData, session.sessionId)) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const changeType = formData.get('change_type') as 'service_pattern' | 'holiday' | 'special_event';
		const changeAction = formData.get('change_action') as 'added' | 'updated' | 'deleted';
		const message = formData.get('message') as string;
		const affectedDatesStr = formData.get('affected_dates') as string;
		const effectiveDate = formData.get('effective_date') as string | null;

		if (!changeType || !changeAction || !message) {
			return fail(400, { error: 'Missing required notification fields' });
		}

		// C1 FIX: Wrap JSON.parse in try-catch
		let affectedDates: string[] = [];
		if (affectedDatesStr) {
			try {
				affectedDates = JSON.parse(affectedDatesStr);
			} catch {
				return fail(400, { error: 'Invalid affected_dates format. Please provide valid JSON.' });
			}
			if (!Array.isArray(affectedDates)) {
				return fail(400, { error: 'affected_dates must be an array' });
			}
		}

		try {
			const result = await sendScheduleChangeNotification({
				supabase,
				changeType,
				changeAction,
				message,
				affectedDates,
				effectiveDate: effectiveDate || undefined
			});

			if (!result.success) {
				console.error('Notification send failed:', result.errors);
				return fail(500, {
					error: 'Some notifications failed to send',
					sent: result.sent,
					failed: result.failed
				});
			}

			return {
				success: true,
				sent: result.sent,
				failed: result.failed
			};
		} catch (error) {
			console.error('Error sending notifications:', error);
			return fail(500, { error: 'Failed to send notifications' });
		}
	}
};
