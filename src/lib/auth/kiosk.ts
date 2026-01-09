import * as jose from 'jose';
import { KIOSK_PUBLIC_KEY } from '$env/static/private';

/**
 * Validate a kiosk session JWT token
 */
export async function validateKioskSession(token: string): Promise<{
  valid: boolean;
  kiosk_id?: string;
  location?: string;
}> {
  try {
    const publicKey = await jose.importSPKI(KIOSK_PUBLIC_KEY, 'ES256');

    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: 'frontier-meals-admin',
      subject: 'kiosk'
    });

    return {
      valid: true,
      kiosk_id: payload.kiosk_id as string,
      location: payload.location as string
    };
  } catch (error) {
    console.error('[Kiosk] Invalid session token:', error);
    return { valid: false };
  }
}
