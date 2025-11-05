import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import * as jose from 'jose';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { KIOSK_PRIVATE_KEY } from '$env/static/private';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  createSession: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Demo mode: return mock kiosk session token
    if (IS_DEMO_MODE) {
      const kioskId = formData.get('kioskId') as string;
      const location = formData.get('location') as string;
      logDemoAction('Create kiosk session (demo)', { kioskId, location });
      return { sessionToken: `demo-kiosk-session-${Date.now()}` };
    }

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const kioskId = formData.get('kioskId') as string;
    const location = formData.get('location') as string;

    if (!kioskId || !location) {
      return fail(400, { error: 'Kiosk ID and location are required' });
    }

    try {
      // Generate kiosk session JWT
      const privateKey = await jose.importPKCS8(KIOSK_PRIVATE_KEY, 'ES256');

      const sessionToken = await new jose.SignJWT({
        kiosk_id: kioskId,
        location,
        created_at: new Date().toISOString()
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer('frontier-meals-admin')
        .setSubject('kiosk')
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime('8h') // 8 hour session
        .sign(privateKey);

      return { sessionToken };
    } catch (error) {
      console.error('[Admin] Error creating kiosk session:', error);
      return fail(500, { error: 'Failed to create kiosk session' });
    }
  }
};
