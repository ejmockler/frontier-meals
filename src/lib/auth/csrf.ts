import { SESSION_SECRET } from '$env/static/private';
import { createHmac, timingSafeEqual } from '$lib/utils/crypto';

/**
 * Generate CSRF token bound to session
 * Uses HMAC-SHA256 to prevent forgery
 */
export async function generateCSRFToken(sessionId: string): Promise<string> {
	if (!sessionId) {
		throw new Error('Session ID required for CSRF token generation');
	}

	return await createHmac('sha256', SESSION_SECRET, sessionId);
}

/**
 * Validate CSRF token against session
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function validateCSRFToken(sessionId: string, token: string | null): Promise<boolean> {
	if (!sessionId || !token) {
		return false;
	}

	try {
		const expected = await generateCSRFToken(sessionId);
		return timingSafeEqual(expected, token);
	} catch {
		// Comparison failed (likely invalid hex string)
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
export async function validateCSRFFromFormData(formData: FormData, sessionId: string): Promise<boolean> {
	const csrfToken = formData.get('csrf_token') as string;
	return await validateCSRFToken(sessionId, csrfToken);
}
