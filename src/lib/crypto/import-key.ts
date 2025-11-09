/**
 * Import ES256 private key from PEM string using Web Crypto API
 * Workaround for Cloudflare Workers PKCS8 environment variable issue
 *
 * @param pem - PEM-formatted EC private key string (with BEGIN/END markers and newlines)
 * @returns CryptoKey suitable for ES256 signing
 */
export async function importES256PrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers/footers and decode base64
  const pemContents = pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, ''); // Remove all whitespace including newlines

  // Decode base64 to binary
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Import as ECDSA P-256 key for signing
  const key = await crypto.subtle.importKey(
    'pkcs8',
    bytes,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );

  return key;
}
