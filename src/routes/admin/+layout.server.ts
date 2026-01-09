import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getAdminSession } from '$lib/auth/session';
import { generateCSRFToken } from '$lib/auth/csrf';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
  const session = await getAdminSession(cookies);

  // Allow access to auth pages without session
  if (url.pathname.startsWith('/admin/auth')) {
    return { session, csrfToken: null };
  }

  // Require session for all other admin pages
  if (!session) {
    throw redirect(302, '/admin/auth/login');
  }

  // Generate CSRF token bound to session
  const csrfToken = await generateCSRFToken(session.sessionId);

  return { session, csrfToken };
};
