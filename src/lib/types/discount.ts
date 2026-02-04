/**
 * Discount Code System Type Definitions
 *
 * Design Principles:
 * - Translation layer pattern: Admins work with business entities, not PayPal Plan IDs
 * - Reservation system: Prevents race conditions on limited-use codes
 * - User-centric types: Every error provides a forward path
 * - Type safety: Ensures compatibility with Supabase-generated types
 *
 * Type Architecture:
 * 1. SubscriptionPlan - Translation layer entity mapping business names to PayPal Plan IDs
 * 2. DiscountCode - Promotional codes with structured discount data
 * 3. DiscountReservation - Temporary holds during checkout flow (15min TTL)
 * 4. DiscountRedemption - Permanent record of successful redemptions
 * 5. DiscountStatus - Status enum for admin UI color-coding
 * 6. DiscountValidationResult - API response type for /api/discount/reserve
 */

// ============================================================================
// SUBSCRIPTION PLAN - Translation Layer Entity
// ============================================================================

/**
 * SubscriptionPlan - Translation layer mapping business entities to PayPal Plan IDs
 *
 * Purpose: Admins never see technical PayPal Plan IDs, only business-friendly names.
 * Example: "Premium - Monthly ($29/mo)" maps to "P-5ML4271244454362WXNWU5NQ"
 *
 * This separation enables:
 * - Non-technical admins to create discount codes
 * - Changing PayPal plans without breaking discount codes
 * - Displaying human-readable plan info in admin UI
 */
export interface SubscriptionPlan {
	/** Unique identifier (UUID from database) */
	id: string;

	/** Business-facing plan name shown to admins (e.g., "Premium - Monthly ($29/mo)") */
	business_name: string;

	/** Optional description for admin reference (e.g., "Our most popular plan") */
	description: string | null;

	/** Plan price amount in decimal format */
	price_amount: number;

	/** Currency code (default: USD) */
	price_currency: string;

	/** Billing cycle period */
	billing_cycle: 'monthly' | 'annual';

	/** PayPal Plan ID for LIVE environment - e.g., "P-5ML4271244454362WXNWU5NQ" */
	paypal_plan_id_live: string;

	/** PayPal Plan ID for SANDBOX environment (nullable if not testing this plan) */
	paypal_plan_id_sandbox: string | null;

	/** Monthly price during trial period (can be 0 for free trial). NULL if no trial. */
	trial_price_amount: number | null;

	/** Number of months the trial lasts. NULL if no trial. */
	trial_duration_months: number | null;

	/** Whether this is the default plan when no discount code is used */
	is_default: boolean;

	/** Whether this plan is currently active */
	is_active: boolean;

	/** Sort order for display in admin UI */
	sort_order: number;

	/** When this plan was created */
	created_at?: string;

	/** When this plan was last updated */
	updated_at?: string;
}

// ============================================================================
// DISCOUNT CODE - Promotional Code Entity
// ============================================================================

/**
 * DiscountCode - Promotional code that unlocks specific subscription plans
 *
 * Key Features:
 * - Structured discount data (not human-readable text)
 * - Usage limits (global and per-customer)
 * - Validity windows (valid_from, valid_until)
 * - Reservation system (reserved_uses prevents race conditions)
 * - Grace period on deactivation (honors in-flight checkouts)
 *
 * Discount Types:
 * - percentage: X% off (e.g., 50% off first month)
 * - fixed_amount: $X off (e.g., $10 off first month)
 * - free_trial: X months free (e.g., 1 month free trial)
 */
export interface DiscountCode {
	/** Unique identifier (UUID from database) */
	id: string;

	/** Discount code (uppercase, unique) - e.g., "SUMMER50" */
	code: string;

	/** Foreign key to subscription_plans table */
	plan_id: string;

	/** Optional joined plan data (includes price for delta calculation) */
	plan?: SubscriptionPlan;

	/** Admin-facing notes (e.g., "Summer 2025 campaign for gym partners") */
	admin_notes: string | null;

	/** Maximum total uses (null = unlimited) */
	max_uses: number | null;

	/** Current number of completed redemptions */
	current_uses: number;

	/** Number of active reservations (in-flight checkouts) */
	reserved_uses: number;

	/** Maximum uses per customer (default: 1) */
	max_uses_per_customer: number;

	/** Code becomes valid at this timestamp (null = valid immediately) */
	valid_from: string | null;

	/** Code expires at this timestamp (null = no expiration) */
	valid_until: string | null;

	/** Whether this code is currently active */
	is_active: boolean;

	/** When admin deactivated this code (null if never deactivated) */
	deactivated_at: string | null;

	/** Minutes to honor code after deactivation (default: 30) */
	grace_period_minutes: number;

	/** Admin user who created this code */
	created_by: string | null;

	/** When this code was created */
	created_at: string;

	/** When this code was last updated */
	updated_at: string;
}

// ============================================================================
// DISCOUNT RESERVATION - Temporary Hold During Checkout
// ============================================================================

/**
 * DiscountReservation - Temporary hold on a discount code slot
 *
 * Purpose: Prevents race conditions on limited-use codes during checkout flow.
 *
 * Flow:
 * 1. User validates code → reservation created (15min TTL)
 * 2. User completes PayPal checkout
 * 3. Webhook converts reservation → redemption
 * 4. Cron job cleans up expired unredeemed reservations
 *
 * This ensures limited-use codes (e.g., "first 50 customers") work correctly
 * even with concurrent checkouts.
 */
export interface DiscountReservation {
	/** Unique identifier (UUID from database) */
	id: string;

	/** Foreign key to discount_codes table */
	discount_code_id: string;

	/** Customer email from checkout form */
	customer_email: string;

	/** Reservation expires at this timestamp (created_at + 15 minutes) */
	expires_at: string;

	/** When reservation was converted to redemption (null if still pending) */
	redeemed_at: string | null;

	/** When this reservation was created */
	created_at: string;
}

// ============================================================================
// DISCOUNT REDEMPTION - Permanent Record
// ============================================================================

/**
 * DiscountRedemption - Permanent record of successful code redemption
 *
 * Purpose: Track who used which codes and when, with idempotency protection.
 *
 * Key Features:
 * - paypal_subscription_id is unique (prevents duplicate webhook processing)
 * - Links to customer record for per-customer usage limits
 * - Links to reservation record for audit trail
 * - Used for analytics and redemption reporting
 */
export interface DiscountRedemption {
	/** Unique identifier (UUID from database) */
	id: string;

	/** Foreign key to discount_codes table */
	discount_code_id: string;

	/** Foreign key to customers table */
	customer_id: string;

	/** Foreign key to discount_code_reservations table (null for legacy redemptions) */
	reservation_id: string | null;

	/** PayPal subscription ID (unique, used for idempotency) */
	paypal_subscription_id: string;

	/** When this code was redeemed */
	redeemed_at: string;
}

// ============================================================================
// DISCOUNT STATUS - Admin UI Status Enum
// ============================================================================

/**
 * DiscountStatus - Status indicator for admin UI color-coding
 *
 * Status Logic:
 * - active: 🟢 is_active AND current_uses < max_uses AND valid_until > NOW()
 * - unused: 🟡 Active but current_uses = 0 (potential issue - created but not distributed?)
 * - exhausted: 🔴 current_uses >= max_uses
 * - expired: 🔴 valid_until < NOW()
 * - inactive: ⚫ Admin deactivated (is_active = false)
 * - error: ⚫ Referenced plan no longer exists
 */
export type DiscountStatus =
	| 'active'
	| 'unused'
	| 'exhausted'
	| 'expired'
	| 'inactive'
	| 'error';

// ============================================================================
// DISCOUNT VALIDATION RESULT - API Response Type
// ============================================================================

/**
 * DiscountValidationResult - Response from POST /api/discount/reserve
 *
 * Success Case:
 * - success: true
 * - reservation_id: UUID to pass to PayPal checkout
 * - plan: Discounted plan details (price already reflects discount)
 * - original_price: Default plan price (for strikethrough display)
 * - savings: Amount saved (calculated as original_price - plan.price)
 * - savings_percent: Percentage saved
 *
 * Error Cases:
 * - success: false
 * - error.code: Machine-readable error code
 * - error.message: User-facing error message
 * - error.suggestion: Optional typo suggestion
 * - error.expires_at: Optional expiration date (for EXPIRED errors)
 */
export interface DiscountValidationResult {
	/** Whether validation succeeded */
	success: boolean;

	/** Reservation ID to pass to PayPal checkout (only if success=true) */
	reservation_id?: string;

	/** Discounted plan details (only if success=true) */
	plan?: {
		/** Plan UUID */
		id: string;

		/** Business-facing plan name (e.g., "Premium Monthly - 50% off") */
		name: string;

		/** Discounted plan price (what customer pays) */
		price: number;

		/** Billing cycle */
		billing_cycle: string;

		/** Trial price if plan has trial period (null if no trial) */
		trial_price?: number | null;

		/** Trial duration in months if plan has trial period (null if no trial) */
		trial_duration_months?: number | null;
	};

	/** Default plan price for strikethrough display (only if success=true) */
	original_price?: number;

	/** Amount saved: original_price - plan.price (only if success=true) */
	savings?: number;

	/** Percentage saved (only if success=true) */
	savings_percent?: number;

	/** Error details (only if success=false) */
	error?: {
		/** Machine-readable error code */
		code:
			| 'INVALID_CODE'
			| 'EXPIRED'
			| 'MAX_USES'
			| 'ALREADY_USED'
			| 'INACTIVE'
			| 'NOT_YET_VALID'
			| 'PLAN_UNAVAILABLE'
			| 'RESERVATION_EXISTS'
			| 'INVALID_REQUEST'
			| 'DATABASE_ERROR'
			| 'INTERNAL_ERROR';

		/** User-facing error message */
		message: string;

		/** Optional typo suggestion (e.g., "Did you mean 'WELCOME50'?") */
		suggestion?: string;

		/** Optional expiration date for EXPIRED errors */
		expires_at?: string;
	};
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Admin discount list item - Extended discount code with computed fields
 *
 * Used by GET /api/admin/discounts endpoint
 */
export interface AdminDiscountListItem extends DiscountCode {
	/** Computed status for color-coding */
	status: DiscountStatus;

	/** Computed savings (default_plan.price - plan.price) */
	savings?: number;

	/** Usage summary object */
	usage: {
		/** Current completed redemptions */
		current: number;

		/** Active reservations */
		reserved: number;

		/** Maximum total uses (null = unlimited) */
		max: number | null;

		/** Percentage used (for progress bars) */
		percentage: number;
	};
}

/**
 * Discount code form data - Input for create/edit forms
 *
 * Used by admin UI forms (simplified - discount is implicit from plan price delta)
 */
export interface DiscountCodeFormData {
	/** Code string (will be uppercased) */
	code: string;

	/** Plan UUID (discount is implicit from price delta vs default plan) */
	plan_id: string;

	/** Admin notes */
	admin_notes: string | null;

	/** Max uses (null = unlimited) */
	max_uses: number | null;

	/** Max uses per customer */
	max_uses_per_customer: number;

	/** Valid from timestamp */
	valid_from: string | null;

	/** Valid until timestamp */
	valid_until: string | null;

	/** Is active */
	is_active: boolean;

	/** Grace period in minutes */
	grace_period_minutes: number;
}
