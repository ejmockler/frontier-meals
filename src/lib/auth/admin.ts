import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import {
	IS_DEMO_MODE,
	bypassAdminEmailCheck,
	bypassMagicLinkGeneration,
	bypassMagicLinkVerification,
	bypassAdminSessionCreation,
	bypassAdminSessionValidation
} from '$lib/demo';

// Helper to get authenticated Supabase client with service role
async function getSupabaseAdmin() {
	const { SUPABASE_SERVICE_ROLE_KEY } = await import('$env/static/private');
	return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  // Demo mode: all emails are valid
  if (IS_DEMO_MODE) {
    return bypassAdminEmailCheck(email);
  }

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

  // Demo mode: return mock token without database write
  if (IS_DEMO_MODE) {
    return bypassMagicLinkGeneration(email);
  }

  const supabase = await getSupabaseAdmin();
  const token = randomUUID();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await supabase.from('admin_magic_links').insert({
    email: email.toLowerCase(),
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    used: false
  });

  return token; // Return unhashed token to send in email
}

/**
 * Verify a magic link token and mark it as used
 * Hashes incoming token before database lookup
 */
export async function verifyMagicLinkToken(token: string): Promise<{ valid: boolean; email?: string }> {
  // Demo mode: accept any token
  if (IS_DEMO_MODE) {
    return bypassMagicLinkVerification(token);
  }

  const supabase = await getSupabaseAdmin();

  // Hash the incoming token to compare with stored hash
  const tokenHash = await sha256(token);
  console.log('[verifyMagicLinkToken] Token hash:', tokenHash);

  const { data: link, error } = await supabase
    .from('admin_magic_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .single();

  console.log('[verifyMagicLinkToken] Database query result:', { link, error });

  if (error || !link) {
    console.error('[verifyMagicLinkToken] Token not found or already used:', error);
    return { valid: false };
  }

  // Check expiry
  const expiresAt = new Date(link.expires_at);
  const now = new Date();
  console.log('[verifyMagicLinkToken] Expiry check:', { expiresAt: expiresAt.toISOString(), now: now.toISOString(), expired: expiresAt < now });

  if (expiresAt < now) {
    console.error('[verifyMagicLinkToken] Token expired');
    return { valid: false };
  }

  console.log('[verifyMagicLinkToken] Token valid, marking as used');

  // Mark as used
  await supabase
    .from('admin_magic_links')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  return { valid: true, email: link.email };
}

export interface AdminSession {
  sessionId: string;
  email: string;
  role: 'admin';
  createdAt: string;
  expiresAt: string;
}

/**
 * Create an admin session
 * Returns session data to be stored in encrypted cookie
 */
export function createAdminSession(email: string): AdminSession {
  // Demo mode: return mock session
  if (IS_DEMO_MODE) {
    return bypassAdminSessionCreation(email);
  }

  return {
    sessionId: randomUUID(),
    email,
    role: 'admin',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };
}

/**
 * Validate an admin session
 */
export function validateAdminSession(session: any): session is AdminSession {
  // Demo mode: accept any session
  if (IS_DEMO_MODE) {
    return bypassAdminSessionValidation(session);
  }

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
