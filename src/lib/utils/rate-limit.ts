/**
 * Rate Limiting Utility
 *
 * Provides rate limiting functionality using Supabase for storage.
 * Prevents brute force and DoS attacks by tracking request rates per key.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until rate limit resets (only present if not allowed)
}

export interface RateLimitConfig {
  key: string; // Unique identifier for this rate limit scope
  maxRequests: number; // Maximum number of requests allowed in the time window
  windowMinutes: number; // Time window in minutes
}

/**
 * Check rate limit and increment counter if allowed.
 *
 * Uses the database's check_rate_limit function for atomic operations.
 * This prevents race conditions when multiple requests come in simultaneously.
 *
 * @param supabase - Supabase client (must have service role key for access to rate_limits table)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status, remaining requests, and reset time
 *
 * @example
 * ```typescript
 * const result = await checkRateLimit(supabase, {
 *   key: 'kiosk:session123',
 *   maxRequests: 10,
 *   windowMinutes: 1
 * });
 *
 * if (!result.allowed) {
 *   return json(
 *     { error: 'Too many requests' },
 *     {
 *       status: 429,
 *       headers: {
 *         'Retry-After': String(result.retryAfter)
 *       }
 *     }
 *   );
 * }
 * ```
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { key, maxRequests, windowMinutes } = config;

  // Call database function for atomic rate limit check
  const { data, error } = await supabase.rpc('check_rate_limit', {
    limit_key: key,
    max_requests: maxRequests,
    window_minutes: windowMinutes
  });

  if (error) {
    console.error('[Rate Limit] Database error:', error);
    // On database error, fail open (allow request) to prevent DoS of legitimate users
    // In production, you may want to fail closed (reject) or use a fallback mechanism
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowMinutes * 60 * 1000)
    };
  }

  // Parse result from database function
  const result = data as {
    allowed: boolean;
    remaining: number;
    reset_at: string;
  };

  const resetAt = new Date(result.reset_at);
  const retryAfter = result.allowed
    ? undefined
    : Math.ceil((resetAt.getTime() - Date.now()) / 1000);

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt,
    retryAfter
  };
}

/**
 * Helper function to clean up old rate limit records.
 * Should be called periodically via cron or manual cleanup.
 *
 * @param supabase - Supabase client with service role key
 * @param maxAgeHours - Maximum age of records to keep (default: 24 hours)
 * @returns Number of deleted records
 *
 * @example
 * ```typescript
 * const deleted = await cleanupRateLimits(supabase, 24);
 * console.log(`Cleaned up ${deleted} old rate limit records`);
 * ```
 */
export async function cleanupRateLimits(
  supabase: SupabaseClient,
  maxAgeHours = 24
): Promise<number> {
  const { data, error } = await supabase.rpc('cleanup_rate_limits', {
    max_age_hours: maxAgeHours
  });

  if (error) {
    console.error('[Rate Limit] Cleanup error:', error);
    return 0;
  }

  return data as number;
}

/**
 * Rate limit key generators for common use cases
 */
export const RateLimitKeys = {
  /**
   * Generate key for kiosk redemption rate limiting
   * @param kioskSessionToken - Kiosk session token or session ID
   */
  kiosk(kioskSessionToken: string): string {
    // Use first 16 chars of token to avoid overly long keys
    const shortToken = kioskSessionToken.substring(0, 16);
    return `kiosk:${shortToken}`;
  },

  /**
   * Generate key for admin magic link rate limiting
   * @param email - Normalized email address (lowercase, trimmed)
   */
  magicLink(email: string): string {
    return `magic:${email.toLowerCase().trim()}`;
  },

  /**
   * Generate key for checkout rate limiting
   * @param ip - IP address of the requester
   */
  checkout(ip: string): string {
    return `checkout:${ip}`;
  }
};
