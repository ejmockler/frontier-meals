import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyMagicLinkToken, createAdminSession, insertAdminSessionRecord } from '$lib/auth/admin';
import { SESSION_SECRET } from '$env/static/private';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';
import * as jose from 'jose';

// C6 FIX: Rate limit verification attempts to prevent brute force attacks
const VERIFY_RATE_LIMIT_MAX = 10; // 10 attempts
const VERIFY_RATE_LIMIT_WINDOW = 60; // per hour

/**
 * Admin Magic Link Verification Page
 *
 * Validates the magic link token and creates an encrypted session cookie.
 * C2: Also creates database-backed session record for revocation capability.
 */
export const load: PageServerLoad = async ({ url, cookies, getClientAddress, request, locals: { supabase } }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    throw redirect(302, '/admin/auth/login?error=missing_token');
  }

  // C6 FIX: Rate limit verification attempts
  const clientIp = getClientAddress();
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.magicLinkVerify(clientIp),
    maxRequests: VERIFY_RATE_LIMIT_MAX,
    windowMinutes: VERIFY_RATE_LIMIT_WINDOW
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Admin Auth] Rate limit exceeded for IP:', clientIp);
    throw redirect(302, '/admin/auth/login?error=rate_limited');
  }

  try {
    // C3 FIX: Removed token logging to prevent credentials in logs
    console.log('[Admin Auth] Verifying magic link token...');

    // Verify token
    const result = await verifyMagicLinkToken(token);
    // Only log non-sensitive verification status
    console.log('[Admin Auth] Verification status:', result.valid ? 'valid' : 'invalid');

    if (!result.valid) {
      console.error('[Admin Auth] Invalid token - result:', result);
      // Check if it's an expired token by trying to find it
      const errorCode = result.expired ? 'expired_token' : 'invalid_token';
      throw redirect(302, `/admin/auth/login?error=${errorCode}`);
    }

    if (!result.email) {
      throw redirect(302, '/admin/auth/login?error=invalid_token');
    }

    // W13 FIX: Don't log email in production
    console.log('[Admin Auth] Creating session...');

    // Create session
    const session = createAdminSession(result.email);
    // W13 FIX: Only log non-sensitive confirmation
    console.log('[Admin Auth] Session created successfully');

    // Encrypt session as JWT
    // W1 FIX: Add issuer for cross-system token prevention
    // C2: Include JTI in JWT for database-backed revocation
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const sessionToken = await new jose.SignJWT({ ...session })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('frontier-meals-admin')
      .setJti(session.jti)  // C2: Include JTI in JWT claims
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // C2: Insert session record into database for tracking and revocation
    const userAgent = request.headers.get('user-agent') || undefined;
    await insertAdminSessionRecord(session, {
      ipAddress: clientIp,
      userAgent
    });

    // Set cookie
    // W3 FIX: Use 'strict' sameSite for better CSRF protection
    cookies.set('admin_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    console.log('[Admin Auth] Session established, redirecting to /admin');

    // Redirect to admin dashboard
    throw redirect(302, '/admin');
  } catch (error: unknown) {
    // SvelteKit redirects: check for redirect-like objects
    // In Cloudflare Workers, SvelteKit's redirect() doesn't return a Response instance
    // Instead it returns an object with status and location properties
    if (
      error instanceof Response ||
      (error && typeof error === 'object' && 'status' in error && 'location' in error)
    ) {
      throw error;
    }

    // W13/W15 FIX: Don't expose stack traces in logs - only log error type and message
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Admin Auth] Verification error:', {
      type: err.name,
      message: err.message
    });
    throw redirect(302, '/admin/auth/login?error=verification_failed');
  }
};
