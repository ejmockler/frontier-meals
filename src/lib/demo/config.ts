/**
 * Demo Mode Configuration
 *
 * Single source of truth for demo mode state.
 * When enabled, bypasses all authentication and database operations.
 */

import { env } from '$env/dynamic/private';

/**
 * Check if application is running in demo mode
 */
export const IS_DEMO_MODE = env.DEMO_MODE === 'true';

/**
 * Utility to check demo mode (for readability in conditionals)
 */
export function isDemoMode(): boolean {
  return IS_DEMO_MODE;
}

/**
 * Log demo mode action (helps with debugging)
 */
export function logDemoAction(action: string, details?: any) {
  if (IS_DEMO_MODE) {
    console.log(`[DEMO MODE] ${action}`, details || '');
  }
}
