import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad } from './$types';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async () => {
	// Load default plan for pricing display
	const { data: defaultPlan, error } = await supabase
		.from('subscription_plans')
		.select('price_amount, billing_cycle')
		.eq('is_default', true)
		.eq('is_active', true)
		.single();

	if (error) {
		console.error('[Landing] Error loading default plan:', error);
	}

	return {
		defaultPlanPrice: defaultPlan?.price_amount ?? 500,
		billingCycle: defaultPlan?.billing_cycle ?? 'month'
	};
};
