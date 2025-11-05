/**
 * Demo Mode Types
 *
 * Type definitions for demo mode mock data and responses
 */

export interface DemoCustomer {
  id: string;
  name: string;
  email: string;
  dietary_flags: {
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
    dairy_free?: boolean;
    nut_allergy?: boolean;
  };
  phone?: string;
}

export interface DemoRedemption {
  id: string;
  customer_id: string;
  service_date: string;
  redeemed_at: string;
  kiosk_id: string;
  kiosk_location: string;
}

export interface DemoAdminSession {
  sessionId: string;
  email: string;
  role: 'admin';
  createdAt: string;
  expiresAt: string;
}

export interface DemoKioskSession {
  valid: boolean;
  kiosk_id: string;
  location: string;
}

export interface DemoRedemptionResult {
  success: boolean;
  error_code?: string;
  error_message?: string;
  customer_name?: string;
  customer_dietary_flags?: Record<string, boolean>;
  redemption_id?: string;
}

export type DemoScenario = 'success' | 'already_redeemed' | 'expired' | 'invalid_customer';
