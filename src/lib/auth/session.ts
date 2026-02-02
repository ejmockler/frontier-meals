import * as jose from 'jose';
import { SESSION_SECRET } from '$env/static/private';
import { validateAdminSession, validateAdminSessionInDb, type AdminSession } from './admin';
import type { Cookies } from '@sveltejs/kit';

/**
 * Get and validate the admin session from cookies
 * C2: Now includes database-backed session validation for revocation support
 */
export async function getAdminSession(cookies: Cookies): Promise<AdminSession | null> {
  const sessionToken = cookies.get('admin_session');

  if (!sessionToken) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(SESSION_SECRET);
    // C1 FIX: Explicitly specify allowed algorithms to prevent algorithm confusion attacks
    // W1 FIX: Add issuer validation to prevent cross-system token acceptance
    const { payload } = await jose.jwtVerify(sessionToken, secret, {
      algorithms: ['HS256'],
      issuer: 'frontier-meals-admin'
    });

    // First validate the JWT payload structure
    if (!validateAdminSession(payload)) {
      return null;
    }

    // C2 FIX: Check database for session revocation
    // Only check if the session has a JTI (new sessions will, old ones may not)
    if (payload.jti) {
      const dbValidation = await validateAdminSessionInDb(payload.jti);
      if (!dbValidation.valid) {
        console.log('[Session] Session revoked or invalid in database:', dbValidation.error);
        return null;
      }
    }

    return payload as AdminSession;
  } catch (error) {
    console.error('[Session] Invalid session token:', error);
    return null;
  }
}

/**
 * Clear the admin session
 * W2 FIX: Include security flags on cookie deletion
 */
export function clearAdminSession(cookies: Cookies) {
  cookies.delete('admin_session', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
}
