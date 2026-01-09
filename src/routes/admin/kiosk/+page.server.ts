import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import * as jose from 'jose';
import { randomUUID } from '$lib/utils/crypto';
import { KIOSK_PRIVATE_KEY_BASE64 } from '$env/static/private';
import { validateCSRFFromFormData, generateCSRFToken } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';

export const load: PageServerLoad = async ({ cookies }) => {
  const session = await getAdminSession(cookies);
  if (!session) {
    throw redirect(302, '/admin/auth/login');
  }

  const csrfToken = await generateCSRFToken(session.sessionId);

  return {
    csrfToken
  };
};

export const actions: Actions = {
  createSession: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const kioskId = formData.get('kioskId') as string;
    const location = formData.get('location') as string;

    if (!kioskId || !location) {
      return fail(400, { error: 'Kiosk ID and location are required' });
    }

    try {
      // Decode base64-encoded private key (needed because env vars can't contain newlines)
      // Use Web APIs available in Cloudflare Workers
      const binaryString = atob(KIOSK_PRIVATE_KEY_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const kioskPrivateKey = new TextDecoder().decode(bytes);

      // Generate kiosk session JWT
      const privateKey = await jose.importPKCS8(kioskPrivateKey, 'ES256');

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
        // No expiry - kiosks run as long as needed since admin route is protected
        .sign(privateKey);

      return { sessionToken };
    } catch (error) {
      console.error('[Admin] Error creating kiosk session:', error);
      return fail(500, { error: 'Failed to create kiosk session' });
    }
  }
};
