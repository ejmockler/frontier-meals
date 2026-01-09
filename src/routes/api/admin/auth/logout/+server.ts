import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAdminSession, getAdminSession } from '$lib/auth/session';
import { validateCSRFFromFormData } from '$lib/auth/csrf';

export const POST: RequestHandler = async ({ request, cookies }) => {
  // Validate CSRF
  const session = await getAdminSession(cookies);
  if (session) {
    const formData = await request.formData();
    if (!await validateCSRFFromFormData(formData, session.sessionId)) {
      return json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
  }

  clearAdminSession(cookies);
  throw redirect(302, '/admin/auth/login');
};
