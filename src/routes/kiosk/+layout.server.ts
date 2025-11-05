import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { validateKioskSession } from '$lib/auth/kiosk';
import { IS_DEMO_MODE, getMockKioskSession } from '$lib/demo';

export const load: LayoutServerLoad = async ({ url }) => {
  const sessionToken = url.searchParams.get('session');

  // Demo mode: accept any session or use default
  if (IS_DEMO_MODE) {
    const demoToken = sessionToken || 'demo-kiosk-session';
    const demoSession = getMockKioskSession(demoToken);
    return {
      kiosk: {
        id: demoSession.kiosk_id,
        location: demoSession.location,
        sessionToken: demoToken
      }
    };
  }

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
