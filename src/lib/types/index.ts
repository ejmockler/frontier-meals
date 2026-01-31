/**
 * Central Type Exports
 *
 * This file provides a single entry point for all shared TypeScript types
 * used across the application.
 */

// ============================================================================
// DISCOUNT CODE SYSTEM TYPES
// ============================================================================

export type {
	// Core entities
	SubscriptionPlan,
	DiscountCode,
	DiscountReservation,
	DiscountRedemption,
	// Status and validation
	DiscountStatus,
	DiscountValidationResult,
	// Helper types
	DiscountDisplayParams,
	AdminDiscountListItem,
	DiscountCodeFormData
} from './discount';
