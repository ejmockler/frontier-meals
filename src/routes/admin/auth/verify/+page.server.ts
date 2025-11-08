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
    // Verify token
    const result = await verifyMagicLinkToken(token);

    if (!result.valid || !result.email) {
      throw redirect(302, '/admin/auth/login?error=invalid_token');
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
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw redirects
    }
    console.error('[Admin Auth] Verification error:', error);
    throw redirect(302, '/admin/auth/login?error=verification_failed');
  }
};
