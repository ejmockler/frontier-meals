/**
 * Stripe Checkout Creation Integration Tests
 *
 * Tests against REAL Supabase for rate limiting.
 * Mocks: Stripe API (to avoid real charges)
 * Real: Supabase database rate limiting, crypto functions
 *
 * CRITICAL BUSINESS PATH: Entry point for all subscription purchases
 *
 * TESTS COVERAGE:
 * 1. Rate limiting - Database-backed, 5 requests/minute per IP
 * 2. Checkout session creation - Deep link token generation, metadata
 * 3. Error handling - Stripe API failures, logging
 * 4. IP extraction - Header priority (CF-Connecting-IP > X-Forwarded-For > fallback)
 * 5. Demo mode - Bypasses Stripe calls, returns mock URL
 *
 * NOTE: Demo mode tests are currently not feasible in this test suite because
 * IS_DEMO_MODE is determined at module load time from environment variables.
 * To test demo mode, set DEMO_MODE=true in .env before running tests.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';

// Test database setup
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test data
const TEST_PREFIX = `checkout_test_${Date.now()}`;

// Mock Stripe at module level
vi.mock('stripe', () => {
	const mockCreate = vi.fn().mockResolvedValue({
		url: 'https://checkout.stripe.com/test-session',
		id: 'cs_test_123'
	});

	return {
		default: vi.fn(() => ({
			checkout: {
				sessions: {
					create: mockCreate
				}
			}
		}))
	};
});

describe('Stripe Checkout Creation Integration (Real DB + Mocked Stripe)', () => {
	// Track rate limit keys to clean up
	const rateLimitKeysToCleanup: string[] = [];

	// Import the handler after mocks are set up
	let POST: any;

	beforeAll(async () => {
		// Clean up any existing test rate limits
		await supabase.from('rate_limits').delete().like('key', 'checkout:%test%');

		// Import handler after mocks
		const module = await import('../+server');
		POST = module.POST;
	});

	afterAll(async () => {
		// Clean up all test rate limit keys
		for (const key of rateLimitKeysToCleanup) {
			await supabase.from('rate_limits').delete().eq('key', key);
		}

		// Final cleanup
		await supabase.from('rate_limits').delete().like('key', 'checkout:%test%');
	});

	/**
	 * Helper to create mock RequestEvent for testing
	 */
	function createMockRequest(options: {
		headers?: Record<string, string>;
		clientAddress?: string;
		origin?: string;
	} = {}): RequestEvent {
		const {
			headers = {},
			clientAddress = '127.0.0.1',
			origin = 'http://localhost:5173'
		} = options;

		const mockHeaders = new Headers(headers);
		const mockRequest = {
			headers: mockHeaders
		} as Request;

		const mockUrl = new URL(origin);

		return {
			request: mockRequest,
			url: mockUrl,
			getClientAddress: () => clientAddress,
			// Add other required RequestEvent properties as no-ops
			params: {},
			route: { id: null },
			locals: {},
			platform: undefined,
			cookies: {} as any,
			fetch: fetch,
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		} as unknown as RequestEvent;
	}

	/**
	 * Helper to parse JSON response
	 */
	async function parseJsonResponse(response: Response) {
		return JSON.parse(await response.text());
	}

	/**
	 * Helper to get Stripe mock
	 */
	function getStripeMock() {
		const StripeConstructor = vi.mocked(Stripe);
		const stripeInstance = new StripeConstructor('test-key', { apiVersion: '2025-10-29.clover' });
		return stripeInstance.checkout.sessions.create as any;
	}

	describe('P1: Rate Limiting - Database Backed', () => {
		it('CRITICAL: First 5 requests succeed', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-1`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			// Reset mock
			const createMock = getStripeMock();
			createMock.mockClear();

			// Make 5 requests (should all succeed)
			const results = [];
			for (let i = 0; i < 5; i++) {
				const mockEvent = createMockRequest({
					headers: { 'CF-Connecting-IP': testIp }
				});

				const response = await POST(mockEvent);
				results.push({
					status: response.status,
					body: await parseJsonResponse(response)
				});
			}

			// All 5 should succeed
			results.forEach((result, index) => {
				expect(result.status).toBe(200);
				expect(result.body).toHaveProperty('url');
				console.log(`[Rate Limit Test] Request ${index + 1}/5: ✓ Success (${result.status})`);
			});

			// Stripe should have been called 5 times
			expect(createMock).toHaveBeenCalledTimes(5);
		}, 30000);

		it('CRITICAL: 6th request returns 429 with Retry-After header', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-2`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			// Make 5 successful requests
			for (let i = 0; i < 5; i++) {
				const mockEvent = createMockRequest({
					headers: { 'CF-Connecting-IP': testIp }
				});
				await POST(mockEvent);
			}

			// 6th request should be rate limited
			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			const response = await POST(mockEvent);
			const body = await parseJsonResponse(response);

			expect(response.status).toBe(429);
			expect(body).toHaveProperty('error');
			expect(body.error).toContain('Too many requests');

			// Verify rate limit headers
			expect(response.headers.get('Retry-After')).toBeTruthy();
			expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
			expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
			expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();

			const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
			expect(retryAfter).toBeGreaterThan(0);
			expect(retryAfter).toBeLessThanOrEqual(60); // Within 1 minute window

			console.log(`[Rate Limit Test] 6th request: ✓ 429 (Retry-After: ${retryAfter}s)`);
		}, 30000);

		it('CRITICAL: Different IPs have separate rate limits', async () => {
			const testIp1 = `test-ip-${TEST_PREFIX}-3a`;
			const testIp2 = `test-ip-${TEST_PREFIX}-3b`;
			rateLimitKeysToCleanup.push(`checkout:${testIp1}`, `checkout:${testIp2}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			// Exhaust IP1's limit
			for (let i = 0; i < 5; i++) {
				const mockEvent = createMockRequest({
					headers: { 'CF-Connecting-IP': testIp1 }
				});
				await POST(mockEvent);
			}

			// IP1's 6th request should fail
			const ip1Response = await POST(
				createMockRequest({
					headers: { 'CF-Connecting-IP': testIp1 }
				})
			);
			expect(ip1Response.status).toBe(429);

			// IP2's first request should succeed
			const ip2Response = await POST(
				createMockRequest({
					headers: { 'CF-Connecting-IP': testIp2 }
				})
			);
			expect(ip2Response.status).toBe(200);

			console.log('[Rate Limit Test] IP isolation: ✓ Separate limits per IP');
		}, 30000);

		it('EDGE CASE: Concurrent requests respect rate limit atomically', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-4`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			// Make 10 concurrent requests
			const requests = Array.from({ length: 10 }, () =>
				POST(
					createMockRequest({
						headers: { 'CF-Connecting-IP': testIp }
					})
				)
			);

			const responses = await Promise.all(requests);

			// Count successes vs rate limited
			const successes = responses.filter((r) => r.status === 200).length;
			const rateLimited = responses.filter((r) => r.status === 429).length;

			// Exactly 5 should succeed (atomic database operation)
			expect(successes).toBe(5);
			expect(rateLimited).toBe(5);

			console.log(`[Rate Limit Test] Concurrent: ✓ ${successes} allowed, ${rateLimited} rejected`);
		}, 30000);
	});

	describe('P1: Checkout Session Creation', () => {
		it('CRITICAL: Creates session with deep_link_token in metadata', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-5`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			await POST(mockEvent);

			// Verify Stripe was called
			expect(createMock).toHaveBeenCalledOnce();
			const callArgs = createMock.mock.calls[0][0];

			// Verify metadata contains deep link tokens
			expect(callArgs.metadata).toHaveProperty('deep_link_token');
			expect(callArgs.metadata).toHaveProperty('deep_link_token_hash');
			expect(callArgs.metadata).toHaveProperty('source', 'web_landing');

			// Verify token is a UUID format
			expect(callArgs.metadata.deep_link_token).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
			);

			// Verify hash is hex string
			expect(callArgs.metadata.deep_link_token_hash).toMatch(/^[0-9a-f]{64}$/);

			console.log('[Session Test] Metadata: ✓ Deep link token included');
		}, 30000);

		it('CRITICAL: custom_fields includes telegram_handle', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-6`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			await POST(mockEvent);

			const callArgs = createMock.mock.calls[0][0];

			expect(callArgs.custom_fields).toBeDefined();
			expect(callArgs.custom_fields).toHaveLength(1);
			expect(callArgs.custom_fields[0]).toMatchObject({
				key: 'telegram_handle',
				type: 'text',
				label: {
					type: 'custom',
					custom: expect.stringContaining('Telegram Handle')
				}
			});

			console.log('[Session Test] Custom fields: ✓ Telegram handle field configured');
		}, 30000);

		it('CRITICAL: success_url includes token parameter', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-7`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockOrigin = 'https://example.com';
			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp },
				origin: mockOrigin
			});

			await POST(mockEvent);

			const callArgs = createMock.mock.calls[0][0];

			// Verify success URL format
			expect(callArgs.success_url).toMatch(
				new RegExp(`^${mockOrigin}/success\\?session_id=\\{CHECKOUT_SESSION_ID\\}&t=[0-9a-f-]+$`)
			);
			expect(callArgs.cancel_url).toBe(mockOrigin);

			console.log('[Session Test] URLs: ✓ Success URL includes token parameter');
		}, 30000);

		it('CRITICAL: Includes line_items with STRIPE_PRICE_ID', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-8`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			await POST(mockEvent);

			const callArgs = createMock.mock.calls[0][0];

			expect(callArgs.mode).toBe('subscription');
			expect(callArgs.line_items).toBeDefined();
			expect(callArgs.line_items).toHaveLength(1);
			expect(callArgs.line_items[0]).toMatchObject({
				price: expect.stringMatching(/^price_/),
				quantity: 1
			});

			console.log('[Session Test] Line items: ✓ Price ID configured');
		}, 30000);

		it('CRITICAL: Includes additional checkout options', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-8b`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			await POST(mockEvent);

			const callArgs = createMock.mock.calls[0][0];

			// Verify additional options
			expect(callArgs.allow_promotion_codes).toBe(true);
			expect(callArgs.billing_address_collection).toBe('auto');
			expect(callArgs.consent_collection).toHaveProperty('terms_of_service', 'required');
			expect(callArgs.custom_text).toHaveProperty('terms_of_service_acceptance');

			console.log('[Session Test] Options: ✓ Promotion codes, billing, consent configured');
		}, 30000);
	});

	describe('P1: Error Handling', () => {
		it('CRITICAL: Stripe API error returns 500 with error message', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-9`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			// Mock Stripe to throw error
			const stripeError = new Error('Stripe API unavailable');
			createMock.mockRejectedValueOnce(stripeError);

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			const response = await POST(mockEvent);
			const body = await parseJsonResponse(response);

			expect(response.status).toBe(500);
			expect(body).toHaveProperty('error');
			expect(body.error).toContain('Failed to create checkout session');

			console.log('[Error Test] Stripe failure: ✓ Returns 500 with error message');
		}, 30000);

		it('CRITICAL: Error is logged to console', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-10`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const stripeError = new Error('Network timeout');
			createMock.mockRejectedValueOnce(stripeError);

			// Spy on console.error
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const mockEvent = createMockRequest({
				headers: { 'CF-Connecting-IP': testIp }
			});

			await POST(mockEvent);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Error creating checkout session:',
				stripeError
			);

			consoleErrorSpy.mockRestore();

			console.log('[Error Test] Logging: ✓ Errors logged to console');
		}, 30000);
	});

	describe('P1: IP Extraction Priority', () => {
		it('CRITICAL: CF-Connecting-IP header takes priority', async () => {
			const cfIp = `cf-ip-${TEST_PREFIX}`;
			const forwardedIp = `forwarded-ip-${TEST_PREFIX}`;
			const fallbackIp = `fallback-ip-${TEST_PREFIX}`;

			rateLimitKeysToCleanup.push(`checkout:${cfIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: {
					'CF-Connecting-IP': cfIp,
					'X-Forwarded-For': forwardedIp
				},
				clientAddress: fallbackIp
			});

			await POST(mockEvent);

			// Verify CF IP was used (check database for rate limit key)
			const { data } = await supabase
				.from('rate_limits')
				.select('*')
				.eq('key', `checkout:${cfIp}`)
				.single();

			expect(data).not.toBeNull();
			expect(data?.count).toBe(1);

			console.log('[IP Test] Priority: ✓ CF-Connecting-IP used');
		}, 30000);

		it('CRITICAL: X-Forwarded-For fallback when CF header missing', async () => {
			const forwardedIp = `forwarded-ip-${TEST_PREFIX}-2`;
			const fallbackIp = `fallback-ip-${TEST_PREFIX}-2`;

			rateLimitKeysToCleanup.push(`checkout:${forwardedIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: {
					'X-Forwarded-For': `${forwardedIp}, 192.168.1.1, 10.0.0.1`
				},
				clientAddress: fallbackIp
			});

			await POST(mockEvent);

			// Verify first IP from X-Forwarded-For was used
			const { data } = await supabase
				.from('rate_limits')
				.select('*')
				.eq('key', `checkout:${forwardedIp}`)
				.single();

			expect(data).not.toBeNull();

			console.log('[IP Test] Fallback: ✓ X-Forwarded-For used when CF missing');
		}, 30000);

		it('CRITICAL: getClientAddress() as last resort', async () => {
			const fallbackIp = `fallback-ip-${TEST_PREFIX}-3`;

			rateLimitKeysToCleanup.push(`checkout:${fallbackIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: {}, // No IP headers
				clientAddress: fallbackIp
			});

			await POST(mockEvent);

			// Verify fallback IP was used
			const { data } = await supabase
				.from('rate_limits')
				.select('*')
				.eq('key', `checkout:${fallbackIp}`)
				.single();

			expect(data).not.toBeNull();

			console.log('[IP Test] Last resort: ✓ getClientAddress() used');
		}, 30000);

		it('EDGE CASE: Handles "unknown" IP gracefully', async () => {
			rateLimitKeysToCleanup.push('checkout:unknown');

			const createMock = getStripeMock();
			createMock.mockClear();

			const mockEvent = createMockRequest({
				headers: {},
				clientAddress: '' // Empty string should trigger "unknown"
			});

			const response = await POST(mockEvent);

			// Should still process request
			expect(response.status).toBeLessThan(500);

			console.log('[IP Test] Edge case: ✓ Handles unknown IP');
		}, 30000);
	});

	describe('Security: Console Warning for Rate Limits', () => {
		it('CRITICAL: Logs warning when rate limit exceeded', async () => {
			const testIp = `test-ip-${TEST_PREFIX}-warn`;
			rateLimitKeysToCleanup.push(`checkout:${testIp}`);

			const createMock = getStripeMock();
			createMock.mockClear();

			// Exhaust rate limit
			for (let i = 0; i < 5; i++) {
				await POST(
					createMockRequest({
						headers: { 'CF-Connecting-IP': testIp }
					})
				);
			}

			// Spy on console.warn
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			// 6th request
			await POST(
				createMockRequest({
					headers: { 'CF-Connecting-IP': testIp }
				})
			);

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('[Stripe Checkout] Rate limit exceeded'),
				testIp
			);

			consoleWarnSpy.mockRestore();

			console.log('[Security Test] Warning: ✓ Rate limit warning logged');
		}, 30000);
	});
});
