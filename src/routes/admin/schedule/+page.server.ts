import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	if (!session) {
		throw redirect(303, '/admin/login');
	}

	// Verify admin access
	const { data: staff } = await supabase
		.from('staff_accounts')
		.select('*')
		.eq('id', session.user.id)
		.single();

	if (!staff) {
		throw redirect(303, '/admin/login');
	}

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
		specialEvents
	};
};

export const actions: Actions = {
	updateServicePattern: async ({ request, locals: { supabase, session } }) => {
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

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
				updated_by: session.user.id
			})
			.eq('id', (await supabase.from('service_schedule_config').select('id').single()).data?.id);

		if (error) {
			console.error('Error updating service pattern:', error);
			return fail(500, { error: 'Failed to update service pattern' });
		}

		return { success: true };
	},

	addException: async ({ request, locals: { supabase, session } }) => {
		if (!session) {
			return fail(401, { error: 'Unauthorized' });
		}

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
			created_by: session.user.id
		});

		if (error) {
			console.error('Error adding exception:', error);
			return fail(500, { error: 'Failed to add exception' });
		}

		return { success: true };
	},

	updateException: async ({ request, locals: { supabase, session } }) => {
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

	deleteException: async ({ request, locals: { supabase, session } }) => {
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
	}
};
