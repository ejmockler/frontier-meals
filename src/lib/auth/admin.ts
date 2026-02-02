import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { randomUUID, sha256 } from '$lib/utils/crypto';

// Helper to get authenticated Supabase client with service role
async function getSupabaseAdmin() {
	const { SUPABASE_SERVICE_ROLE_KEY } = await import('$env/static/private');

	console.log('[getSupabaseAdmin] URL:', PUBLIC_SUPABASE_URL);
	console.log('[getSupabaseAdmin] Service role key defined:', !!SUPABASE_SERVICE_ROLE_KEY);
	console.log('[getSupabaseAdmin] Service role key length:', SUPABASE_SERVICE_ROLE_KEY?.length || 0);

	if (!SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined');
	}

	// Create client with explicit service role configuration
	// In Cloudflare Workers/Pages, we need to ensure proper headers are set
	const client = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});

	console.log('[getSupabaseAdmin] Client created successfully');
	return client;
}

/**
 * Hardcoded list of admin emails
 * In production, could move to env variable or database
 */
const ADMIN_EMAILS = [
  'noah@frontier-meals.com',
  'noahchonlee@gmail.com',
  'mock7ee@gmail.com'
];

/**
 * Check if an email is authorized as admin
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Generate a magic link token for admin login
 * Stores HASHED token in database with 15-minute expiry
 * Returns unhashed token to send via email
 */
export async function generateMagicLinkToken(email: string): Promise<string> {
  if (!isAdminEmail(email)) {
    throw new Error('Unauthorized email');
  }

  const supabase = await getSupabaseAdmin();
  const token = randomUUID();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  console.log('[generateMagicLinkToken] Inserting token for:', email);
  const { error } = await supabase.from('admin_magic_links').insert({
    email: email.toLowerCase(),
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    used: false
  });

  if (error) {
    console.error('[generateMagicLinkToken] Database insert failed:', error);
    throw new Error(`Failed to create magic link: ${error.message}`);
  }

  console.log('[generateMagicLinkToken] Token inserted successfully');
  return token; // Return unhashed token to send in email
}

/**
 * Verify a magic link token and mark it as used
 * Hashes incoming token before database lookup
 *
 * C5 FIX: Uses atomic UPDATE ... WHERE used = false ... RETURNING pattern
 * to prevent race condition where the same token could be used twice
 * in parallel requests. Only one request will successfully mark the token
 * as used and receive the row back.
 */
export async function verifyMagicLinkToken(token: string): Promise<{ valid: boolean; email?: string; expired?: boolean }> {
  const supabase = await getSupabaseAdmin();

  // Hash the incoming token to compare with stored hash
  const tokenHash = await sha256(token);
  console.log('[verifyMagicLinkToken] Attempting atomic token claim...');

  // C5 FIX: Atomic update - only one concurrent request will succeed
  // The update includes `used = false` in the WHERE clause, so only
  // unused tokens can be claimed. The first request to execute this
  // UPDATE will set used=true and get the row back; subsequent parallel
  // requests will find no matching row (used is now true).
  const { data: link, error } = await supabase
    .from('admin_magic_links')
    .update({
      used: true,
      used_at: new Date().toISOString()
    })
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .select('*')
    .single();

  // If no row was returned, either token doesn't exist or was already used
  if (error || !link) {
    // Check if the token exists but was already used (for better error messaging)
    const { data: existingLink } = await supabase
      .from('admin_magic_links')
      .select('used, expires_at')
      .eq('token_hash', tokenHash)
      .single();

    if (existingLink) {
      if (existingLink.used) {
        console.log('[verifyMagicLinkToken] Token already used (possible race condition prevented)');
        return { valid: false, expired: false };
      }
      // Token exists but update failed for another reason
      console.error('[verifyMagicLinkToken] Token exists but update failed:', error);
    } else {
      console.log('[verifyMagicLinkToken] Token not found');
    }
    return { valid: false, expired: false };
  }

  // Check expiry (token was claimed but might be expired)
  const expiresAt = new Date(link.expires_at);
  const now = new Date();

  if (expiresAt < now) {
    console.log('[verifyMagicLinkToken] Token claimed but expired');
    // Token is already marked as used, so it can't be reused even if expired
    return { valid: false, expired: true };
  }

  console.log('[verifyMagicLinkToken] Token successfully claimed and validated');
  return { valid: true, email: link.email };
}

export interface AdminSession {
  sessionId: string;
  jti: string;  // C2: JWT ID for database-backed revocation
  email: string;
  role: 'admin';
  createdAt: string;
  expiresAt: string;
}

/**
 * Create an admin session
 * Returns session data to be stored in encrypted cookie
 * C2: Now includes JTI for database-backed session tracking
 */
export function createAdminSession(email: string): AdminSession {
  const jti = randomUUID();  // JWT ID for revocation tracking
  return {
    sessionId: randomUUID(),
    jti,  // C2: Include JTI for database tracking
    email,
    role: 'admin',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };
}

/**
 * Insert admin session record into database for tracking and revocation
 * C2: Database-backed session tracking
 */
export async function insertAdminSessionRecord(
  session: AdminSession,
  metadata: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  const supabase = await getSupabaseAdmin();

  const { error } = await supabase.from('admin_sessions').insert({
    admin_email: session.email,
    jti: session.jti,
    created_at: session.createdAt,
    expires_at: session.expiresAt,
    ip_address: metadata.ipAddress || null,
    user_agent: metadata.userAgent || null
  });

  if (error) {
    console.error('[Admin Auth] Failed to insert session record:', {
      code: error.code,
      message: error.message
    });
    // Don't throw - session cookie is still valid, just not tracked in DB
    // This allows graceful degradation if DB is temporarily unavailable
  } else {
    console.log('[Admin Auth] Session record inserted for tracking');
  }
}

/**
 * Validate admin session against database
 * C2: Check if session is revoked or expired in database
 * Returns null if session is revoked/expired/not found, or the session if valid
 */
export async function validateAdminSessionInDb(jti: string): Promise<{ valid: boolean; error?: string }> {
  const supabase = await getSupabaseAdmin();

  // Call the database function that handles all validation logic
  const { data, error } = await supabase.rpc('validate_admin_session', {
    p_jti: jti
  });

  if (error) {
    console.error('[Admin Auth] Database session validation error:', {
      code: error.code,
      message: error.message
    });
    // Fail open during database issues to prevent lockout
    // The JWT signature is still valid, so we allow access
    return { valid: true };
  }

  if (!data || data.length === 0) {
    return { valid: false, error: 'SESSION_NOT_FOUND' };
  }

  const result = data[0];
  if (!result.valid) {
    return { valid: false, error: result.error_code };
  }

  return { valid: true };
}

/**
 * Revoke a specific admin session by JTI
 */
export async function revokeAdminSession(
  jti: string,
  revokedBy: string,
  reason?: string
): Promise<boolean> {
  const supabase = await getSupabaseAdmin();

  const { data, error } = await supabase.rpc('revoke_admin_session', {
    p_jti: jti,
    p_revoked_by: revokedBy,
    p_reason: reason || null
  });

  if (error) {
    console.error('[Admin Auth] Failed to revoke session:', {
      code: error.code,
      message: error.message
    });
    return false;
  }

  return data === true;
}

/**
 * Revoke all sessions for an admin (logout everywhere)
 */
export async function revokeAllAdminSessions(
  adminEmail: string,
  revokedBy: string,
  reason?: string
): Promise<number> {
  const supabase = await getSupabaseAdmin();

  const { data, error } = await supabase.rpc('revoke_all_admin_sessions', {
    p_admin_email: adminEmail,
    p_revoked_by: revokedBy,
    p_reason: reason || 'Logout all sessions'
  });

  if (error) {
    console.error('[Admin Auth] Failed to revoke all sessions:', {
      code: error.code,
      message: error.message
    });
    return 0;
  }

  return data || 0;
}

/**
 * Get active sessions for an admin (for session management UI)
 */
export async function getActiveAdminSessions(adminEmail: string): Promise<Array<{
  id: string;
  jti: string;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  use_count: number;
}>> {
  const supabase = await getSupabaseAdmin();

  const { data, error } = await supabase.rpc('get_active_admin_sessions', {
    p_admin_email: adminEmail
  });

  if (error) {
    console.error('[Admin Auth] Failed to get active sessions:', {
      code: error.code,
      message: error.message
    });
    return [];
  }

  return data || [];
}

/**
 * Validate an admin session
 */
export function validateAdminSession(session: any): session is AdminSession {
  if (!session || !session.sessionId || !session.email || !session.role || session.role !== 'admin') {
    return false;
  }

  if (!isAdminEmail(session.email)) {
    return false;
  }

  // Check expiry
  const expiresAt = new Date(session.expiresAt);
  if (expiresAt < new Date()) {
    return false;
  }

  return true;
}
