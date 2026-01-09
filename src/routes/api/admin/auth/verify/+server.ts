import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyMagicLinkToken, createAdminSession } from '$lib/auth/admin';
import { SESSION_SECRET } from '$env/static/private';
import * as jose from 'jose';

/**
 * Admin Magic Link Verification Endpoint
 *
 * Validates the magic link token and creates an encrypted session cookie.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    return json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    // Verify token
    const result = await verifyMagicLinkToken(token);

    if (!result.valid || !result.email) {
      return json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // Create session
    const session = createAdminSession(result.email);

    // Encrypt session as JWT
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const sessionToken = await new jose.SignJWT({ ...session })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Set cookie
    cookies.set('admin_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    // Redirect to admin dashboard
    throw redirect(302, '/admin');
  } catch (error: unknown) {
    // SvelteKit redirects: check for redirect-like objects
    if (
      error instanceof Response ||
      (error && typeof error === 'object' && 'status' in error && 'location' in error)
    ) {
      throw error;
    }

    // Log actual errors
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Admin Auth] Verification error:', error);
    console.error('[Admin Auth] Error details:', {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    return json({ error: 'Verification failed' }, { status: 500 });
  }
};
