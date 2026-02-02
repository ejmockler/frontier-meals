import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import * as jose from 'jose';
import { randomUUID } from '$lib/utils/crypto';
import { KIOSK_PRIVATE_KEY_BASE64 } from '$env/static/private';
import { validateCSRFFromFormData, generateCSRFToken } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import { getSupabaseAdmin } from '$lib/server/env';

// W1: Token expiration - 90 days for kiosk sessions
const KIOSK_SESSION_EXPIRY_DAYS = 90;

// W10: Input validation patterns
const KIOSK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const LOCATION_PATTERN = /^[\w\s,.\-()]{1,200}$/u;

export const load: PageServerLoad = async ({ cookies }) => {
  const session = await getAdminSession(cookies);
  if (!session) {
    throw redirect(302, '/admin/auth/login');
  }

  const csrfToken = await generateCSRFToken(session.sessionId);

  return {
    csrfToken
  };
};

export const actions: Actions = {
  createSession: async (event) => {
    const { request, cookies } = event;
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const kioskId = (formData.get('kioskId') as string)?.trim();
    const location = (formData.get('location') as string)?.trim();

    if (!kioskId || !location) {
      return fail(400, { error: 'Kiosk ID and location are required' });
    }

    // W10: Input validation - prevent XSS and confusing log entries
    if (!KIOSK_ID_PATTERN.test(kioskId)) {
      return fail(400, {
        error: 'Invalid Kiosk ID. Use only letters, numbers, underscores, and hyphens (max 64 chars).'
      });
    }

    if (!LOCATION_PATTERN.test(location)) {
      return fail(400, {
        error: 'Invalid location. Use only letters, numbers, spaces, and basic punctuation (max 200 chars).'
      });
    }

    try {
      const supabase = await getSupabaseAdmin(event);

      // Decode base64-encoded private key (needed because env vars can't contain newlines)
      // Use Web APIs available in Cloudflare Workers
      const binaryString = atob(KIOSK_PRIVATE_KEY_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const kioskPrivateKey = new TextDecoder().decode(bytes);

      // Generate kiosk session JWT
      const privateKey = await jose.importPKCS8(kioskPrivateKey, 'ES256');

      // Generate unique JTI for this session (required for C1: revocation support)
      const jti = randomUUID();

      // W1: Calculate expiration (90 days from now)
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + KIOSK_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const sessionToken = await new jose.SignJWT({
        kiosk_id: kioskId,
        location,
        created_at: issuedAt.toISOString()
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer('frontier-meals-admin')
        .setSubject('kiosk')
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(expiresAt)  // W1: Add expiration
        .sign(privateKey);

      // C1 + W4: Store session in database for revocation and audit logging
      const { error: insertError } = await supabase
        .from('kiosk_sessions')
        .insert({
          jti,
          kiosk_id: kioskId,
          location,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          created_by: session.email
        });

      if (insertError) {
        console.error('[Admin] Error storing kiosk session:', insertError);
        // Continue even if storage fails - token is still valid cryptographically
        // But log for alerting
      }

      // W4: Audit log the session creation
      await supabase.from('audit_log').insert({
        actor: session.email,
        action: 'kiosk_session_created',
        subject: `kiosk:${kioskId}`,
        metadata: {
          jti: jti.substring(0, 8) + '...', // Truncated for logs
          location,
          expires_at: expiresAt.toISOString()
        }
      });

      console.log('[Admin] Kiosk session created:', {
        kiosk_id: kioskId,
        location,
        jti: jti.substring(0, 8) + '...',
        created_by: session.email,
        expires_at: expiresAt.toISOString()
      });

      return { sessionToken };
    } catch (error) {
      console.error('[Admin] Error creating kiosk session:', error);
      return fail(500, { error: 'Failed to create kiosk session' });
    }
  }
};
