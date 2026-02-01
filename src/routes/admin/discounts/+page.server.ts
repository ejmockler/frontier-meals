import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad } from './$types';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ depends, url }) => {
	depends('app:discounts');

	// Check for success message from redirect
	const createdCode = url.searchParams.get('created');
	const updatedCode = url.searchParams.get('updated');
	const deletedCode = url.searchParams.get('deleted');

	// Load all discount codes with their plans
	const { data: discounts, error } = await supabase
		.from('discount_codes')
		.select(`
			*,
			plan:subscription_plans(id, business_name, price_amount, billing_cycle)
		`)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[Admin] Error fetching discounts:', error);
		return { discounts: [], defaultPlanPrice: 29 };
	}

	// Load default plan price for delta calculation
	const { data: defaultPlan } = await supabase
		.from('subscription_plans')
		.select('price_amount')
		.eq('is_default', true)
		.eq('is_active', true)
		.single();

	return {
		discounts: discounts || [],
		defaultPlanPrice: defaultPlan?.price_amount || 29,
		successMessage: createdCode
			? `Discount code "${createdCode}" created successfully`
			: updatedCode
				? `Discount code "${updatedCode}" updated successfully`
				: deletedCode
					? `Discount code "${deletedCode}" deleted successfully`
					: null
	};
};
