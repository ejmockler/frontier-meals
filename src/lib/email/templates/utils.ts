/**
 * Email Template Security Utilities
 *
 * Provides HTML escaping to prevent XSS and injection attacks
 * when rendering user-provided content in email templates.
 */

/**
 * Escape HTML special characters to prevent XSS/injection attacks
 *
 * Converts the following characters to their HTML entity equivalents:
 * - & -> &amp;
 * - < -> &lt;
 * - > -> &gt;
 * - " -> &quot;
 * - ' -> &#x27;
 *
 * @param str - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
export function escapeHtml(str: string): string {
  // Handle null, undefined, and non-string types safely
  if (str === null || str === undefined) {
    return '';
  }

  // Convert to string first, then escape
  const strValue = typeof str === 'string' ? str : String(str);

  return strValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
