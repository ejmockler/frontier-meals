/**
 * Demo Mode Auth Bypass Utilities
 *
 * Functions to bypass authentication checks in demo mode
 */

import { getMockAdminSession, getMockKioskSession, getMockRedemptionResult } from './mock-data';
import { logDemoAction } from './config';
import type { DemoAdminSession, DemoKioskSession, DemoRedemptionResult } from './types';

/**
 * Bypass admin email validation
 * Returns true for any email in demo mode
 */
export function bypassAdminEmailCheck(email: string): boolean {
  logDemoAction('Admin email bypass', { email });
  return true; // Any email is valid in demo mode
}

/**
 * Bypass admin magic link token generation
 * Returns a mock token that doesn't need to be in the database
 */
export function bypassMagicLinkGeneration(email: string): string {
  logDemoAction('Magic link generation bypass', { email });
  return 'demo-magic-link-token-' + Date.now();
}

/**
 * Bypass magic link token verification
 * Returns success for any token in demo mode
 */
export function bypassMagicLinkVerification(token: string): { valid: boolean; email: string } {
  logDemoAction('Magic link verification bypass', { token });
  return {
    valid: true,
    email: 'demo.admin@frontier-meals.com'
  };
}

/**
 * Bypass admin session creation
 * Returns a mock admin session
 */
export function bypassAdminSessionCreation(email: string): DemoAdminSession {
  logDemoAction('Admin session creation bypass', { email });
  return getMockAdminSession();
}

/**
 * Bypass admin session validation
 * Returns true for any session data in demo mode
 */
export function bypassAdminSessionValidation(session: any): boolean {
  logDemoAction('Admin session validation bypass');
  return true; // Any session is valid in demo mode
}

/**
 * Bypass kiosk session validation
 * Returns mock kiosk session for any token
 */
export function bypassKioskSessionValidation(token: string): DemoKioskSession {
  logDemoAction('Kiosk session validation bypass', { token });
  return getMockKioskSession(token);
}

/**
 * Bypass QR code JWT verification
 * Returns success for any QR token
 */
export function bypassQRTokenVerification(
  qrToken: string
): { valid: boolean; customerId?: string; serviceDate?: string; jti?: string } {
  logDemoAction('QR token verification bypass', { qrToken });
  return {
    valid: true,
    customerId: 'demo-cust-001',
    serviceDate: new Date().toISOString().split('T')[0],
    jti: 'demo-jti-' + Date.now()
  };
}

/**
 * Bypass meal redemption RPC call
 * Returns mock redemption result
 */
export function bypassMealRedemption(qrToken: string): DemoRedemptionResult {
  logDemoAction('Meal redemption bypass', { qrToken });
  return getMockRedemptionResult(qrToken);
}

/**
 * Bypass CSRF token validation
 * Returns true for any token in demo mode
 */
export function bypassCSRFValidation(token: string): boolean {
  logDemoAction('CSRF validation bypass', { token });
  return true;
}
