import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	sendScheduleChangeNotification,
	getActiveCustomerCount
} from '$lib/email/schedule-notifications';
import { getAdminSession } from '$lib/auth/session';

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

	// Load all service exceptions
	const { data: exceptions } = await supabase
		.from('service_exceptions')
		.select('*')
		.order('date', { ascending: true });

	// Separate holidays and special events
	const holidays = exceptions?.filter((e) => e.type === 'holiday') || [];
	const specialEvents = exceptions?.filter((e) => e.type === 'special_event') || [];

	return {
		config: config || { service_days: [1, 2, 3, 4, 5] },
		holidays,
		specialEvents,
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

		// Get staff ID from email
		const { data: staff } = await supabase
			.from('staff_accounts')
			.select('id')
			.eq('email', session.email)
			.single();

		const formData = await request.formData();
		const serviceDaysStr = formData.get('service_days') as string;

		if (!serviceDaysStr) {
			return fail(400, { error: 'Missing service_days' });
		}

		const serviceDays = JSON.parse(serviceDaysStr);

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

		// Get staff ID from email
		const { data: staff } = await supabase
			.from('staff_accounts')
			.select('id')
			.eq('email', session.email)
			.single();

		const formData = await request.formData();
		const date = formData.get('date') as string;
		const type = formData.get('type') as string;
		const name = formData.get('name') as string;
		const isServiceDay = formData.get('is_service_day') === 'true';
		const recurring = formData.get('recurring') as string;
		const recurrenceRule = formData.get('recurrence_rule') as string;

		if (!date || !type || !name) {
			return fail(400, { error: 'Missing required fields' });
		}

		const { error } = await supabase.from('service_exceptions').insert({
			date,
			type,
			name,
			is_service_day: isServiceDay,
			recurring: recurring || 'one-time',
			recurrence_rule: recurrenceRule || null,
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

		const { error } = await supabase
			.from('service_exceptions')
			.update({
				date,
				type,
				name,
				is_service_day: isServiceDay,
				recurring: recurring || 'one-time',
				recurrence_rule: recurrenceRule || null,
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
		const changeType = formData.get('change_type') as 'service_pattern' | 'holiday' | 'special_event';
		const changeAction = formData.get('change_action') as 'added' | 'updated' | 'deleted';
		const message = formData.get('message') as string;
		const affectedDatesStr = formData.get('affected_dates') as string;
		const effectiveDate = formData.get('effective_date') as string | null;

		if (!changeType || !changeAction || !message) {
			return fail(400, { error: 'Missing required notification fields' });
		}

		const affectedDates = affectedDatesStr ? JSON.parse(affectedDatesStr) : [];

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
