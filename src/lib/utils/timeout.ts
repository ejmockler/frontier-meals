/**
 * Timeout Utility
 *
 * Wraps promises with a configurable timeout to prevent indefinite hangs
 * when external services (APIs, databases) become unresponsive.
 *
 * Uses Promise.race() pattern for clean timeout handling.
 */

/**
 * Custom error class for timeout errors
 * Allows callers to distinguish timeout errors from other errors
 */
export class TimeoutError extends Error {
	public readonly timeoutMs: number;
	public readonly operation: string;

	constructor(operation: string, timeoutMs: number) {
		super(`${operation} timed out after ${timeoutMs}ms`);
		this.name = 'TimeoutError';
		this.timeoutMs = timeoutMs;
		this.operation = operation;

		// Maintains proper stack trace for where error was thrown (V8 engines)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, TimeoutError);
		}
	}
}

/**
 * Wraps a promise with a timeout
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Timeout in milliseconds (default: 10000ms / 10 seconds)
 * @param operation - Description of the operation for error messages (default: 'Operation')
 * @returns The resolved value of the promise if it completes before timeout
 * @throws TimeoutError if the promise doesn't resolve within the timeout
 *
 * @example
 * ```typescript
 * // Basic usage with defaults (10s timeout)
 * const data = await withTimeout(fetch('/api/data'));
 *
 * // Custom timeout and operation name
 * const token = await withTimeout(
 *   getPayPalAccessToken(env),
 *   5000,
 *   'PayPal OAuth token fetch'
 * );
 *
 * // Handle timeout specifically
 * try {
 *   const result = await withTimeout(slowApi(), 3000, 'Slow API call');
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log(`Timed out after ${error.timeoutMs}ms`);
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number = 10000,
	operation: string = 'Operation'
): Promise<T> {
	// Create a timeout promise that rejects after the specified time
	let timeoutId: ReturnType<typeof setTimeout>;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new TimeoutError(operation, timeoutMs));
		}, timeoutMs);
	});

	try {
		// Race the original promise against the timeout
		const result = await Promise.race([promise, timeoutPromise]);
		return result;
	} finally {
		// Always clear the timeout to prevent memory leaks
		// This runs whether the promise resolved, rejected, or timed out
		clearTimeout(timeoutId!);
	}
}

/**
 * Creates a pre-configured timeout wrapper with default settings
 *
 * Useful for creating service-specific timeout functions with
 * consistent defaults across multiple calls.
 *
 * @param defaultTimeoutMs - Default timeout for all wrapped operations
 * @param servicePrefix - Prefix for operation names (e.g., 'PayPal', 'Stripe')
 *
 * @example
 * ```typescript
 * const paypalTimeout = createTimeoutWrapper(15000, 'PayPal');
 *
 * // All calls use 15s timeout and 'PayPal:' prefix
 * const token = await paypalTimeout(getToken(), 'OAuth');
 * // Error message: "PayPal: OAuth timed out after 15000ms"
 * ```
 */
export function createTimeoutWrapper(
	defaultTimeoutMs: number = 10000,
	servicePrefix: string = ''
) {
	return async function <T>(
		promise: Promise<T>,
		operation: string = 'Operation',
		timeoutMs: number = defaultTimeoutMs
	): Promise<T> {
		const fullOperation = servicePrefix ? `${servicePrefix}: ${operation}` : operation;
		return withTimeout(promise, timeoutMs, fullOperation);
	};
}
