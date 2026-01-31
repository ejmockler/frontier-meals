import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/env';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';
import type { DiscountValidationResult } from '$lib/types/discount';

/**
 * POST /api/discount/reserve
 *
 * Validates and reserves a discount code for checkout.
 *
 * Request Body:
 * - code: string - Discount code to validate
 * - email: string - Customer email for reservation
 *
 * Success Response (200):
 * - success: true
 * - reservation_id: UUID for PayPal checkout
 * - plan: { id, name, price, billing_cycle }
 * - discount: { type, value, duration_months, display }
 * - discounted_price: Final price after discount
 * - savings: Amount saved
 *
 * Error Response (400):
 * - success: false
 * - error: { code, message, suggestion?, expires_at? }
 *
 * Features:
 * - Rate limiting: 10 requests per minute per IP
 * - Typo detection: Levenshtein distance <= 2 for suggestions
 * - Atomic reservation: Prevents race conditions on limited-use codes
 * - 15-minute reservation TTL
 */
export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	const supabase = await getSupabaseAdmin(event);

	// Get client IP for rate limiting
	const clientIp =
		request.headers.get('CF-Connecting-IP') ||
		request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
		getClientAddress() ||
		'unknown';

	// Rate limiting: 10 requests per minute per IP
	// Higher than checkout (5/min) to allow typo retries without frustration
	const rateLimitResult = await checkRateLimit(supabase, {
		key: RateLimitKeys.checkout(clientIp), // Reuse checkout key for unified rate limit
		maxRequests: 10,
		windowMinutes: 1
	});

	if (!rateLimitResult.allowed) {
		console.warn('[Discount Reserve] Rate limit exceeded for IP:', clientIp);
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(rateLimitResult.retryAfter),
					'X-RateLimit-Limit': '10',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
				}
			}
		);
	}

	try {
		// Parse and validate request body
		const body = await request.json();
		const { code, email } = body;

		if (!code || typeof code !== 'string') {
			return json(
				{
					success: false,
					error: {
						code: 'INVALID_REQUEST',
						message: 'Discount code is required'
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		if (!email || typeof email !== 'string') {
			return json(
				{
					success: false,
					error: {
						code: 'INVALID_REQUEST',
						message: 'Email is required'
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		// Length validation (DoS protection)
		if (code.length > 100) {
			return json(
				{
					success: false,
					error: {
						code: 'INVALID_REQUEST',
						message: 'Discount code is too long'
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		if (email.length > 255) {
			return json(
				{
					success: false,
					error: {
						code: 'INVALID_REQUEST',
						message: 'Email is too long'
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return json(
				{
					success: false,
					error: {
						code: 'INVALID_REQUEST',
						message: 'Invalid email address'
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		console.log('[Discount Reserve] Validating code:', {
			code: code.toUpperCase().slice(0, 8) + '...',
			email_domain: email.split('@')[1] || 'unknown'
		});

		// Call database function to reserve discount code
		// This is atomic and handles all validation logic
		const { data, error } = await supabase.rpc('reserve_discount_code', {
			p_code: code,
			p_customer_email: email
		});

		if (error) {
			console.error('[Discount Reserve] Database error:', error);
			return json(
				{
					success: false,
					error: {
						code: 'DATABASE_ERROR',
						message: 'Failed to validate discount code'
					}
				} satisfies DiscountValidationResult,
				{ status: 500 }
			);
		}

		// Database function returns a single row with success flag
		const result = Array.isArray(data) ? data[0] : data;

		if (!result) {
			console.error('[Discount Reserve] No result from database function');
			return json(
				{
					success: false,
					error: {
						code: 'DATABASE_ERROR',
						message: 'Failed to validate discount code'
					}
				} satisfies DiscountValidationResult,
				{ status: 500 }
			);
		}

		// Check if validation succeeded
		if (!result.success) {
			const errorCode = result.error_code;
			let errorMessage = result.error_message || 'Invalid discount code';
			let suggestion: string | undefined;
			let expiresAt: string | undefined;

			// For INVALID_CODE errors, check for typos using Levenshtein distance
			if (errorCode === 'INVALID_CODE') {
				suggestion = await findSimilarCode(supabase, code);
				if (suggestion) {
					errorMessage = `Code not found. Did you mean '${suggestion}'?`;
				} else {
					errorMessage = 'Code not found. Check for typos or try another code.';
				}
			}

			// For EXPIRED errors, include expiration date if available
			if (errorCode === 'EXPIRED' && result.expires_at) {
				expiresAt = result.expires_at;
			}

			console.log('[Discount Reserve] Validation failed:', {
				code: errorCode,
				has_suggestion: !!suggestion
			});

			return json(
				{
					success: false,
					error: {
						code: errorCode,
						message: errorMessage,
						suggestion,
						expires_at: expiresAt
					}
				} satisfies DiscountValidationResult,
				{ status: 400 }
			);
		}

		// Success! Compute discounted price and savings
		const planPrice = parseFloat(result.plan_price || '0');
		const discountType = result.discount_type;
		const discountValue = parseFloat(result.discount_value || '0');

		let discountedPrice = planPrice;
		let savings = 0;

		if (discountType === 'percentage') {
			savings = (planPrice * discountValue) / 100;
			discountedPrice = planPrice - savings;
		} else if (discountType === 'fixed_amount') {
			savings = Math.min(discountValue, planPrice); // Can't save more than plan price
			discountedPrice = planPrice - savings;
		} else if (discountType === 'free_trial') {
			// Free trial: first N months free, show $0
			savings = planPrice;
			discountedPrice = 0;
		}

		// Ensure prices are non-negative
		discountedPrice = Math.max(0, discountedPrice);
		savings = Math.max(0, savings);

		// Generate human-readable discount display
		const durationMonths = result.discount_duration_months || 1;
		let discountDisplay = 'Discount applied';

		if (discountType === 'percentage') {
			discountDisplay =
				durationMonths === 1
					? `${discountValue}% off first month`
					: `${discountValue}% off first ${durationMonths} months`;
		} else if (discountType === 'fixed_amount') {
			discountDisplay =
				durationMonths === 1
					? `$${discountValue.toFixed(2)} off first month`
					: `$${discountValue.toFixed(2)} off first ${durationMonths} months`;
		} else if (discountType === 'free_trial') {
			discountDisplay = `${durationMonths} month${durationMonths > 1 ? 's' : ''} free`;
		}

		console.log('[Discount Reserve] Success:', {
			reservation_id: result.reservation_id,
			plan_name: result.plan_name,
			discount_display: discountDisplay,
			original_price: planPrice,
			discounted_price: discountedPrice,
			savings
		});

		return json(
			{
				success: true,
				reservation_id: result.reservation_id,
				plan: {
					id: result.plan_id,
					name: result.plan_name || 'Premium Plan',
					price: planPrice,
					billing_cycle: result.plan_billing_cycle || 'monthly'
				},
				discount: {
					type: discountType,
					value: discountValue,
					duration_months: durationMonths,
					display: discountDisplay
				},
				discounted_price: Math.round(discountedPrice * 100) / 100, // Round to 2 decimals
				savings: Math.round(savings * 100) / 100
			} satisfies DiscountValidationResult,
			{ status: 200 }
		);
	} catch (error) {
		console.error('[Discount Reserve] Unexpected error:', error);
		return json(
			{
				success: false,
				error: {
					code: 'INTERNAL_ERROR',
					message: 'An unexpected error occurred'
				}
			} satisfies DiscountValidationResult,
			{ status: 500 }
		);
	}
};

/**
 * Find similar discount codes using Levenshtein distance
 *
 * Algorithm:
 * - Fetch all active codes
 * - Compute Levenshtein distance for each
 * - Return closest match if distance <= 2 AND distance < 30% of input length
 *
 * Examples:
 * - "WELC0ME" -> "WELCOME" (distance: 1)
 * - "SUMMER50" -> "SUMMER50" (exact match, distance: 0)
 * - "ABCD" -> null (no similar codes)
 */
async function findSimilarCode(
	supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
	inputCode: string
): Promise<string | undefined> {
	const normalized = inputCode.toUpperCase().trim();

	// Fetch all active discount codes
	const { data: activeCodes, error } = await supabase
		.from('discount_codes')
		.select('code')
		.eq('is_active', true);

	if (error || !activeCodes || activeCodes.length === 0) {
		return undefined;
	}

	let closestCode: string | undefined;
	let minDistance = Infinity;

	for (const codeRow of activeCodes) {
		const code = codeRow.code;
		const distance = levenshteinDistance(normalized, code);

		// Only consider if distance is small enough
		// - Must be <= 2 character changes
		// - Must be < 30% of input length (prevents "ABC" matching "SUMMER2024")
		if (distance <= 2 && distance < normalized.length * 0.3 && distance < minDistance) {
			minDistance = distance;
			closestCode = code;
		}
	}

	return closestCode;
}

/**
 * Compute Levenshtein distance between two strings
 *
 * Levenshtein distance = minimum number of single-character edits (insertions, deletions, substitutions)
 * required to change one string into another.
 *
 * Algorithm: Dynamic programming with O(m*n) time and O(min(m,n)) space
 *
 * Examples:
 * - levenshteinDistance("WELCOME", "WELC0ME") = 1 (substitute O -> 0)
 * - levenshteinDistance("SUMMER", "SUMMER50") = 2 (insert 5, insert 0)
 * - levenshteinDistance("ABC", "XYZ") = 3 (all different)
 */
function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;

	// Base cases
	if (len1 === 0) return len2;
	if (len2 === 0) return len1;

	// Optimize space: only keep current and previous row
	// instead of full matrix
	let prevRow = Array.from({ length: len2 + 1 }, (_, i) => i);
	let currRow = new Array(len2 + 1);

	for (let i = 1; i <= len1; i++) {
		currRow[0] = i;

		for (let j = 1; j <= len2; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

			currRow[j] = Math.min(
				prevRow[j] + 1, // deletion
				currRow[j - 1] + 1, // insertion
				prevRow[j - 1] + cost // substitution
			);
		}

		// Swap rows for next iteration
		[prevRow, currRow] = [currRow, prevRow];
	}

	return prevRow[len2];
}
