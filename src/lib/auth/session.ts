import * as jose from 'jose';
import { SESSION_SECRET } from '$env/static/private';
import { validateAdminSession, type AdminSession } from './admin';
import type { Cookies } from '@sveltejs/kit';

/**
 * Get and validate the admin session from cookies
 */
export async function getAdminSession(cookies: Cookies): Promise<AdminSession | null> {
  const sessionToken = cookies.get('admin_session');

  if (!sessionToken) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const { payload } = await jose.jwtVerify(sessionToken, secret);

    if (validateAdminSession(payload)) {
      return payload;
    }

    return null;
  } catch (error) {
    console.error('[Session] Invalid session token:', error);
    return null;
  }
}

/**
 * Clear the admin session
 */
export function clearAdminSession(cookies: Cookies) {
  cookies.delete('admin_session', { path: '/' });
}
