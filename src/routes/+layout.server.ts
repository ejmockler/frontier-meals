import type { LayoutServerLoad } from './$types';
import { IS_DEMO_MODE } from '$lib/demo';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	return {
		session,
		user,
		isDemoMode: IS_DEMO_MODE
	};
};
