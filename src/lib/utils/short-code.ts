/**
 * Generate short, human-friendly codes for QR codes
 * These are much easier to scan than full JWTs
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes 0,1,O,I to avoid confusion

/**
 * Generate a random short code
 * @param length - Length of code (default: 8)
 * @returns Uppercase alphanumeric code (e.g., "3K7P9WXR")
 */
export function generateShortCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return code;
}

/**
 * Format short code with dashes for better readability
 * @param code - Raw code (e.g., "3K7P9WXR")
 * @returns Formatted code (e.g., "3K7P-9WXR")
 */
export function formatShortCode(code: string): string {
  // Split into groups of 4
  return code.match(/.{1,4}/g)?.join('-') || code;
}

/**
 * Validate short code format
 * @param code - Code to validate
 * @returns true if valid format
 */
export function isValidShortCode(code: string): boolean {
  // Remove dashes for validation
  const normalized = code.replace(/-/g, '');

  // Check length (8-12 characters)
  if (normalized.length < 8 || normalized.length > 12) {
    return false;
  }

  // Check characters (only valid alphabet)
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/.test(normalized);
}

/**
 * Normalize short code (remove dashes, uppercase)
 * @param code - Code to normalize
 * @returns Normalized code
 */
export function normalizeShortCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase();
}
