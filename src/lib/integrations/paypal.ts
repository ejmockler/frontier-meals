/**
 * PayPal REST API Client
 *
 * Uses direct REST API calls (PayPal's official Node SDK is deprecated).
 * Implements OAuth 2.0 authentication with token caching.
 * Uses API-based webhook verification for Cloudflare Workers compatibility.
 */

import { randomUUID } from '$lib/utils/crypto';

export interface PayPalEnv {
	PAYPAL_CLIENT_ID: string;
	PAYPAL_CLIENT_SECRET: string;
	PAYPAL_WEBHOOK_ID: string;
	PAYPAL_PLAN_ID: string;
	PAYPAL_MODE: 'sandbox' | 'live';
}

// Token cache (in-memory, per-isolate in Cloudflare Workers)
let tokenCache: { token: string; expiresAt: number } | null = null;

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
	// Return cached token if still valid
	if (tokenCache && tokenCache.expiresAt > Date.now()) {
		return tokenCache.token;
	}

	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	// Base64 encode credentials
	const credentials = `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`;
	const auth = btoa(credentials);

	const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] OAuth failed:', { status: response.status, error });
		throw new Error(`PayPal OAuth failed: ${error}`);
	}

	const data = (await response.json()) as { access_token: string; expires_in: number };

	// Cache with 5-minute buffer before expiry
	tokenCache = {
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

export async function createPayPalSubscription(
	env: PayPalEnv,
	options: CreateSubscriptionOptions
): Promise<PayPalSubscription> {
	const accessToken = await getPayPalAccessToken(env);
	const baseUrl = getPayPalBaseUrl(env.PAYPAL_MODE);

	const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
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
	});

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

		// Use PayPal's verification API
		const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
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
		});

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

	const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});

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

	const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ reason })
	});

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

	const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/suspend`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ reason })
	});

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

	const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/activate`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ reason })
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('[PayPal] Subscription activation failed:', { status: response.status, error });
		throw new Error(`Subscription activation failed: ${error}`);
	}
}
