/**
 * Short Code Generator
 *
 * Generates human-friendly codes for QR codes that are much easier to scan than full JWTs.
 *
 * Configuration:
 * - Alphabet of 32 chars = 5 bits per char
 * - 10 chars = 50 bits of entropy (~1.1 quadrillion combinations)
 * - Note: 256 % 32 = 0, so no modulo bias in generation
 */

// =============================================================================
// Configuration Constants
// =============================================================================

/**
 * Character alphabet for short codes.
 * Excludes 0, 1, O, I to avoid visual confusion.
 * 32 characters = 5 bits of entropy per character.
 */
const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Minimum allowed short code length */
const MIN_SHORT_CODE_LENGTH = 8;

/** Maximum allowed short code length */
const MAX_SHORT_CODE_LENGTH = 12;

/** Default short code length if not specified */
const DEFAULT_SHORT_CODE_LENGTH = 8;

/**
 * Generate a random short code
 * @param length - Length of code (default: 8)
 * @returns Uppercase alphanumeric code (e.g., "3K7P9WXR")
 */
export function generateShortCode(length = DEFAULT_SHORT_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let code = '';
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
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

  // Check length
  if (normalized.length < MIN_SHORT_CODE_LENGTH || normalized.length > MAX_SHORT_CODE_LENGTH) {
    return false;
  }

  // Check characters (only valid alphabet)
  const validCharsRegex = new RegExp(`^[${SHORT_CODE_ALPHABET}]+$`);
  return validCharsRegex.test(normalized);
}

/**
 * Normalize short code (remove dashes, uppercase)
 * @param code - Code to normalize
 * @returns Normalized code
 */
export function normalizeShortCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase();
}
