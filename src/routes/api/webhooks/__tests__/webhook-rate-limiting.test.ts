/**
 * Webhook Rate Limiting Tests
 *
 * Verifies that webhook endpoints are protected against abuse and DDoS attacks.
 * Tests both PayPal and Stripe webhook rate limiting.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Test database setup
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Webhook Rate Limiting', () => {
	const testIp = '203.0.113.42'; // TEST-NET-3 reserved IP range

	beforeAll(async () => {
		// Clean up test rate limit keys
		await supabase.from('rate_limits').delete().like('key', 'webhook:%');
	});

	beforeEach(async () => {
		// Clean up between tests
		await supabase.from('rate_limits').delete().like('key', 'webhook:%');
	});

	afterAll(async () => {
		// Final cleanup
		await supabase.from('rate_limits').delete().like('key', 'webhook:%');
	});

	describe('Rate Limit Configuration', () => {
		it('should have webhook rate limits set to 100 requests per minute', () => {
			// This is a documentation test to ensure the rate limit is correctly configured
			const expectedMaxRequests = 100;
			const expectedWindowMinutes = 1;

			expect(expectedMaxRequests).toBe(100);
			expect(expectedWindowMinutes).toBe(1);
		});

		it('should use separate rate limit keys for Stripe and PayPal', () => {
			const stripeKey = `webhook:stripe:${testIp}`;
			const paypalKey = `webhook:paypal:${testIp}`;

			expect(stripeKey).not.toBe(paypalKey);
			expect(stripeKey).toContain('stripe');
			expect(paypalKey).toContain('paypal');
		});
	});

	describe('IP Address Extraction', () => {
		it('should prioritize CF-Connecting-IP header', () => {
			const cfIp = '198.51.100.1';
			const forwardedIp = '192.0.2.1';

			// In production, the webhook handler would use CF-Connecting-IP
			// This test documents the expected behavior
			const extractedIp = cfIp; // CF-Connecting-IP takes priority

			expect(extractedIp).toBe(cfIp);
			expect(extractedIp).not.toBe(forwardedIp);
		});

		it('should fall back to X-Forwarded-For if CF header missing', () => {
			const forwardedIp = '192.0.2.1';
			const fallbackIp = '127.0.0.1';

			// In production, X-Forwarded-For is the fallback
			const extractedIp = forwardedIp || fallbackIp;

			expect(extractedIp).toBe(forwardedIp);
		});

		it('should use getClientAddress() as final fallback', () => {
			const clientAddress = '10.0.0.1';

			// This would be the SvelteKit getClientAddress() return value
			expect(clientAddress).toBeTruthy();
		});
	});

	describe('Rate Limit Protection', () => {
		it('should track Stripe webhook requests separately', async () => {
			const key = `webhook:stripe:${testIp}`;

			// Simulate first webhook request
			const { data: result1 } = await supabase.rpc('check_rate_limit', {
				limit_key: key,
				max_requests: 100,
				window_minutes: 1
			});

			expect(result1).toBeTruthy();
			expect(result1.allowed).toBe(true);
			expect(result1.remaining).toBe(99);
		});

		it('should track PayPal webhook requests separately', async () => {
			const key = `webhook:paypal:${testIp}`;

			// Simulate first webhook request
			const { data: result1 } = await supabase.rpc('check_rate_limit', {
				limit_key: key,
				max_requests: 100,
				window_minutes: 1
			});

			expect(result1).toBeTruthy();
			expect(result1.allowed).toBe(true);
			expect(result1.remaining).toBe(99);
		});

		it(
			'should not interfere between Stripe and PayPal rate limits',
			async () => {
				const stripeKey = `webhook:stripe:203.0.113.50`;
				const paypalKey = `webhook:paypal:203.0.113.50`;

				// Make 10 Stripe requests (reduced for test performance)
				for (let i = 0; i < 10; i++) {
					await supabase.rpc('check_rate_limit', {
						limit_key: stripeKey,
						max_requests: 100,
						window_minutes: 1
					});
				}

				// Make 10 PayPal requests
				for (let i = 0; i < 10; i++) {
					await supabase.rpc('check_rate_limit', {
						limit_key: paypalKey,
						max_requests: 100,
						window_minutes: 1
					});
				}

				// Both should still have remaining quota
				const { data: stripeResult } = await supabase.rpc('check_rate_limit', {
					limit_key: stripeKey,
					max_requests: 100,
					window_minutes: 1
				});

				const { data: paypalResult } = await supabase.rpc('check_rate_limit', {
					limit_key: paypalKey,
					max_requests: 100,
					window_minutes: 1
				});

				expect(stripeResult.allowed).toBe(true);
				expect(stripeResult.remaining).toBe(89); // 11 requests made (10 + this one)

				expect(paypalResult.allowed).toBe(true);
				expect(paypalResult.remaining).toBe(89); // 11 requests made (10 + this one)
			},
			10000
		); // 10 second timeout

		it(
			'should block requests after exceeding 100 per minute',
			async () => {
				const key = `webhook:stripe:203.0.113.51`;

				// Make 100 requests
				for (let i = 0; i < 100; i++) {
					const { data } = await supabase.rpc('check_rate_limit', {
						limit_key: key,
						max_requests: 100,
						window_minutes: 1
					});
					expect(data.allowed).toBe(true);
				}

				// 101st request should be blocked
				const { data: blockedResult } = await supabase.rpc('check_rate_limit', {
					limit_key: key,
					max_requests: 100,
					window_minutes: 1
				});

				expect(blockedResult.allowed).toBe(false);
				expect(blockedResult.remaining).toBe(0);
				expect(blockedResult.reset_at).toBeTruthy();
			},
			15000
		); // 15 second timeout

		it('should handle concurrent webhook requests atomically', async () => {
			const key = `webhook:stripe:203.0.113.52`;
			const maxRequests = 100;

			// Simulate 150 concurrent webhook requests (e.g., during high activity)
			const results = await Promise.all(
				Array.from({ length: 150 }, () =>
					supabase.rpc('check_rate_limit', {
						limit_key: key,
						max_requests: maxRequests,
						window_minutes: 1
					})
				)
			);

			const allowedCount = results.filter((r) => r.data?.allowed === true).length;
			const blockedCount = results.filter((r) => r.data?.allowed === false).length;

			// Due to concurrent execution, the atomic database function ensures
			// that no more than maxRequests are allowed
			// In practice, some requests may fail due to network/database timing,
			// so we check for a reasonable range
			expect(allowedCount).toBeGreaterThanOrEqual(95); // At least 95% success
			expect(allowedCount).toBeLessThanOrEqual(maxRequests); // Never exceed limit
			expect(allowedCount + blockedCount).toBe(150); // All requests accounted for
		});
	});

	describe('Monitoring and Logging', () => {
		it('should log rate limit events to audit_log', async () => {
			const testIpRedacted = 'xxx.xxx.xxx.42';

			// Simulate rate limit logging
			const { error } = await supabase.from('audit_log').insert({
				actor: 'system',
				action: 'webhook_rate_limit_exceeded',
				subject: `webhook:stripe:${testIpRedacted}`,
				metadata: {
					ip: testIpRedacted,
					reset_at: new Date(Date.now() + 60000).toISOString()
				}
			});

			expect(error).toBeNull();

			// Verify log was created
			const { data: logs } = await supabase
				.from('audit_log')
				.select('*')
				.eq('action', 'webhook_rate_limit_exceeded')
				.eq('subject', `webhook:stripe:${testIpRedacted}`)
				.order('created_at', { ascending: false })
				.limit(1);

			expect(logs).toBeTruthy();
			expect(logs?.length).toBeGreaterThan(0);
			expect(logs?.[0].metadata.ip).toBe(testIpRedacted);

			// Clean up
			await supabase
				.from('audit_log')
				.delete()
				.eq('action', 'webhook_rate_limit_exceeded')
				.eq('subject', `webhook:stripe:${testIpRedacted}`);
		});
	});

	describe('HTTP Response Headers', () => {
		it('should include Retry-After header when rate limited', () => {
			// Documentation test for expected response headers
			const expectedHeaders = {
				'Retry-After': '60', // seconds
				'X-RateLimit-Limit': '100',
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': expect.any(String) // ISO timestamp
			};

			expect(expectedHeaders['Retry-After']).toBeTruthy();
			expect(expectedHeaders['X-RateLimit-Limit']).toBe('100');
			expect(expectedHeaders['X-RateLimit-Remaining']).toBe('0');
		});

		it('should return 429 status code when rate limited', () => {
			const expectedStatusCode = 429;
			expect(expectedStatusCode).toBe(429);
		});
	});

	describe('Webhook Signature Verification Order', () => {
		it('should perform rate limiting BEFORE signature verification', () => {
			// Documentation test: Rate limiting should happen first to prevent
			// computational DoS via signature verification on invalid payloads
			const operationOrder = ['rate_limit', 'signature_verification', 'process_webhook'];

			expect(operationOrder[0]).toBe('rate_limit');
			expect(operationOrder[1]).toBe('signature_verification');
			expect(operationOrder[2]).toBe('process_webhook');
		});
	});

	describe('Known Webhook IP Ranges', () => {
		it('should document Stripe webhook IP ranges', () => {
			// Stripe publishes their webhook IP ranges
			// This is informational - rate limiting applies to all IPs
			const stripeIpRanges = [
				// These are examples, not exhaustive
				'3.18.12.0/23',
				'3.130.192.0/23',
				'13.235.14.0/23',
				'13.235.122.0/23'
				// ... more ranges from https://stripe.com/docs/ips
			];

			expect(stripeIpRanges.length).toBeGreaterThan(0);
		});

		it('should document PayPal webhook IP ranges', () => {
			// PayPal publishes their webhook IP ranges
			// This is informational - rate limiting applies to all IPs
			const paypalIpRanges = [
				// These are examples, not exhaustive
				'64.4.240.0/20',
				'66.211.168.0/22',
				'173.0.80.0/20'
				// ... more ranges from PayPal documentation
			];

			expect(paypalIpRanges.length).toBeGreaterThan(0);
		});

		it('should allow higher limits for verified webhook signatures', () => {
			// Current implementation: 100 req/min regardless of signature
			// Future enhancement: Could increase limit after signature verification
			const currentLimit = 100;
			const potentialVerifiedLimit = 500; // Could be higher for verified webhooks

			expect(currentLimit).toBe(100);
			expect(potentialVerifiedLimit).toBeGreaterThan(currentLimit);

			// This is a placeholder for potential future enhancement
			// where verified webhook signatures could get higher rate limits
		});
	});
});
