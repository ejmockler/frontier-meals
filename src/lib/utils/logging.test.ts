import { describe, it, expect } from 'vitest';
import { redactEmail, redactId, redactPII } from './logging';

describe('redactEmail', () => {
	it('should redact email to show domain only', () => {
		expect(redactEmail('user@example.com')).toBe('***@example.com');
		expect(redactEmail('john.doe@gmail.com')).toBe('***@gmail.com');
		expect(redactEmail('admin@company.co.uk')).toBe('***@company.co.uk');
	});

	it('should handle invalid emails', () => {
		expect(redactEmail('invalid')).toBe('[INVALID_EMAIL]');
		expect(redactEmail('no-at-sign')).toBe('[INVALID_EMAIL]');
		expect(redactEmail('@nodomain.com')).toBe('***@nodomain.com');
		expect(redactEmail('noat@')).toBe('[INVALID_EMAIL]');
	});
});

describe('redactId', () => {
	it('should show first 8 characters for long IDs', () => {
		expect(redactId('PAYPAL123456789DEF')).toBe('PAYPAL12...');
		expect(redactId('sub_1234567890abcdef')).toBe('sub_1234...');
	});

	it('should not redact short IDs', () => {
		expect(redactId('short')).toBe('short');
		expect(redactId('12345678')).toBe('12345678'); // Exactly 8 chars
	});

	it('should handle custom prefix length', () => {
		expect(redactId('PAYPAL123456789', 6)).toBe('PAYPAL...');
	});
});

describe('redactPII', () => {
	it('should redact email addresses', () => {
		const result = redactPII({
			email: 'user@example.com',
			user_email: 'admin@company.com'
		});

		expect(result.email).toBe('***@example.com');
		expect(result.user_email).toBe('***@company.com');
	});

	it('should fully redact names', () => {
		const result = redactPII({
			name: 'John Doe',
			given_name: 'John',
			surname: 'Doe',
			customer_name: 'Jane Smith'
		});

		expect(result.name).toBe('[REDACTED]');
		expect(result.given_name).toBe('[REDACTED]');
		expect(result.surname).toBe('[REDACTED]');
		expect(result.customer_name).toBe('[REDACTED]');
	});

	it('should prefix-redact IDs', () => {
		const result = redactPII({
			payer_id: 'PAYPAL123456789DEF',
			subscription_id: 'sub_1234567890abcdef',
			customer_id: 'cus_ABCDEFGHIJKLMNOP'
		});

		expect(result.payer_id).toBe('PAYPAL12...');
		expect(result.subscription_id).toBe('sub_1234...');
		expect(result.customer_id).toBe('cus_ABCD...');
	});

	it('should handle PayPal webhook data realistically', () => {
		const webhookData = {
			payer_id: 'PAYPAL123456789DEF',
			subscription_id: 'I-ABCDEFGH1234',
			email: 'customer@gmail.com',
			name: 'John Doe'
		};

		const redacted = redactPII(webhookData);

		expect(redacted).toEqual({
			payer_id: 'PAYPAL12...',
			subscription_id: 'I-ABCDEF...',
			email: '***@gmail.com',
			name: '[REDACTED]'
		});
	});

	it('should handle nested objects', () => {
		const result = redactPII({
			user: {
				email: 'user@example.com',
				name: 'John Doe',
				id: 'user_12345678'
			},
			payment: {
				payer_id: 'PAYPAL123456789'
			}
		});

		expect(result).toEqual({
			user: {
				email: '***@example.com',
				name: '[REDACTED]',
				id: 'user_12345678' // Short ID not redacted
			},
			payment: {
				payer_id: 'PAYPAL12...'
			}
		});
	});

	it('should handle arrays', () => {
		const result = redactPII({
			customers: [
				{ email: 'user1@example.com', name: 'User 1' },
				{ email: 'user2@example.com', name: 'User 2' }
			]
		});

		expect(result.customers).toEqual([
			{ email: '***@example.com', name: '[REDACTED]' },
			{ email: '***@example.com', name: '[REDACTED]' }
		]);
	});

	it('should preserve non-sensitive data', () => {
		const result = redactPII({
			email: 'user@example.com',
			amount: 29.99,
			currency: 'USD',
			status: 'active',
			created_at: '2024-01-01T00:00:00Z'
		});

		expect(result.email).toBe('***@example.com');
		expect(result.amount).toBe(29.99);
		expect(result.currency).toBe('USD');
		expect(result.status).toBe('active');
		expect(result.created_at).toBe('2024-01-01T00:00:00Z');
	});

	it('should handle null and undefined values', () => {
		const result = redactPII({
			email: null,
			name: undefined,
			amount: 0
		});

		expect(result.email).toBeNull();
		expect(result.name).toBeUndefined();
		expect(result.amount).toBe(0);
	});

	it('should support custom redaction config', () => {
		const result = redactPII(
			{
				secret_key: 'sk_live_1234567890',
				api_token: 'token_abcdefghij'
			},
			{
				fullRedact: ['secret_key'],
				prefixRedact: ['api_token']
			}
		);

		expect(result.secret_key).toBe('[REDACTED]');
		expect(result.api_token).toBe('token_ab...');
	});

	it('should support custom redaction functions', () => {
		const result = redactPII(
			{
				credit_card: '4111111111111111'
			},
			{
				custom: {
					credit_card: (value) => `****-****-****-${String(value).slice(-4)}`
				}
			}
		);

		expect(result.credit_card).toBe('****-****-****-1111');
	});
});
