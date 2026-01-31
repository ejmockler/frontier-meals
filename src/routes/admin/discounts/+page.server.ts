import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad } from './$types';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:discounts');

	const { data: discounts, error } = await supabase
		.from('discount_codes')
		.select(`
			*,
			plan:subscription_plans(id, business_name, price_amount, billing_cycle)
		`)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[Admin] Error fetching discounts:', error);
		return { discounts: [] };
	}

	return { discounts: discounts || [] };
};
