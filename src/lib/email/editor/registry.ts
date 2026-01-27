/**
 * Email Template Registry
 *
 * Central registry of all email templates in the system.
 * Provides metadata and source loading for the email editor.
 */

import type { TemplateVariable } from './types';

/**
 * Template metadata for registry
 */
export interface TemplateInfo {
  slug: string;
  name: string;
  description?: string;
  colorScheme: string;
  variables: string[];
}

/**
 * Template module type
 */
interface TemplateModule {
  [key: string]: any;
}

/**
 * Registry entry
 */
interface TemplateEntry {
  slug: string;
  name: string;
  description?: string;
  module: () => Promise<TemplateModule>;
}

/**
 * All registered email templates
 */
export const EMAIL_TEMPLATES: TemplateEntry[] = [
  {
    slug: 'qr_daily',
    name: 'Daily QR Code',
    description: 'Daily QR code email sent to active customers at 12 PM PT',
    module: () => import('../templates/qr-daily'),
  },
  {
    slug: 'telegram_link',
    name: 'Telegram Welcome',
    description: 'Onboarding email with Telegram bot connection link',
    module: () => import('../templates/telegram-link'),
  },
  {
    slug: 'dunning_soft',
    name: 'Payment Issue (Soft)',
    description: 'First payment failure notice',
    module: () => import('../templates/dunning'),
  },
  {
    slug: 'dunning_retry',
    name: 'Payment Reminder',
    description: 'Second payment failure notice',
    module: () => import('../templates/dunning'),
  },
  {
    slug: 'dunning_final',
    name: 'Payment Final Notice',
    description: 'Final payment failure notice before cancellation',
    module: () => import('../templates/dunning'),
  },
  {
    slug: 'canceled_notice',
    name: 'Subscription Canceled',
    description: 'Confirmation of subscription cancellation',
    module: () => import('../templates/dunning'),
  },
  {
    slug: 'schedule_change',
    name: 'Schedule Change Notification',
    description: 'Notification sent when service schedule is modified',
    module: () => import('../templates/schedule-change'),
  },
  {
    slug: 'admin_magic_link',
    name: 'Admin Login Link',
    description: 'Magic link for admin authentication',
    module: () => import('../templates/admin-magic-link'),
  },
];

/**
 * Get template metadata by slug
 */
export function getTemplateInfo(slug: string): TemplateInfo | null {
  const entry = EMAIL_TEMPLATES.find(t => t.slug === slug);
  if (!entry) return null;

  return {
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    colorScheme: 'orange', // Default - would need to analyze source to get actual
    variables: [], // Would need to parse source
  };
}

/**
 * Get template module and extract metadata
 */
export async function loadTemplateMetadata(slug: string): Promise<TemplateInfo | null> {
  const entry = EMAIL_TEMPLATES.find(t => t.slug === slug);
  if (!entry) return null;

  try {
    // Load the module
    const module = await entry.module();

    // Extract function name from slug
    const functionName = getFunctionName(slug);
    const templateFunction = module[functionName];

    if (!templateFunction) {
      console.error(`Function ${functionName} not found in module for ${slug}`);
      return null;
    }

    // Get function source to analyze it
    const functionSource = templateFunction.toString();

    // Extract color scheme
    const colorSchemeMatch = functionSource.match(/brandColors\.(\w+)/);
    const colorScheme = colorSchemeMatch?.[1] || 'orange';

    // Extract variables from function signature
    const signatureMatch = functionSource.match(/\(data:\s*\{([^}]+)\}\)/);
    const variables: string[] = [];
    if (signatureMatch) {
      const fields = signatureMatch[1].split(';').map(f => f.trim());
      for (const field of fields) {
        const match = field.match(/(\w+):/);
        if (match) variables.push(match[1]);
      }
    }

    return {
      slug,
      name: entry.name,
      description: entry.description,
      colorScheme,
      variables,
    };
  } catch (error) {
    console.error(`Failed to load metadata for ${slug}:`, error);
    return null;
  }
}

/**
 * Convert slug to function name
 */
function getFunctionName(slug: string): string {
  const functionMap: Record<string, string> = {
    'qr_daily': 'getQRDailyEmail',
    'telegram_link': 'getTelegramLinkEmail',
    'dunning_soft': 'getDunningSoftEmail',
    'dunning_retry': 'getDunningRetryEmail',
    'dunning_final': 'getDunningFinalEmail',
    'canceled_notice': 'getCanceledNoticeEmail',
    'schedule_change': 'getScheduleChangeEmail',
    'admin_magic_link': 'getAdminMagicLinkEmail',
  };

  return functionMap[slug] || `get${toPascalCase(slug)}Email`;
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * List all templates with basic metadata
 */
export function listTemplates(): Array<{ slug: string; name: string; description?: string }> {
  return EMAIL_TEMPLATES.map(t => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
  }));
}
