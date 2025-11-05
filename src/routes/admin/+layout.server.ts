import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getAdminSession } from '$lib/auth/session';
import { generateCSRFToken } from '$lib/auth/csrf';
import { IS_DEMO_MODE, getMockAdminSession } from '$lib/demo';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
  // Demo mode: bypass all auth checks
  if (IS_DEMO_MODE) {
    const demoSession = getMockAdminSession();
    const csrfToken = url.pathname.startsWith('/admin/auth') ? null : 'demo-csrf-token';
    return { session: demoSession, csrfToken };
  }

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
  const csrfToken = generateCSRFToken(session.sessionId);

  return { session, csrfToken };
};
