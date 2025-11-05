/**
 * Web Crypto API utilities for Cloudflare Workers compatibility
 * Replaces Node.js crypto module with Web Crypto API
 */

/**
 * Generate a random UUID
 * Available natively in Web Crypto API
 */
export function randomUUID(): string {
	return crypto.randomUUID();
}

/**
 * Create SHA-256 hash of a string
 * Returns hex-encoded hash
 */
export async function sha256(text: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(text);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

/**
 * Generate random bytes
 * Returns base64-encoded string
 */
export function randomBytes(size: number): string {
	const bytes = new Uint8Array(size);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes));
}

/**
 * Create HMAC signature
 */
export async function createHmac(algorithm: 'sha256', key: string, data: string): Promise<string> {
	const keyBuffer = new TextEncoder().encode(key);
	const dataBuffer = new TextEncoder().encode(data);

	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
	const signatureArray = Array.from(new Uint8Array(signature));
	return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Timing-safe string comparison
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}

	return result === 0;
}
