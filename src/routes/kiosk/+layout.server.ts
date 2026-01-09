import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { validateKioskSession } from '$lib/auth/kiosk';

export const load: LayoutServerLoad = async ({ url }) => {
  const sessionToken = url.searchParams.get('session');

  if (!sessionToken) {
    throw redirect(302, '/kiosk/unauthorized');
  }

  const session = await validateKioskSession(sessionToken);

  if (!session.valid) {
    throw redirect(302, '/kiosk/unauthorized');
  }

  return {
    kiosk: {
      id: session.kiosk_id,
      location: session.location,
      sessionToken
    }
  };
};
