import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import type { SubscriptionPlan } from '$lib/types/discount';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:subscription-plans');

	// Fetch all subscription plans
	const { data: plans, error } = await supabase
		.from('subscription_plans')
		.select('*')
		.order('sort_order', { ascending: true });

	if (error) {
		console.error('[Admin] Error fetching subscription plans:', error);
		return { plans: [] };
	}

	return { plans: plans as SubscriptionPlan[] };
};

export const actions: Actions = {
	createPlan: async ({ request, cookies }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const paypalPlanIdLive = formData.get('paypal_plan_id_live') as string;
		const paypalPlanIdSandbox = (formData.get('paypal_plan_id_sandbox') as string) || null;
		const businessName = formData.get('business_name') as string;
		const priceAmount = formData.get('price_amount') as string;
		const billingCycle = formData.get('billing_cycle') as string;
		const isDefault = formData.get('is_default') === 'true';

		// Validate required fields (live plan ID is required, sandbox is optional)
		if (!paypalPlanIdLive || !businessName || !priceAmount || !billingCycle) {
			return fail(400, { error: 'All fields are required (sandbox plan ID is optional)' });
		}

		// Validate PayPal Plan ID format (live)
		if (!/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdLive)) {
			return fail(400, { error: 'Invalid Live PayPal Plan ID format' });
		}

		// Validate PayPal Plan ID format (sandbox, if provided)
		if (paypalPlanIdSandbox && !/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdSandbox)) {
			return fail(400, { error: 'Invalid Sandbox PayPal Plan ID format' });
		}

		// Validate price
		const price = parseFloat(priceAmount);
		if (isNaN(price) || price <= 0) {
			return fail(400, { error: 'Price must be a positive number' });
		}

		// Validate billing cycle
		if (!['monthly', 'annual'].includes(billingCycle)) {
			return fail(400, { error: 'Invalid billing cycle' });
		}

		try {
			// Check if Live PayPal Plan ID already exists
			const { data: existingLive } = await supabase
				.from('subscription_plans')
				.select('id')
				.eq('paypal_plan_id_live', paypalPlanIdLive)
				.maybeSingle();

			if (existingLive) {
				return fail(400, { error: 'This Live PayPal Plan ID already exists' });
			}

			// Check if Sandbox PayPal Plan ID already exists (if provided)
			if (paypalPlanIdSandbox) {
				const { data: existingSandbox } = await supabase
					.from('subscription_plans')
					.select('id')
					.eq('paypal_plan_id_sandbox', paypalPlanIdSandbox)
					.maybeSingle();

				if (existingSandbox) {
					return fail(400, { error: 'This Sandbox PayPal Plan ID already exists' });
				}
			}

			// If setting as default, unset current default
			if (isDefault) {
				await supabase
					.from('subscription_plans')
					.update({ is_default: false })
					.eq('is_default', true);
			}

			// Insert new plan
			const { error: insertError } = await supabase.from('subscription_plans').insert({
				paypal_plan_id_live: paypalPlanIdLive,
				paypal_plan_id_sandbox: paypalPlanIdSandbox,
				business_name: businessName,
				price_amount: price,
				price_currency: 'USD',
				billing_cycle: billingCycle,
				is_default: isDefault,
				is_active: true,
				sort_order: 0
			});

			if (insertError) {
				console.error('[Admin] Error creating plan:', insertError);
				return fail(500, { error: 'Failed to create plan' });
			}

			return { success: true, message: 'Plan created successfully' };
		} catch (error) {
			console.error('[Admin] Error creating plan:', error);
			return fail(500, { error: 'Failed to create plan' });
		}
	},

	updatePlan: async ({ request, cookies }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const planId = formData.get('plan_id') as string;
		const paypalPlanIdSandbox = (formData.get('paypal_plan_id_sandbox') as string) || null;
		const businessName = formData.get('business_name') as string;
		const priceAmount = formData.get('price_amount') as string;
		const billingCycle = formData.get('billing_cycle') as string;
		const isDefault = formData.get('is_default') === 'true';

		// Validate required fields
		if (!planId || !businessName || !priceAmount || !billingCycle) {
			return fail(400, { error: 'All fields are required' });
		}

		// Validate PayPal Plan ID format (sandbox, if provided)
		if (paypalPlanIdSandbox && !/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdSandbox)) {
			return fail(400, { error: 'Invalid Sandbox PayPal Plan ID format' });
		}

		// Validate price
		const price = parseFloat(priceAmount);
		if (isNaN(price) || price <= 0) {
			return fail(400, { error: 'Price must be a positive number' });
		}

		// Validate billing cycle
		if (!['monthly', 'annual'].includes(billingCycle)) {
			return fail(400, { error: 'Invalid billing cycle' });
		}

		try {
			// Check if Sandbox Plan ID already exists (if provided and not the same plan)
			if (paypalPlanIdSandbox) {
				const { data: existingSandbox } = await supabase
					.from('subscription_plans')
					.select('id')
					.eq('paypal_plan_id_sandbox', paypalPlanIdSandbox)
					.neq('id', planId)
					.maybeSingle();

				if (existingSandbox) {
					return fail(400, { error: 'This Sandbox PayPal Plan ID already exists' });
				}
			}

			// If setting as default, unset current default
			if (isDefault) {
				await supabase
					.from('subscription_plans')
					.update({ is_default: false })
					.eq('is_default', true)
					.neq('id', planId);
			}

			// Update plan (live plan ID is immutable after creation)
			const { error: updateError } = await supabase
				.from('subscription_plans')
				.update({
					paypal_plan_id_sandbox: paypalPlanIdSandbox,
					business_name: businessName,
					price_amount: price,
					billing_cycle: billingCycle,
					is_default: isDefault,
					updated_at: new Date().toISOString()
				})
				.eq('id', planId);

			if (updateError) {
				console.error('[Admin] Error updating plan:', updateError);
				return fail(500, { error: 'Failed to update plan' });
			}

			return { success: true, message: 'Plan updated successfully' };
		} catch (error) {
			console.error('[Admin] Error updating plan:', error);
			return fail(500, { error: 'Failed to update plan' });
		}
	},

	deletePlan: async ({ request, cookies }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const planId = formData.get('plan_id') as string;

		if (!planId) {
			return fail(400, { error: 'Plan ID is required' });
		}

		try {
			// Check if plan is used by any discount codes
			const { data: discountCodes, error: checkError } = await supabase
				.from('discount_codes')
				.select('id')
				.eq('plan_id', planId)
				.limit(1);

			if (checkError) {
				console.error('[Admin] Error checking plan usage:', checkError);
				return fail(500, { error: 'Failed to check plan usage' });
			}

			if (discountCodes && discountCodes.length > 0) {
				return fail(400, {
					error: 'Cannot delete plan that is used by discount codes. Deactivate it instead.'
				});
			}

			// Delete plan
			const { error: deleteError } = await supabase
				.from('subscription_plans')
				.delete()
				.eq('id', planId);

			if (deleteError) {
				console.error('[Admin] Error deleting plan:', deleteError);
				return fail(500, { error: 'Failed to delete plan' });
			}

			return { success: true, message: 'Plan deleted successfully' };
		} catch (error) {
			console.error('[Admin] Error deleting plan:', error);
			return fail(500, { error: 'Failed to delete plan' });
		}
	}
};
