/**
 * Demo Mode - Central Export
 *
 * All demo mode functionality exported from a single entry point
 */

// Configuration
export { IS_DEMO_MODE, isDemoMode, logDemoAction } from './config';

// Types
export type {
  DemoCustomer,
  DemoRedemption,
  DemoAdminSession,
  DemoKioskSession,
  DemoRedemptionResult,
  DemoScenario
} from './types';

// Mock Data
export {
  DEMO_CUSTOMERS,
  getRandomDemoCustomer,
  getDemoCustomer,
  getMockAdminSession,
  getMockKioskSession,
  getMockRedemptionResult,
  getMockCustomerList,
  getMockEmailTemplates,
  getMockDashboardMetrics
} from './mock-data';

// Auth Bypass
export {
  bypassAdminEmailCheck,
  bypassMagicLinkGeneration,
  bypassMagicLinkVerification,
  bypassAdminSessionCreation,
  bypassAdminSessionValidation,
  bypassKioskSessionValidation,
  bypassQRTokenVerification,
  bypassMealRedemption,
  bypassCSRFValidation
} from './auth-bypass';
