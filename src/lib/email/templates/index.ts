/**
 * Template Retrieval Service
 *
 * Unified email template system that:
 * 1. Checks database first for active template
 * 2. Falls back to code-based templates
 * 3. Supports variable replacement with {{var}} syntax
 * 4. Caches templates briefly to reduce DB hits
 * 5. Logs template source for debugging
 */

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { getQRDailyEmail } from './qr-daily';
import { getTelegramLinkEmail } from './telegram-link';
import { getTelegramCorrectionEmail } from './telegram-correction';
import { getDunningSoftEmail, getDunningRetryEmail, getDunningFinalEmail, getCanceledNoticeEmail, getSubscriptionSuspendedEmail, getSubscriptionReactivatedEmail, getSubscriptionExpiredEmail, getSubscriptionChargebackEmail, getSubscriptionPaymentRecoveredEmail } from './dunning';
import { getAdminMagicLinkEmail } from './admin-magic-link';
import { getScheduleChangeEmail, type ScheduleChangeEmailData } from './schedule-change';

// Template cache with TTL (5 minutes)
interface CachedTemplate {
  subject: string;
  html: string;
  variables: string[];
  fromDb: boolean;
  cachedAt: number;
}

const templateCache = new Map<string, CachedTemplate>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map of slug to code template function
// Each function must return { subject: string, html: string }
// Note: schedule_change has a complex data structure and is handled specially
const CODE_TEMPLATES: Record<string, (data: any) => { subject: string; html: string }> = {
  'qr_daily': getQRDailyEmail,
  'telegram_link': getTelegramLinkEmail,
  'telegram_correction': getTelegramCorrectionEmail,
  'dunning_soft': getDunningSoftEmail,
  'dunning_retry': getDunningRetryEmail,
  'dunning_final': getDunningFinalEmail,
  'canceled_notice': getCanceledNoticeEmail,
  'subscription_suspended': getSubscriptionSuspendedEmail,
  'subscription_reactivated': getSubscriptionReactivatedEmail,
  'subscription_expired': getSubscriptionExpiredEmail,
  'subscription_chargeback': getSubscriptionChargebackEmail,
  'subscription_payment_recovered': getSubscriptionPaymentRecoveredEmail,
  'admin_magic_link': getAdminMagicLinkEmail,
  'schedule_change': getScheduleChangeEmail,
};

/**
 * Extract variable names from template string
 * Variables are denoted as {{variable_name}}
 */
function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return matches.map(match => match.replace(/\{\{|\}\}/g, '').trim());
}

/**
 * Replace variables in template string
 * {{variable_name}} -> actual value from variables object
 */
function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmedName = varName.trim();
    if (trimmedName in variables) {
      return variables[trimmedName];
    }
    // Keep the placeholder if variable not provided
    console.warn(`[Template] Variable not provided: ${trimmedName}`);
    return match;
  });
}

/**
 * Get template from database or fall back to code
 * Returns raw template with extracted variable list
 */
export async function getTemplate(
  slug: string,
  supabaseServiceKey: string
): Promise<{
  subject: string;
  html: string;
  variables: string[];
  fromDb: boolean;
}> {
  // Check cache first
  const cached = templateCache.get(slug);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    console.log(`[Template] Cache hit for slug: ${slug}`);
    return cached;
  }

  // Initialize Supabase client
  const supabase = createClient(PUBLIC_SUPABASE_URL, supabaseServiceKey);

  // Query database for active template
  const { data: dbTemplate, error } = await supabase
    .from('email_templates')
    .select('subject, html_body, version')
    .eq('slug', slug)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  // If DB template found, use it
  if (dbTemplate && !error) {
    console.log(`[Template] Using DB template: ${slug} (version ${dbTemplate.version})`);

    const subjectVars = extractVariables(dbTemplate.subject);
    const htmlVars = extractVariables(dbTemplate.html_body);
    const allVars = Array.from(new Set([...subjectVars, ...htmlVars]));

    const result = {
      subject: dbTemplate.subject,
      html: dbTemplate.html_body,
      variables: allVars,
      fromDb: true,
      cachedAt: Date.now()
    };

    templateCache.set(slug, result);
    return result;
  }

  // Fall back to code template
  if (slug in CODE_TEMPLATES) {
    console.log(`[Template] Using code template (fallback): ${slug}`);

    // Code templates don't have variable placeholders, they use function parameters
    // We'll return empty template and let renderTemplate handle the code path
    const result = {
      subject: '',
      html: '',
      variables: [],
      fromDb: false,
      cachedAt: Date.now()
    };

    templateCache.set(slug, result);
    return result;
  }

  // No template found
  throw new Error(`Template not found: ${slug} (not in database or code templates)`);
}

/**
 * Render template with variable substitution
 * This is the main function that consumers should call
 *
 * @param slug - Template slug (e.g., 'qr_daily', 'telegram_link')
 * @param variables - Template variables (Record<string, string> for simple templates, or complex objects for special templates)
 * @param supabaseServiceKey - Supabase service role key for database access
 */
export async function renderTemplate(
  slug: string,
  variables: Record<string, any>,
  supabaseServiceKey: string
): Promise<{
  subject: string;
  html: string;
  fromDb: boolean;
}> {
  const template = await getTemplate(slug, supabaseServiceKey);

  // If it's a DB template, perform variable replacement
  if (template.fromDb) {
    console.log(`[Template] Rendering DB template: ${slug} with variables:`, Object.keys(variables));

    return {
      subject: replaceVariables(template.subject, variables),
      html: replaceVariables(template.html, variables),
      fromDb: true
    };
  }

  // Fall back to code template function
  if (slug in CODE_TEMPLATES) {
    console.log(`[Template] Rendering code template: ${slug} with variables:`, Object.keys(variables));

    try {
      const templateFunc = CODE_TEMPLATES[slug];
      const result = templateFunc(variables);

      return {
        subject: result.subject,
        html: result.html,
        fromDb: false
      };
    } catch (error) {
      console.error(`[Template] Error rendering code template ${slug}:`, error);
      throw new Error(`Failed to render code template: ${slug} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error(`Template not found: ${slug}`);
}

/**
 * Clear template cache (useful for testing or manual refresh)
 */
export function clearTemplateCache(slug?: string) {
  if (slug) {
    templateCache.delete(slug);
    console.log(`[Template] Cleared cache for: ${slug}`);
  } else {
    templateCache.clear();
    console.log('[Template] Cleared all template cache');
  }
}

/**
 * Get cache stats (useful for monitoring)
 */
export function getTemplateCacheStats() {
  const entries = Array.from(templateCache.entries()).map(([slug, cached]) => ({
    slug,
    fromDb: cached.fromDb,
    age: Math.floor((Date.now() - cached.cachedAt) / 1000),
    variables: cached.variables
  }));

  return {
    size: templateCache.size,
    entries
  };
}
