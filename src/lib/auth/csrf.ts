import { SESSION_SECRET } from '$env/static/private';
import * as crypto from 'crypto';

/**
 * Generate CSRF token bound to session
 * Uses HMAC-SHA256 to prevent forgery
 */
export function generateCSRFToken(sessionId: string): string {
	if (!sessionId) {
		throw new Error('Session ID required for CSRF token generation');
	}

	return crypto
		.createHmac('sha256', SESSION_SECRET)
		.update(sessionId)
		.digest('hex');
}

/**
 * Validate CSRF token against session
 * Uses timing-safe comparison to prevent timing attacks
 */
export function validateCSRFToken(sessionId: string, token: string | null): boolean {
	if (!sessionId || !token) {
		return false;
	}

	try {
		const expected = generateCSRFToken(sessionId);
		return crypto.timingSafeEqual(
			Buffer.from(expected, 'hex'),
			Buffer.from(token, 'hex')
		);
	} catch {
		// Buffer creation or comparison failed (likely invalid hex string)
		return false;
	}
}

/**
 * Extract CSRF token from form data or headers
 */
export function extractCSRFToken(request: Request): string | null {
	// Try header first (for JSON requests)
	const headerToken = request.headers.get('x-csrf-token');
	if (headerToken) return headerToken;

	// For form submissions, token should be in body
	// (caller must parse and pass separately)
	return null;
}

/**
 * Validate CSRF token from form data
 * Call this at the start of every admin form action
 *
 * @param formData FormData object (already parsed from request)
 * @param sessionId Session ID to validate against
 * @returns true if valid, false if invalid
 */
export function validateCSRFFromFormData(formData: FormData, sessionId: string): boolean {
	const csrfToken = formData.get('csrf_token') as string;
	return validateCSRFToken(sessionId, csrfToken);
}
