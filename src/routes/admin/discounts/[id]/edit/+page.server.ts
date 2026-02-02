import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('app:subscription-plans');
	depends('app:discount-code');

	const { id } = params;

	// Load active subscription plans for dropdown
	const { data: plans, error: plansError } = await supabase
		.from('subscription_plans')
		.select('id, business_name, price_amount, billing_cycle, is_default, paypal_plan_id_live, paypal_plan_id_sandbox')
		.eq('is_active', true)
		.order('sort_order', { ascending: true });

	if (plansError) {
		console.error('[Admin] Error loading subscription plans:', plansError);
	}

	// Load the discount code
	const { data: discount, error: discountError } = await supabase
		.from('discount_codes')
		.select('*, plan:subscription_plans(*)')
		.eq('id', id)
		.single();

	if (discountError || !discount) {
		console.error('[Admin] Error loading discount code:', discountError);
		throw error(404, 'Discount code not found');
	}

	return {
		plans: plans || [],
		discount
	};
};

export const actions: Actions = {
	updateDiscount: async ({ request, params, cookies }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const { id } = params;

		// Extract form data (simplified - no discount_type/value/duration)
		const code = (formData.get('code') as string)?.toUpperCase().trim();
		const plan_id = formData.get('plan_id') as string;
		const max_uses = formData.get('max_uses') as string;
		const valid_until = formData.get('valid_until') as string;
		const max_uses_per_customer = formData.get('max_uses_per_customer') as string;
		const admin_notes = formData.get('admin_notes') as string;
		const is_active = formData.get('is_active') === 'true';

		// Validate required fields
		if (!code || !plan_id) {
			return fail(400, { error: 'Missing required fields' });
		}

		// Validate code format (alphanumeric only)
		if (!/^[A-Z0-9]+$/.test(code)) {
			return fail(400, { error: 'Code must be alphanumeric (A-Z, 0-9)' });
		}

		try {
			// Update discount code (simplified - discount is implicit from plan price delta)
			const { error } = await supabase
				.from('discount_codes')
				.update({
					code,
					plan_id,
					max_uses: max_uses ? parseInt(max_uses) : null,
					valid_until: valid_until || null,
					max_uses_per_customer: max_uses_per_customer
						? parseInt(max_uses_per_customer)
						: 1,
					admin_notes: admin_notes || null,
					is_active,
					deactivated_at: is_active ? null : new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', id);

			if (error) {
				console.error('[Admin] Error updating discount code:', error);
				if (error.code === '23505') {
					// Unique constraint violation
					return fail(400, { error: 'A discount code with this name already exists' });
				}
				return fail(500, { error: 'Failed to update discount code' });
			}

			// Redirect to discounts list page with success message
			throw redirect(303, `/admin/discounts?updated=${encodeURIComponent(code)}`);
		} catch (error) {
			if (error instanceof Response) throw error; // Re-throw redirect
			console.error('[Admin] Error updating discount code:', error);
			return fail(500, { error: 'Failed to update discount code' });
		}
	},

	deleteDiscount: async ({ request, params, cookies }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const { id } = params;

		try {
			// Check if discount has been used
			const { data: discount } = await supabase
				.from('discount_codes')
				.select('current_uses, code')
				.eq('id', id)
				.single();

			if (!discount) {
				return fail(404, { error: 'Discount code not found' });
			}

			if (discount.current_uses > 0) {
				return fail(400, {
					error: `Cannot delete discount code "${discount.code}" - it has ${discount.current_uses} redemption${discount.current_uses > 1 ? 's' : ''}. Deactivate it instead.`
				});
			}

			// Delete discount code
			const { error } = await supabase.from('discount_codes').delete().eq('id', id);

			if (error) {
				console.error('[Admin] Error deleting discount code:', error);
				return fail(500, { error: 'Failed to delete discount code' });
			}

			// Redirect to discounts list page with success message
			throw redirect(303, `/admin/discounts?deleted=${encodeURIComponent(discount.code)}`);
		} catch (error) {
			if (error instanceof Response) throw error; // Re-throw redirect
			console.error('[Admin] Error deleting discount code:', error);
			return fail(500, { error: 'Failed to delete discount code' });
		}
	}
};
