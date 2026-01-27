/**
 * Email Template Variable Registry
 *
 * Perceptual Engineering Principles:
 * - Recognition over Recall: Users pick variables from a curated list, not type from memory
 * - Working Memory (4±1): Variables grouped into 4 categories matching mental models
 * - Semantic Types: Each variable has a type (string/url/date/money) with visual indicators
 * - Contextual Validation: Only show variables valid for the template being edited
 *
 * Variable Categories (4 chunks):
 * 1. Customer - Personal info from customer record
 * 2. Payment - Billing and subscription data from Stripe
 * 3. Service - Dates, QR codes, schedule information
 * 4. Actions - URLs for CTAs (buttons, links)
 */

// ============================================================================
// VARIABLE TYPE DEFINITIONS
// ============================================================================

/**
 * Variable types determine:
 * - Visual indicator (icon/color) in picker UI
 * - Validation rules for content
 * - Example value formatting
 */
export type VariableType = 'string' | 'url' | 'date' | 'money' | 'base64';

/**
 * Variable categories for chunked display (4±1 rule)
 */
export type VariableCategory = 'customer' | 'payment' | 'service' | 'actions';

/**
 * Template context - which templates can use which variables
 * Maps to the EMAIL_TEMPLATES registry slugs
 */
export type TemplateContext =
  | 'qr_daily'
  | 'telegram_link'
  | 'dunning_soft'
  | 'dunning_retry'
  | 'dunning_final'
  | 'canceled_notice'
  | 'schedule_change'
  | 'admin_magic_link'
  | 'custom'; // Custom templates can use any variable

/**
 * Complete variable definition
 */
export interface VariableDefinition {
  /** Variable name as used in templates: {{name}} */
  name: string;

  /** Human-readable label for UI display */
  label: string;

  /** Variable type for validation and visual indicators */
  type: VariableType;

  /** Category for grouped display */
  category: VariableCategory;

  /** Example value shown in preview */
  example: string;

  /** Brief description of what this variable contains */
  description: string;

  /** Which template contexts can use this variable */
  availableIn: TemplateContext[];
}

// ============================================================================
// CATEGORY METADATA
// ============================================================================

/**
 * Category display information for UI
 */
export interface CategoryMeta {
  id: VariableCategory;
  label: string;
  emoji: string;
  description: string;
}

export const VARIABLE_CATEGORIES: CategoryMeta[] = [
  {
    id: 'customer',
    label: 'Customer',
    emoji: '👤',
    description: 'Personal information from customer record'
  },
  {
    id: 'payment',
    label: 'Payment',
    emoji: '💳',
    description: 'Billing and subscription data'
  },
  {
    id: 'service',
    label: 'Service',
    emoji: '📅',
    description: 'Dates, schedule, and service information'
  },
  {
    id: 'actions',
    label: 'Actions',
    emoji: '🔗',
    description: 'URLs for buttons and links'
  }
];

/**
 * Type display information for visual indicators
 */
export interface TypeMeta {
  id: VariableType;
  label: string;
  emoji: string;
  color: string; // Tailwind color class
}

export const VARIABLE_TYPES: TypeMeta[] = [
  { id: 'string', label: 'Text', emoji: '📝', color: 'text-gray-600' },
  { id: 'url', label: 'URL', emoji: '🔗', color: 'text-blue-600' },
  { id: 'date', label: 'Date', emoji: '📅', color: 'text-purple-600' },
  { id: 'money', label: 'Money', emoji: '💵', color: 'text-green-600' },
  { id: 'base64', label: 'Image', emoji: '🖼️', color: 'text-amber-600' }
];

// ============================================================================
// VARIABLE REGISTRY
// ============================================================================

/**
 * Complete registry of all available template variables
 *
 * Derived from analysis of:
 * - Database models (customers, subscriptions, qr_tokens, etc.)
 * - Existing email templates in src/lib/email/templates/
 * - Stripe webhook data (invoices, subscriptions)
 * - Generated tokens (deep links, magic links)
 */
export const VARIABLE_REGISTRY: VariableDefinition[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // CUSTOMER CATEGORY
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'customer_name',
    label: 'Customer Name',
    type: 'string',
    category: 'customer',
    example: 'Sarah Chen',
    description: 'Full name from customer record',
    availableIn: [
      'qr_daily',
      'telegram_link',
      'dunning_soft',
      'dunning_retry',
      'dunning_final',
      'canceled_notice',
      'schedule_change',
      'custom'
    ]
  },
  {
    name: 'customer_email',
    label: 'Customer Email',
    type: 'string',
    category: 'customer',
    example: 'sarah@example.com',
    description: 'Email address from customer record',
    availableIn: ['custom']
  },
  {
    name: 'telegram_handle',
    label: 'Telegram Handle',
    type: 'string',
    category: 'customer',
    example: '@sarahchen',
    description: 'Telegram username (or "Not provided")',
    availableIn: ['telegram_link', 'custom']
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PAYMENT CATEGORY
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'amount_due',
    label: 'Amount Due',
    type: 'money',
    category: 'payment',
    example: '$15.00',
    description: 'Outstanding invoice amount (formatted)',
    availableIn: ['dunning_soft', 'dunning_final', 'custom']
  },

  // ──────────────────────────────────────────────────────────────────────────
  // SERVICE CATEGORY
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'service_date',
    label: 'Service Date',
    type: 'date',
    category: 'service',
    example: '2025-01-20',
    description: 'Date of service (YYYY-MM-DD format)',
    availableIn: ['qr_daily', 'custom']
  },
  {
    name: 'day_name',
    label: 'Day Name',
    type: 'string',
    category: 'service',
    example: 'Monday',
    description: 'Day of week for service date',
    availableIn: ['qr_daily', 'custom']
  },
  {
    name: 'date_formatted',
    label: 'Formatted Date',
    type: 'string',
    category: 'service',
    example: 'January 20, 2025',
    description: 'Human-readable date format',
    availableIn: ['qr_daily', 'schedule_change', 'custom']
  },
  {
    name: 'qr_code_base64',
    label: 'QR Code Image',
    type: 'base64',
    category: 'service',
    example: '[QR Code]',
    description: 'Base64-encoded QR code image (use with Image block)',
    availableIn: ['qr_daily', 'custom']
  },
  {
    name: 'affected_dates',
    label: 'Affected Dates',
    type: 'string',
    category: 'service',
    example: 'Mon Jan 20, Wed Jan 22',
    description: 'List of dates affected by schedule change',
    availableIn: ['schedule_change', 'custom']
  },
  {
    name: 'effective_date',
    label: 'Effective Date',
    type: 'date',
    category: 'service',
    example: 'January 15, 2025',
    description: 'When schedule change takes effect',
    availableIn: ['schedule_change', 'custom']
  },
  {
    name: 'change_message',
    label: 'Change Message',
    type: 'string',
    category: 'service',
    example: 'We will be closed for the holiday.',
    description: 'Admin-written message about schedule change',
    availableIn: ['schedule_change', 'custom']
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIONS CATEGORY (URLs)
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'update_payment_url',
    label: 'Update Payment URL',
    type: 'url',
    category: 'actions',
    example: 'https://billing.stripe.com/p/session/...',
    description: 'Stripe customer portal link to update payment method',
    availableIn: ['dunning_soft', 'dunning_retry', 'dunning_final', 'custom']
  },
  {
    name: 'deep_link',
    label: 'Telegram Deep Link',
    type: 'url',
    category: 'actions',
    example: 'https://t.me/FrontierMealsBot?start=abc123',
    description: 'One-time link to connect Telegram account',
    availableIn: ['telegram_link', 'custom']
  },
  {
    name: 'magic_link',
    label: 'Magic Link',
    type: 'url',
    category: 'actions',
    example: 'https://frontiermeals.com/admin/auth/verify?token=...',
    description: 'One-time login link for admin authentication',
    availableIn: ['admin_magic_link', 'custom']
  },
  {
    name: 'support_url',
    label: 'Support URL',
    type: 'url',
    category: 'actions',
    example: 'https://t.me/FrontierMealsBot',
    description: 'Link to customer support (Telegram bot)',
    availableIn: [
      'qr_daily',
      'telegram_link',
      'dunning_soft',
      'dunning_retry',
      'dunning_final',
      'canceled_notice',
      'schedule_change',
      'custom'
    ]
  }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get variables available for a specific template context
 */
export function getVariablesForContext(context: TemplateContext): VariableDefinition[] {
  return VARIABLE_REGISTRY.filter((v) => v.availableIn.includes(context));
}

/**
 * Get variables grouped by category for a specific template context
 */
export function getVariablesByCategory(
  context: TemplateContext
): Map<VariableCategory, VariableDefinition[]> {
  const available = getVariablesForContext(context);
  const grouped = new Map<VariableCategory, VariableDefinition[]>();

  for (const category of VARIABLE_CATEGORIES) {
    const vars = available.filter((v) => v.category === category.id);
    if (vars.length > 0) {
      grouped.set(category.id, vars);
    }
  }

  return grouped;
}

/**
 * Validate that a variable name exists in the registry
 */
export function isValidVariable(name: string, context: TemplateContext = 'custom'): boolean {
  const available = getVariablesForContext(context);
  return available.some((v) => v.name === name);
}

/**
 * Get variable definition by name
 */
export function getVariable(name: string): VariableDefinition | undefined {
  return VARIABLE_REGISTRY.find((v) => v.name === name);
}

/**
 * Get category metadata by ID
 */
export function getCategoryMeta(id: VariableCategory): CategoryMeta | undefined {
  return VARIABLE_CATEGORIES.find((c) => c.id === id);
}

/**
 * Get type metadata by ID
 */
export function getTypeMeta(id: VariableType): TypeMeta | undefined {
  return VARIABLE_TYPES.find((t) => t.id === id);
}

/**
 * Extract all variable references from text content
 * Returns array of variable names (without braces)
 */
export function extractVariables(text: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!vars.includes(match[1])) {
      vars.push(match[1]);
    }
  }
  return vars;
}

/**
 * Validate all variables in text are defined for the given context
 * Returns array of invalid variable names
 */
export function validateVariables(text: string, context: TemplateContext = 'custom'): string[] {
  const used = extractVariables(text);
  return used.filter((name) => !isValidVariable(name, context));
}

/**
 * Get example values for all variables in a context
 * Returns Record<variableName, exampleValue>
 */
export function getExampleValues(context: TemplateContext): Record<string, string> {
  const available = getVariablesForContext(context);
  const examples: Record<string, string> = {};
  for (const v of available) {
    examples[v.name] = v.example;
  }
  return examples;
}
