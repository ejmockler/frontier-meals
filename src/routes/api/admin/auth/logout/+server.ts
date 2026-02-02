import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAdminSession, getAdminSession } from '$lib/auth/session';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { revokeAdminSession } from '$lib/auth/admin';

export const POST: RequestHandler = async ({ request, cookies }) => {
  // Validate CSRF
  const session = await getAdminSession(cookies);
  if (session) {
    const formData = await request.formData();
    if (!await validateCSRFFromFormData(formData, session.sessionId)) {
      return json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    // C2: Revoke session in database to prevent reuse if cookie is stolen
    if (session.jti) {
      await revokeAdminSession(session.jti, session.email, 'User logout');
    }
  }

  clearAdminSession(cookies);
  throw redirect(302, '/admin/auth/login');
};
