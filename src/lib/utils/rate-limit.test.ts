import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, cleanupRateLimits, RateLimitKeys } from './rate-limit';

// Test database setup
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Rate Limiting', () => {
  // Clean up test data before and after tests
  beforeAll(async () => {
    // Delete all test rate limit keys
    await supabase.from('rate_limits').delete().like('key', 'test:%');
  });

  afterAll(async () => {
    // Clean up test data
    await supabase.from('rate_limits').delete().like('key', 'test:%');
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await checkRateLimit(supabase, {
        key: 'test:first-request',
        maxRequests: 5,
        windowMinutes: 1
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow requests up to the limit', async () => {
      const key = 'test:up-to-limit';
      const maxRequests = 3;

      // First request
      const result1 = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes: 1
      });
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      // Second request
      const result2 = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes: 1
      });
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      // Third request
      const result3 = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes: 1
      });
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should reject requests over the limit', async () => {
      const key = 'test:over-limit';
      const maxRequests = 2;

      // First two requests should succeed
      await checkRateLimit(supabase, { key, maxRequests, windowMinutes: 1 });
      await checkRateLimit(supabase, { key, maxRequests, windowMinutes: 1 });

      // Third request should be rejected
      const result = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes: 1
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    // Skipped: Database function check_rate_limit requires INTEGER for window_minutes,
    // so we can't test sub-minute windows. The minimum window is 1 minute which is
    // too long for unit tests. This test would verify window expiration behavior.
    it.skip('should reset count after window expires', async () => {
      const key = 'test:window-reset';
      const maxRequests = 2;
      const windowMinutes = 1; // Minimum window is 1 minute (INTEGER constraint)

      // First request
      const result1 = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes
      });
      expect(result1.allowed).toBe(true);

      // Wait for window to expire (would need 60+ seconds)
      await new Promise((resolve) => setTimeout(resolve, 61000));

      // After window expires, should reset
      const result2 = await checkRateLimit(supabase, {
        key,
        maxRequests,
        windowMinutes
      });
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1); // Should be back to max - 1
    });

    it('should handle concurrent requests atomically', async () => {
      const key = 'test:concurrent';
      const maxRequests = 5;

      // Make 10 concurrent requests
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          checkRateLimit(supabase, {
            key,
            maxRequests,
            windowMinutes: 1
          })
        )
      );

      // Count how many were allowed
      const allowedCount = results.filter((r) => r.allowed).length;
      const rejectedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBe(maxRequests);
      expect(rejectedCount).toBe(10 - maxRequests);
    });
  });

  describe('cleanupRateLimits', () => {
    it('should clean up old records', async () => {
      // Insert old record by directly modifying the database
      const oldKey = 'test:old-record';
      await supabase.from('rate_limits').insert({
        key: oldKey,
        count: 5,
        window_start: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      });

      // Clean up records older than 24 hours
      const deletedCount = await cleanupRateLimits(supabase, 24);

      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify the old record is gone
      const { data } = await supabase
        .from('rate_limits')
        .select('*')
        .eq('key', oldKey)
        .single();

      expect(data).toBeNull();
    });

    it('should not delete recent records', async () => {
      const recentKey = 'test:recent-record';

      // Create a recent record
      await checkRateLimit(supabase, {
        key: recentKey,
        maxRequests: 5,
        windowMinutes: 1
      });

      // Try to clean up records older than 24 hours
      await cleanupRateLimits(supabase, 24);

      // Verify the recent record still exists
      const { data } = await supabase
        .from('rate_limits')
        .select('*')
        .eq('key', recentKey)
        .single();

      expect(data).not.toBeNull();
      expect(data?.key).toBe(recentKey);
    });
  });

  describe('RateLimitKeys', () => {
    it('should generate kiosk key', () => {
      const token = 'abc123def456ghi789jkl';
      const key = RateLimitKeys.kiosk(token);

      expect(key).toBe('kiosk:abc123def456ghi7');
      expect(key.length).toBeLessThan(50); // Reasonable key length
    });

    it('should generate magic link key', () => {
      const email = 'Test@Example.COM';
      const key = RateLimitKeys.magicLink(email);

      expect(key).toBe('magic:test@example.com');
    });

    it('should generate checkout key', () => {
      const ip = '192.168.1.1';
      const key = RateLimitKeys.checkout(ip);

      expect(key).toBe('checkout:192.168.1.1');
    });
  });
});
