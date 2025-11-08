import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyMagicLinkToken, createAdminSession } from '$lib/auth/admin';
import { SESSION_SECRET } from '$env/static/private';
import * as jose from 'jose';

/**
 * Admin Magic Link Verification Page
 *
 * Validates the magic link token and creates an encrypted session cookie.
 */
export const load: PageServerLoad = async ({ url, cookies }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    throw redirect(302, '/admin/auth/login?error=missing_token');
  }

  try {
    console.log('[Admin Auth] Verifying token:', token);

    // Verify token
    const result = await verifyMagicLinkToken(token);
    console.log('[Admin Auth] Verification result:', result);

    if (!result.valid) {
      console.error('[Admin Auth] Invalid token - result:', result);
      // Check if it's an expired token by trying to find it
      const errorCode = result.expired ? 'expired_token' : 'invalid_token';
      throw redirect(302, `/admin/auth/login?error=${errorCode}`);
    }

    if (!result.email) {
      throw redirect(302, '/admin/auth/login?error=invalid_token');
    }

    console.log('[Admin Auth] Creating session for:', result.email);

    // Create session
    const session = createAdminSession(result.email);
    console.log('[Admin Auth] Session created:', { sessionId: session.sessionId, email: session.email });

    // Encrypt session as JWT
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const sessionToken = await new jose.SignJWT({ ...session })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    console.log('[Admin Auth] JWT created, setting cookie');

    // Set cookie
    cookies.set('admin_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    console.log('[Admin Auth] Cookie set, redirecting to /admin');

    // Redirect to admin dashboard
    throw redirect(302, '/admin');
  } catch (error) {
    // Re-throw redirects immediately without logging them as errors
    if (error instanceof Response) {
      throw error;
    }

    // Log actual errors
    console.error('[Admin Auth] Verification error:', error);
    console.error('[Admin Auth] Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    throw redirect(302, '/admin/auth/login?error=verification_failed');
  }
};
