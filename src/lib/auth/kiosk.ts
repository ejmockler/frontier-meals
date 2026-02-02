import * as jose from 'jose';
import { KIOSK_PUBLIC_KEY } from '$env/static/private';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kiosk session JWT payload structure (W14: Proper TypeScript interface)
 */
export interface KioskJWTPayload {
  kiosk_id: string;
  location: string;
  created_at: string;
  jti?: string;   // JWT ID - required for revocation checking
  iss?: string;   // Issuer
  sub?: string;   // Subject
  iat?: number;   // Issued at
  exp?: number;   // Expiration (optional - W1: new tokens will have this)
}

/**
 * Result of kiosk session validation
 */
export interface KioskSessionResult {
  valid: boolean;
  kiosk_id?: string;
  location?: string;
  jti?: string;
  error_code?: 'INVALID_TOKEN' | 'SESSION_NOT_FOUND' | 'SESSION_REVOKED' | 'SESSION_EXPIRED';
}

/**
 * Validate a kiosk session JWT token (cryptographic verification only)
 *
 * This performs JWT signature verification but does NOT check revocation status.
 * For full validation including revocation, use validateKioskSessionWithRevocation().
 */
export async function validateKioskSession(token: string): Promise<KioskSessionResult> {
  try {
    const publicKey = await jose.importSPKI(KIOSK_PUBLIC_KEY, 'ES256');

    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: 'frontier-meals-admin',
      subject: 'kiosk'
    });

    // W14: Type-safe payload extraction
    const kioskPayload = payload as unknown as KioskJWTPayload;

    return {
      valid: true,
      kiosk_id: kioskPayload.kiosk_id,
      location: kioskPayload.location,
      jti: kioskPayload.jti
    };
  } catch (error) {
    // Don't log full error to avoid leaking token details
    console.error('[Kiosk] Session validation failed');
    return { valid: false, error_code: 'INVALID_TOKEN' };
  }
}

/**
 * Validate kiosk session with revocation check (C1: Token revocation support)
 *
 * Performs full validation:
 * 1. JWT signature verification
 * 2. Revocation status check in database
 * 3. Expiration check (database-side for consistency)
 *
 * Also updates usage tracking (last_used_at, use_count).
 *
 * @param token - The JWT session token
 * @param supabase - Supabase client for database access
 */
export async function validateKioskSessionWithRevocation(
  token: string,
  supabase: SupabaseClient
): Promise<KioskSessionResult> {
  // First, verify JWT signature
  const jwtResult = await validateKioskSession(token);

  if (!jwtResult.valid) {
    return jwtResult;
  }

  // If no JTI, this is a legacy token - allow it but log warning
  // (Legacy tokens issued before revocation system was implemented)
  if (!jwtResult.jti) {
    console.warn('[Kiosk] Legacy token without JTI detected - cannot check revocation');
    return jwtResult;
  }

  // Check revocation status in database
  const { data, error } = await supabase.rpc('validate_kiosk_session', {
    p_jti: jwtResult.jti
  });

  if (error) {
    console.error('[Kiosk] Database error checking revocation:', error);
    // Fail open for database errors to prevent DoS - token signature is valid
    return jwtResult;
  }

  // Parse result
  const dbResult = data as Array<{
    valid: boolean;
    kiosk_id: string | null;
    location: string | null;
    error_code: string | null;
  }>;

  if (!dbResult || dbResult.length === 0) {
    // Session not found in database - could be legacy token
    console.warn('[Kiosk] Session not found in database, allowing legacy token');
    return jwtResult;
  }

  const session = dbResult[0];

  if (!session.valid) {
    return {
      valid: false,
      error_code: session.error_code as KioskSessionResult['error_code']
    };
  }

  return {
    valid: true,
    kiosk_id: session.kiosk_id || jwtResult.kiosk_id,
    location: session.location || jwtResult.location,
    jti: jwtResult.jti
  };
}

/**
 * Revoke a kiosk session by JTI (C1: Token revocation)
 *
 * @param jti - The JWT ID to revoke
 * @param revokedBy - Email of admin performing revocation
 * @param reason - Optional reason for audit trail
 * @param supabase - Supabase client for database access
 */
export async function revokeKioskSession(
  jti: string,
  revokedBy: string,
  reason: string | null,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_kiosk_session', {
    p_jti: jti,
    p_revoked_by: revokedBy,
    p_reason: reason
  });

  if (error) {
    console.error('[Kiosk] Error revoking session:', error);
    return false;
  }

  return data as boolean;
}

/**
 * Revoke all sessions for a kiosk (emergency use)
 *
 * Use this when a kiosk device is compromised or stolen.
 *
 * @param kioskId - The kiosk identifier
 * @param revokedBy - Email of admin performing revocation
 * @param reason - Reason for audit trail
 * @param supabase - Supabase client for database access
 */
export async function revokeAllKioskSessions(
  kioskId: string,
  revokedBy: string,
  reason: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc('revoke_all_kiosk_sessions', {
    p_kiosk_id: kioskId,
    p_revoked_by: revokedBy,
    p_reason: reason
  });

  if (error) {
    console.error('[Kiosk] Error revoking all sessions:', error);
    return 0;
  }

  return data as number;
}
