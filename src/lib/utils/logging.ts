/**
 * PII-Safe Logging Utilities
 *
 * Implements data minimization for GDPR/CCPA compliance by redacting
 * personally identifiable information (PII) in application logs.
 *
 * Security Principles:
 * - Email: Show domain only (***@domain.com)
 * - IDs: Show prefix only (first 8 chars + ...)
 * - Names: Full redaction ([REDACTED])
 * - Other sensitive fields: Configurable redaction
 *
 * @module logging
 */

export interface RedactionConfig {
	/** Fields to fully redact (replaced with '[REDACTED]') */
	fullRedact?: string[];
	/** Fields to partially redact (show prefix only) */
	prefixRedact?: string[];
	/** Custom redaction functions */
	custom?: Record<string, (value: unknown) => string>;
}

const DEFAULT_CONFIG: Required<RedactionConfig> = {
	fullRedact: ['name', 'given_name', 'surname', 'address', 'phone', 'ssn', 'credit_card'],
	prefixRedact: ['payer_id', 'customer_id', 'subscription_id', 'token', 'session_id'],
	custom: {}
};

/**
 * Redacts email addresses to show domain only.
 *
 * @example
 * redactEmail('user@example.com') // => '***@example.com'
 * redactEmail('invalid') // => '[INVALID_EMAIL]'
 */
export function redactEmail(email: string): string {
	if (typeof email !== 'string' || !email.includes('@')) {
		return '[INVALID_EMAIL]';
	}

	const parts = email.split('@');
	if (parts.length !== 2 || !parts[1]) {
		return '[INVALID_EMAIL]';
	}

	return `***@${parts[1]}`;
}

/**
 * Redacts IDs to show prefix only (first 8 characters).
 *
 * @example
 * redactId('ABC123456789DEF') // => 'ABC12345...'
 * redactId('short') // => 'short'
 */
export function redactId(id: string, prefixLength = 8): string {
	if (typeof id !== 'string') {
		return '[INVALID_ID]';
	}

	if (id.length <= prefixLength) {
		return id; // Don't redact short IDs
	}

	return `${id.slice(0, prefixLength)}...`;
}

/**
 * Recursively redacts PII from nested objects and arrays.
 *
 * @param data - Object containing potentially sensitive data
 * @param config - Optional redaction configuration
 * @returns New object with PII redacted
 *
 * @example
 * redactPII({
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   payer_id: 'PAYPAL123456789'
 * })
 * // => {
 * //   email: '***@example.com',
 * //   name: '[REDACTED]',
 * //   payer_id: 'PAYPAL12...'
 * // }
 */
export function redactPII(
	data: Record<string, unknown>,
	config: RedactionConfig = {}
): Record<string, unknown> {
	// Merge with defaults
	const fullRedact = [...DEFAULT_CONFIG.fullRedact, ...(config.fullRedact || [])];
	const prefixRedact = [...DEFAULT_CONFIG.prefixRedact, ...(config.prefixRedact || [])];
	const custom = { ...DEFAULT_CONFIG.custom, ...config.custom };

	const redacted: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();

		// Handle null/undefined
		if (value === null || value === undefined) {
			redacted[key] = value;
			continue;
		}

		// Custom redaction function
		if (custom[key]) {
			redacted[key] = custom[key](value);
			continue;
		}

		// Email field
		if (lowerKey.includes('email') && typeof value === 'string') {
			redacted[key] = redactEmail(value);
			continue;
		}

		// Full redaction
		if (fullRedact.some((field) => lowerKey.includes(field.toLowerCase()))) {
			redacted[key] = '[REDACTED]';
			continue;
		}

		// Prefix redaction for IDs
		if (
			prefixRedact.some((field) => lowerKey.includes(field.toLowerCase())) &&
			typeof value === 'string'
		) {
			redacted[key] = redactId(value);
			continue;
		}

		// Recursively handle nested objects
		if (typeof value === 'object' && !Array.isArray(value)) {
			redacted[key] = redactPII(value as Record<string, unknown>, config);
			continue;
		}

		// Recursively handle arrays
		if (Array.isArray(value)) {
			redacted[key] = value.map((item) =>
				typeof item === 'object' && item !== null
					? redactPII(item as Record<string, unknown>, config)
					: item
			);
			continue;
		}

		// Pass through non-sensitive primitive values
		redacted[key] = value;
	}

	return redacted;
}

/**
 * Type guard for checking if a value is a plain object suitable for redaction.
 */
export function isRedactableObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates a logging wrapper that automatically redacts PII.
 *
 * @example
 * const logger = createPIISafeLogger('PayPal');
 * logger.info('User subscribed', { email: 'user@example.com', name: 'John' });
 * // Output: [PayPal] User subscribed { email: '***@example.com', name: '[REDACTED]' }
 */
export function createPIISafeLogger(prefix: string, config?: RedactionConfig) {
	const redact = (data: unknown) => {
		if (isRedactableObject(data)) {
			return redactPII(data, config);
		}
		return data;
	};

	return {
		log: (message: string, data?: unknown) => {
			console.log(`[${prefix}] ${message}`, data ? redact(data) : '');
		},
		info: (message: string, data?: unknown) => {
			console.log(`[${prefix}] ${message}`, data ? redact(data) : '');
		},
		warn: (message: string, data?: unknown) => {
			console.warn(`[${prefix}] ${message}`, data ? redact(data) : '');
		},
		error: (message: string, data?: unknown) => {
			console.error(`[${prefix}] ${message}`, data ? redact(data) : '');
		}
	};
}
