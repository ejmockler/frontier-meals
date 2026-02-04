import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import type { SubscriptionPlan } from '$lib/types/discount';
import {
	validatePayPalPlanExists,
	getPayPalPlanDetails,
	parseBillingCycles,
	type PayPalEnv,
	type ParsedTrialInfo
} from '$lib/integrations/paypal';
import { getEnv } from '$lib/server/env';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchPlans() {
	const { data: plans, error } = await supabase
		.from('subscription_plans')
		.select('*')
		.order('sort_order', { ascending: true });

	if (error) {
		console.error('[Admin] Error fetching subscription plans:', error);
		return [];
	}

	return (plans || []) as SubscriptionPlan[];
}

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:subscription-plans');

	return { plans: fetchPlans() };
};

export const actions: Actions = {
	createPlan: async ({ request, cookies, platform }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const paypalPlanIdLive = formData.get('paypal_plan_id_live') as string;
		const paypalPlanIdSandbox = (formData.get('paypal_plan_id_sandbox') as string) || null;
		const businessName = formData.get('business_name') as string;
		const billingCycle = formData.get('billing_cycle') as string;
		const isDefault = formData.get('is_default') === 'true';

		// Validate required fields (price is auto-fetched from PayPal)
		if (!paypalPlanIdLive || !businessName || !billingCycle) {
			return fail(400, {
				error: 'PayPal Plan ID, business name, and billing cycle are required'
			});
		}

		// Validate PayPal Plan ID format (live)
		if (!/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdLive)) {
			return fail(400, { error: 'Invalid Live PayPal Plan ID format' });
		}

		// Validate PayPal Plan ID format (sandbox, if provided)
		if (paypalPlanIdSandbox && !/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdSandbox)) {
			return fail(400, { error: 'Invalid Sandbox PayPal Plan ID format' });
		}

		// Validate billing cycle
		if (!['monthly', 'annual'].includes(billingCycle)) {
			return fail(400, { error: 'Invalid billing cycle' });
		}

		// Get environment variables for PayPal API access
		const env = await getEnv({ platform, cookies, request } as any);

		// Fetch full plan details from PayPal (live) to extract pricing and trial info
		const paypalEnvLive: PayPalEnv = {
			PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID_LIVE || '',
			PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET_LIVE || '',
			PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID_LIVE || '',
			PAYPAL_PLAN_ID: '',
			PAYPAL_MODE: 'live'
		};

		const liveDetails = await getPayPalPlanDetails(paypalEnvLive, paypalPlanIdLive);
		if (!liveDetails.success || !liveDetails.plan) {
			return fail(400, {
				error: `Failed to fetch Live plan from PayPal: ${liveDetails.error}`
			});
		}

		// Parse billing cycles to extract pricing and trial info
		let parsedInfo: ParsedTrialInfo;
		try {
			parsedInfo = parseBillingCycles(liveDetails.plan.billing_cycles);
		} catch (err) {
			console.error('[Admin] Error parsing billing cycles:', err);
			return fail(400, {
				error:
					'Invalid PayPal plan structure: missing REGULAR billing cycle. Ensure the plan has a regular billing cycle configured.'
			});
		}

		// If sandbox plan ID provided, validate it exists
		if (paypalPlanIdSandbox) {
			const paypalEnvSandbox: PayPalEnv = {
				PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID_SANDBOX || '',
				PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET_SANDBOX || '',
				PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID_SANDBOX || '',
				PAYPAL_PLAN_ID: '',
				PAYPAL_MODE: 'sandbox'
			};

			const sandboxValidation = await validatePayPalPlanExists(
				paypalEnvSandbox,
				paypalPlanIdSandbox
			);
			if (!sandboxValidation.exists) {
				return fail(400, {
					error: `Sandbox Plan ID not found in PayPal: ${sandboxValidation.error}`
				});
			}
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

			// Insert new plan with auto-fetched pricing and trial info
			const { error: insertError } = await supabase.from('subscription_plans').insert({
				paypal_plan_id_live: paypalPlanIdLive,
				paypal_plan_id_sandbox: paypalPlanIdSandbox,
				business_name: businessName,
				price_amount: parsedInfo.regularPrice,
				price_currency: 'USD',
				billing_cycle: billingCycle,
				trial_price_amount: parsedInfo.trialPriceAmount,
				trial_duration_months: parsedInfo.trialDurationMonths,
				is_default: isDefault,
				is_active: true,
				sort_order: 0
			});

			if (insertError) {
				console.error('[Admin] Error creating plan:', insertError);
				return fail(500, { error: 'Failed to create plan' });
			}

			// Build descriptive success message
			const trialMsg =
				parsedInfo.trialPriceAmount !== null && parsedInfo.trialDurationMonths !== null
					? `$${parsedInfo.trialPriceAmount}/mo for ${parsedInfo.trialDurationMonths} months, then `
					: '';
			const message = `Plan created: ${trialMsg}$${parsedInfo.regularPrice}/mo`;

			return { success: true, message };
		} catch (error) {
			console.error('[Admin] Error creating plan:', error);
			return fail(500, { error: 'Failed to create plan' });
		}
	},

	updatePlan: async ({ request, cookies, platform }) => {
		const formData = await request.formData();

		// Validate CSRF
		const session = await getAdminSession(cookies);
		if (!session || !(await validateCSRFFromFormData(formData, session.sessionId))) {
			return fail(403, { error: 'Invalid CSRF token' });
		}

		const planId = formData.get('plan_id') as string;
		const paypalPlanIdSandbox = (formData.get('paypal_plan_id_sandbox') as string) || null;
		const businessName = formData.get('business_name') as string;
		const billingCycle = formData.get('billing_cycle') as string;
		const isDefault = formData.get('is_default') === 'true';

		// Validate required fields (price and trial are immutable — tied to PayPal plan)
		if (!planId || !businessName || !billingCycle) {
			return fail(400, { error: 'Plan ID, business name, and billing cycle are required' });
		}

		// Validate PayPal Plan ID format (sandbox, if provided)
		if (paypalPlanIdSandbox && !/^P-[A-Z0-9]{20,}$/.test(paypalPlanIdSandbox)) {
			return fail(400, { error: 'Invalid Sandbox PayPal Plan ID format' });
		}

		// Validate billing cycle
		if (!['monthly', 'annual'].includes(billingCycle)) {
			return fail(400, { error: 'Invalid billing cycle' });
		}

		// Get environment variables for PayPal API access
		const env = await getEnv({ platform, cookies, request } as any);

		// If sandbox plan ID provided, validate it exists in PayPal
		if (paypalPlanIdSandbox) {
			const paypalEnvSandbox: PayPalEnv = {
				PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID_SANDBOX || '',
				PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET_SANDBOX || '',
				PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID_SANDBOX || '',
				PAYPAL_PLAN_ID: '',
				PAYPAL_MODE: 'sandbox'
			};

			const sandboxValidation = await validatePayPalPlanExists(
				paypalEnvSandbox,
				paypalPlanIdSandbox
			);
			if (!sandboxValidation.exists) {
				return fail(400, {
					error: `Sandbox Plan ID not found in PayPal: ${sandboxValidation.error}`
				});
			}
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

			// Update plan (live plan ID, price, and trial fields are immutable after creation)
			const { error: updateError } = await supabase
				.from('subscription_plans')
				.update({
					paypal_plan_id_sandbox: paypalPlanIdSandbox,
					business_name: businessName,
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

	syncPlan: async ({ request, cookies, platform }) => {
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
			// Fetch the plan from database
			const { data: plan, error: fetchError } = await supabase
				.from('subscription_plans')
				.select('*')
				.eq('id', planId)
				.single();

			if (fetchError || !plan) {
				return fail(404, { error: 'Plan not found' });
			}

			if (!plan.paypal_plan_id_live) {
				return fail(400, { error: 'Plan has no Live PayPal Plan ID' });
			}

			// Get environment variables for PayPal API access
			const env = await getEnv({ platform, cookies, request } as any);

			const paypalEnv: PayPalEnv = {
				PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID_LIVE || '',
				PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET_LIVE || '',
				PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID_LIVE || '',
				PAYPAL_PLAN_ID: '',
				PAYPAL_MODE: 'live'
			};

			const details = await getPayPalPlanDetails(paypalEnv, plan.paypal_plan_id_live);
			if (!details.success || !details.plan) {
				return fail(400, {
					error: `Failed to fetch plan from PayPal: ${details.error}`
				});
			}

			// Parse billing cycles to extract pricing and trial info
			let parsedInfo: ParsedTrialInfo;
			try {
				parsedInfo = parseBillingCycles(details.plan.billing_cycles);
			} catch (err) {
				console.error('[Admin] Error parsing billing cycles:', err);
				return fail(400, {
					error: 'Invalid PayPal plan structure: missing REGULAR billing cycle.'
				});
			}

			// Update the plan with synced pricing and trial info
			const { error: updateError } = await supabase
				.from('subscription_plans')
				.update({
					price_amount: parsedInfo.regularPrice,
					trial_price_amount: parsedInfo.trialPriceAmount,
					trial_duration_months: parsedInfo.trialDurationMonths,
					updated_at: new Date().toISOString()
				})
				.eq('id', planId);

			if (updateError) {
				console.error('[Admin] Error syncing plan:', updateError);
				return fail(500, { error: 'Failed to update plan' });
			}

			const trialMsg =
				parsedInfo.trialPriceAmount != null && parsedInfo.trialDurationMonths != null
					? ` | Trial: $${parsedInfo.trialPriceAmount}/mo for ${parsedInfo.trialDurationMonths} months`
					: ' | No trial period';

			return {
				success: true,
				message: `Synced from PayPal: $${parsedInfo.regularPrice}/mo${trialMsg}`
			};
		} catch (error) {
			console.error('[Admin] Error syncing plan:', error);
			return fail(500, { error: 'Failed to sync plan from PayPal' });
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
