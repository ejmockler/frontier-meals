import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyMagicLinkToken, createAdminSession, insertAdminSessionRecord } from '$lib/auth/admin';
import { SESSION_SECRET } from '$env/static/private';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';
import * as jose from 'jose';

// C6 FIX: Rate limit verification attempts to prevent brute force attacks
const VERIFY_RATE_LIMIT_MAX = 10; // 10 attempts
const VERIFY_RATE_LIMIT_WINDOW = 60; // per hour

/**
 * Admin Magic Link Verification Endpoint
 *
 * Validates the magic link token and creates an encrypted session cookie.
 * C2: Also creates database-backed session record for revocation capability.
 */
export const GET: RequestHandler = async ({ url, cookies, getClientAddress, request, locals: { supabase } }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    return json({ error: 'Missing token' }, { status: 400 });
  }

  // C6 FIX: Rate limit verification attempts
  const clientIp = getClientAddress();
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.magicLinkVerify(clientIp),
    maxRequests: VERIFY_RATE_LIMIT_MAX,
    windowMinutes: VERIFY_RATE_LIMIT_WINDOW
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Admin Auth] Rate limit exceeded for verification');
    return json(
      { error: 'Too many verification attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
        }
      }
    );
  }

  try {
    // C3 FIX: Don't log token
    console.log('[Admin Auth] Verifying magic link token...');

    // Verify token
    const result = await verifyMagicLinkToken(token);

    if (!result.valid || !result.email) {
      return json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // Create session
    const session = createAdminSession(result.email);

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

    // W13/W15 FIX: Don't expose stack traces in logs
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Admin Auth] Verification error:', {
      type: err.name,
      message: err.message
    });
    return json({ error: 'Verification failed' }, { status: 500 });
  }
};
