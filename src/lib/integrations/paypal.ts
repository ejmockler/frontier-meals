/**
 * PayPal REST API Client
 *
 * Uses direct REST API calls (PayPal's official Node SDK is deprecated).
 * Implements OAuth 2.0 authentication with token caching.
 * Uses API-based webhook verification for Cloudflare Workers compatibility.
 *
 * All external API calls are wrapped with timeouts to prevent indefinite hangs.
 */

import { randomUUID } from '$lib/utils/crypto';
import { withTimeout } from '$lib/utils/timeout';

// Default timeout for PayPal API calls (10 seconds)
const PAYPAL_API_TIMEOUT_MS = 10000;

// Shorter timeout for webhook verification (5 seconds - webhooks need fast response)
const PAYPAL_WEBHOOK_TIMEOUT_MS = 5000;

export interface PayPalEnv {
	PAYPAL_CLIENT_ID: string;
	PAYPAL_CLIENT_SECRET: string;
	PAYPAL_WEBHOOK_ID: string;
	PAYPAL_PLAN_ID: string;
	PAYPAL_MODE: 'sandbox' | 'live';
}

// Token cache (in-memory, per-isolate in Cloudflare Workers)
// Keyed by environment mode to prevent cross-environment token reuse
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

/**
 * Get PayPal base URL based on mode
 */
export function getPayPalBaseUrl(mode: 'sandbox' | 'live'): string {
	return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

/**
 * Get OAuth access token (cached for performance)
 * Tokens expire after ~9 hours, we cache with 5-minute buffer
 */
export async function getPayPalAccessToken(env: PayPalEnv): Promise<string> {
	const mode = env.PAYPAL_MODE || 'sandbox';
	const cached = tokenCache[mode];

	// Return cached token if still valid
	if (cached && cached.expiresAt > Date.now()) {
		return cached.token;
	}

	// Validate credentials before Base64 encoding
	// Empty credentials would create malformed auth headers (e.g., "Basic Og==")
	if (!env.PAYPAL_CLIENT_ID || typeof env.PAYPAL_CLIENT_ID !== 'string' || env.PAYPAL_CLIENT_ID.trim() === '') {
		throw new Error(`[PayPal] PAYPAL_CLIENT_ID is missing or empty for ${mode} mode. Check your environment configuration.`);
	}
	if (!env.PAYPAL_CLIENT_SECRET || typeof env.PAYPAL_CLIENT_SECRET !== 'string' || env.PAYPAL_CLIENT_SECRET.trim() === '') {
		throw new Error(`[PayPal] PAYPAL_CLIENT_SECRET is missing or empty for ${mode} mode. Check your environment configuration.`);
	}

	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Base64 encode credentials (validated above)
	const credentials = `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`;
	const auth = btoa(credentials);

	// Wrap OAuth token fetch with timeout to prevent indefinite hangs
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/oauth2/token`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${auth}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: 'grant_type=client_credentials'
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal OAuth token fetch'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] OAuth failed:', { status: response.status, error });
		throw new Error(`PayPal OAuth failed: ${error}`);
	}

	const data = (await response.json()) as { access_token: string; expires_in: number };

	// Cache with 5-minute buffer before expiry
	tokenCache[mode] = {
		token: data.access_token,
		expiresAt: Date.now() + (data.expires_in - 300) * 1000
	};

	return data.access_token;
}

/**
 * Create a subscription
 */
export interface CreateSubscriptionOptions {
	planId: string;
	customId?: string;
	returnUrl: string;
	cancelUrl: string;
}

export interface PayPalSubscription {
	id: string;
	status: string;
	links: Array<{ href: string; rel: string; method: string }>;
}

/**
 * PayPal Billing Cycle (from Plan API response)
 */
export interface PayPalBillingCycle {
	frequency: {
		interval_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
		interval_count: number;
	};
	tenure_type: 'TRIAL' | 'REGULAR';
	sequence: number;
	total_cycles: number;
	pricing_scheme?: {
		fixed_price: {
			value: string;
			currency_code: string;
		};
	};
}

/**
 * PayPal Plan Details (from GET /v1/billing/plans/{planId})
 */
export interface PayPalPlanDetails {
	id: string;
	product_id: string;
	name: string;
	status: string;
	billing_cycles: PayPalBillingCycle[];
}

/**
 * Parsed trial info extracted from PayPal billing cycles
 */
export interface ParsedTrialInfo {
	trialPriceAmount: number | null;
	trialDurationMonths: number | null;
	regularPrice: number;
}

export async function createPayPalSubscription(
	env: PayPalEnv,
	options: CreateSubscriptionOptions
): Promise<PayPalSubscription> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Wrap subscription creation with timeout
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/billing/subscriptions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'PayPal-Request-Id': randomUUID()
			},
			body: JSON.stringify({
				plan_id: options.planId,
				custom_id: options.customId,
				application_context: {
					brand_name: 'Frontier Meals',
					locale: 'en-US',
					shipping_preference: 'NO_SHIPPING',
					user_action: 'SUBSCRIBE_NOW',
					payment_method: {
						payer_selected: 'PAYPAL',
						payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
					},
					return_url: options.returnUrl,
					cancel_url: options.cancelUrl
				}
			})
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal subscription creation'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Subscription creation failed:', { status: response.status, error });
		throw new Error(`PayPal subscription creation failed: ${error}`);
	}

	return (await response.json()) as PayPalSubscription;
}

/**
 * Verify webhook signature using PayPal's API
 *
 * This approach is more reliable than manual CRC32 verification and
 * works well in Cloudflare Workers without additional dependencies.
 */
export async function verifyPayPalWebhook(
	env: PayPalEnv,
	body: string,
	headers: Headers
): Promise<boolean> {
	const transmissionId = headers.get('paypal-transmission-id');
	const transmissionTime = headers.get('paypal-transmission-time');
	const certUrl = headers.get('paypal-cert-url');
	const transmissionSig = headers.get('paypal-transmission-sig');
	const authAlgo = headers.get('paypal-auth-algo');

	if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
		console.error('[PayPal] Missing webhook headers');
		return false;
	}

	// Security: Verify cert URL is from PayPal
	try {
		const certUrlParsed = new URL(certUrl);
		if (!certUrlParsed.hostname.endsWith('.paypal.com')) {
			console.error('[PayPal] Invalid certificate URL hostname:', certUrlParsed.hostname);
			return false;
		}
	} catch {
		console.error('[PayPal] Invalid certificate URL:', certUrl);
		return false;
	}

	try {
		const accessToken = await getPayPalAccessToken(env);
		const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

		// Use PayPal's verification API with timeout
		// Webhook verification uses shorter timeout (5s) since webhooks need fast response
		const verifyResponse = await withTimeout(
			fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					auth_algo: authAlgo,
					cert_url: certUrl,
					transmission_id: transmissionId,
					transmission_sig: transmissionSig,
					transmission_time: transmissionTime,
					webhook_id: env.PAYPAL_WEBHOOK_ID,
					webhook_event: JSON.parse(body)
				})
			}),
			PAYPAL_WEBHOOK_TIMEOUT_MS,
			'PayPal webhook signature verification'
		);

		if (!verifyResponse.ok) {
			const error = await verifyResponse.text();
			console.error('[PayPal] Webhook verification API failed:', {
				status: verifyResponse.status,
				error
			});
			return false;
		}

		const result = (await verifyResponse.json()) as { verification_status: string };
		return result.verification_status === 'SUCCESS';
	} catch (error) {
		console.error('[PayPal] Webhook verification error:', error);
		return false;
	}
}

/**
 * Get subscription details
 */
export interface PayPalSubscriptionDetails {
	id: string;
	status: string;
	plan_id: string;
	subscriber: {
		email_address: string;
		payer_id: string;
		name?: {
			given_name?: string;
			surname?: string;
		};
	};
	billing_info?: {
		next_billing_time?: string;
		last_payment?: {
			time?: string;
			amount?: {
				currency_code: string;
				value: string;
			};
		};
		failed_payments_count?: number;
	};
	custom_id?: string;
	create_time: string;
	update_time: string;
}

export async function getPayPalSubscription(
	env: PayPalEnv,
	subscriptionId: string
): Promise<PayPalSubscriptionDetails> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Wrap subscription fetch with timeout
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal subscription details fetch'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Failed to fetch subscription:', { status: response.status, error });
		throw new Error(`Failed to fetch subscription: ${error}`);
	}

	return (await response.json()) as PayPalSubscriptionDetails;
}

/**
 * Cancel a subscription
 */
export async function cancelPayPalSubscription(
	env: PayPalEnv,
	subscriptionId: string,
	reason: string = 'Customer requested cancellation'
): Promise<void> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Wrap cancellation with timeout
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ reason })
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal subscription cancellation'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Subscription cancellation failed:', { status: response.status, error });
		throw new Error(`Subscription cancellation failed: ${error}`);
	}
}

/**
 * Suspend a subscription (can be reactivated later)
 */
export async function suspendPayPalSubscription(
	env: PayPalEnv,
	subscriptionId: string,
	reason: string = 'Subscription suspended'
): Promise<void> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Wrap suspension with timeout
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/suspend`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ reason })
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal subscription suspension'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Subscription suspension failed:', { status: response.status, error });
		throw new Error(`Subscription suspension failed: ${error}`);
	}
}

/**
 * Reactivate a suspended subscription
 */
export async function activatePayPalSubscription(
	env: PayPalEnv,
	subscriptionId: string,
	reason: string = 'Subscription reactivated'
): Promise<void> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Wrap activation with timeout
	const response = await withTimeout(
		fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/activate`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ reason })
		}),
		PAYPAL_API_TIMEOUT_MS,
		'PayPal subscription activation'
	);

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Subscription activation failed:', { status: response.status, error });
		throw new Error(`Subscription activation failed: ${error}`);
	}
}

/**
 * Validate that a PayPal Plan ID exists
 * Returns true if plan exists, false otherwise
 */
export async function validatePayPalPlanExists(
	env: PayPalEnv,
	planId: string
): Promise<{ exists: boolean; error?: string }> {
	try {
		const accessToken = await getPayPalAccessToken(env);
		const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

		// Wrap plan validation with timeout
		const response = await withTimeout(
			fetch(`${baseUrl}/v1/billing/plans/${planId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			}),
			PAYPAL_API_TIMEOUT_MS,
			'PayPal plan validation'
		);

		if (response.ok) {
			return { exists: true };
		}

		if (response.status === 404) {
			return { exists: false, error: 'Plan not found in PayPal' };
		}

		const errorBody = await response.text();
		return { exists: false, error: `PayPal API error: ${response.status}` };
	} catch (error) {
		console.error('[PayPal] Error validating plan:', error);
		return { exists: false, error: 'Failed to connect to PayPal' };
	}
}

/**
 * Fetch full PayPal Plan details including billing cycles
 * Used during admin plan sync to auto-extract pricing and trial info
 */
export async function getPayPalPlanDetails(
	env: PayPalEnv,
	planId: string
): Promise<{ success: boolean; plan?: PayPalPlanDetails; error?: string }> {
	try {
		const accessToken = await getPayPalAccessToken(env);
		const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

		const response = await withTimeout(
			fetch(`${baseUrl}/v1/billing/plans/${planId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			}),
			PAYPAL_API_TIMEOUT_MS,
			'PayPal plan details fetch'
		);

		if (response.ok) {
			const plan = (await response.json()) as PayPalPlanDetails;
			return { success: true, plan };
		}

		if (response.status === 404) {
			return { success: false, error: 'Plan not found in PayPal' };
		}

		const errorBody = await response.text();
		console.error('[PayPal] Plan details fetch failed:', { status: response.status, errorBody });
		return { success: false, error: `PayPal API error: ${response.status}` };
	} catch (error) {
		console.error('[PayPal] Error fetching plan details:', error);
		return { success: false, error: 'Failed to connect to PayPal' };
	}
}

/**
 * Convert PayPal billing interval to months
 */
function convertToMonths(unit: string, intervalCount: number, totalCycles: number): number {
	const totalIntervals = intervalCount * totalCycles;

	switch (unit) {
		case 'DAY':
			return Math.round((totalIntervals / 30) * 10) / 10;
		case 'WEEK':
			return Math.round((totalIntervals / 4.33) * 10) / 10;
		case 'MONTH':
			return totalIntervals;
		case 'YEAR':
			return totalIntervals * 12;
		default:
			return totalIntervals;
	}
}

/**
 * Parse PayPal billing cycles to extract trial and regular pricing
 *
 * PayPal rules:
 * - Max 2 TRIAL cycles, 1 REGULAR cycle per plan
 * - TRIAL cycles have finite total_cycles (1-999)
 * - REGULAR cycle can have total_cycles=0 (infinite)
 * - Free trials omit pricing_scheme
 * - Sequence determines execution order (TRIAL before REGULAR)
 */
export function parseBillingCycles(billingCycles: PayPalBillingCycle[]): ParsedTrialInfo {
	const sorted = [...billingCycles].sort((a, b) => a.sequence - b.sequence);

	const trialCycles = sorted.filter((c) => c.tenure_type === 'TRIAL');
	const regularCycle = sorted.find((c) => c.tenure_type === 'REGULAR');

	if (!regularCycle) {
		throw new Error('PayPal plan missing REGULAR billing cycle');
	}

	const regularPrice = regularCycle.pricing_scheme
		? parseFloat(regularCycle.pricing_scheme.fixed_price.value)
		: 0;

	if (trialCycles.length === 0) {
		return {
			trialPriceAmount: null,
			trialDurationMonths: null,
			regularPrice
		};
	}

	// Sum trial duration across all trial cycles, use last trial's price
	let totalTrialMonths = 0;
	let trialPrice = 0;

	for (const cycle of trialCycles) {
		trialPrice = cycle.pricing_scheme
			? parseFloat(cycle.pricing_scheme.fixed_price.value)
			: 0;

		totalTrialMonths += convertToMonths(
			cycle.frequency.interval_unit,
			cycle.frequency.interval_count,
			cycle.total_cycles
		);
	}

	return {
		trialPriceAmount: trialPrice,
		trialDurationMonths: Math.round(totalTrialMonths),
		regularPrice
	};
}
