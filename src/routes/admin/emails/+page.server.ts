import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { sendEmail } from '$lib/email/send';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import { renderTemplate, type EmailTemplate} from '$lib/email/editor';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Helper to get staff account ID from session email
 */
async function getStaffIdFromSession(email: string): Promise<string | null> {
  const { data } = await supabase
    .from('staff_accounts')
    .select('id')
    .eq('email', email)
    .single();

  return data?.id || null;
}

export const load: PageServerLoad = async () => {
  // Get only active templates for the main view
  // Include blocks_json for Block Editor support
  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, slug, version, subject, html_body, blocks_json, variables_schema, is_active, is_system, created_at, created_by')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return {
    templates: (templates || []).map(t => ({
      ...t,
      // Ensure these fields are included
      is_system: t.is_system ?? false,
      variables_schema: t.variables_schema ?? {},
      blocks_json: t.blocks_json ?? null
    }))
  };
};

export const actions: Actions = {
  updateTemplate: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const id = formData.get('id') as string;
    const subject = formData.get('subject') as string;
    const htmlBody = formData.get('htmlBody') as string;
    const variables = formData.get('variables') as string;
    const blocksJson = formData.get('blocksJson') as string | null;

    if (!id || !subject || !htmlBody) {
      return fail(400, { error: 'Missing required fields' });
    }

    try {
      // Get the current template to find its slug and other metadata
      const { data: currentTemplate, error: fetchError } = await supabase
        .from('email_templates')
        .select('slug, is_system, variables_schema, blocks_json')
        .eq('id', id)
        .single();

      if (fetchError || !currentTemplate) {
        console.error('[Admin] Error fetching current template:', fetchError);
        return fail(404, { error: 'Template not found' });
      }

      // Get the max version for this slug
      const { data: maxVersionData, error: maxVersionError } = await supabase
        .from('email_templates')
        .select('version')
        .eq('slug', currentTemplate.slug)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (maxVersionError) {
        console.error('[Admin] Error getting max version:', maxVersionError);
        return fail(500, { error: 'Failed to determine version' });
      }

      const newVersion = (maxVersionData?.version || 0) + 1;
      const staffId = await getStaffIdFromSession(session.email);

      // If blocksJson is provided, regenerate HTML from blocks
      let finalHtmlBody = htmlBody;
      if (blocksJson) {
        try {
          const templateData = JSON.parse(blocksJson) as EmailTemplate;
          // Render HTML from blocks using empty data (keeps {{variables}} intact)
          const rendered = renderTemplate(templateData, {});
          finalHtmlBody = rendered.html;
        } catch (e) {
          console.error('[Admin] Error rendering blocks to HTML:', e);
          // Fall back to provided htmlBody if rendering fails
        }
      }

      // Start transaction: deactivate current active version and insert new version
      // First, deactivate all active versions for this slug
      const { error: deactivateError } = await supabase
        .from('email_templates')
        .update({ is_active: false })
        .eq('slug', currentTemplate.slug)
        .eq('is_active', true);

      if (deactivateError) {
        console.error('[Admin] Error deactivating current version:', deactivateError);
        return fail(500, { error: 'Failed to deactivate current version' });
      }

      // Insert new version with is_active = true
      // If blocksJson is provided, store it; otherwise preserve existing blocks_json
      const { error: insertError } = await supabase
        .from('email_templates')
        .insert({
          slug: currentTemplate.slug,
          version: newVersion,
          subject,
          html_body: finalHtmlBody,
          blocks_json: blocksJson || currentTemplate.blocks_json || null,
          variables_schema: variables ? JSON.parse(variables) : currentTemplate.variables_schema,
          is_active: true,
          is_system: currentTemplate.is_system,
          created_by: staffId
        });

      if (insertError) {
        console.error('[Admin] Error inserting new version:', insertError);
        return fail(500, { error: 'Failed to create new version' });
      }

      return { success: true, version: newVersion };
    } catch (error) {
      console.error('[Admin] Error in updateTemplate transaction:', error);
      return fail(500, { error: 'Failed to update template' });
    }
  },

  getTemplateVersions: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const slug = formData.get('slug') as string;

    if (!slug) {
      return fail(400, { error: 'Missing slug' });
    }

    const { data: versions, error } = await supabase
      .from('email_templates')
      .select('id, version, subject, is_active, created_at, created_by')
      .eq('slug', slug)
      .order('version', { ascending: false });

    if (error) {
      console.error('[Admin] Error fetching template versions:', error);
      return fail(500, { error: 'Failed to fetch versions' });
    }

    return { versions: versions || [] };
  },

  revertToVersion: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const slug = formData.get('slug') as string;
    const targetVersion = parseInt(formData.get('targetVersion') as string);

    if (!slug || isNaN(targetVersion)) {
      return fail(400, { error: 'Missing or invalid parameters' });
    }

    try {
      // Check if target version exists
      const { data: targetTemplate, error: fetchError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('slug', slug)
        .eq('version', targetVersion)
        .single();

      if (fetchError || !targetTemplate) {
        console.error('[Admin] Target version not found:', fetchError);
        return fail(404, { error: 'Target version not found' });
      }

      // Check if target version is already active
      if (targetTemplate.is_active) {
        return { success: true, message: 'Version is already active', alreadyActive: true };
      }

      // Deactivate all versions for this slug
      const { error: deactivateError } = await supabase
        .from('email_templates')
        .update({ is_active: false })
        .eq('slug', slug)
        .eq('is_active', true);

      if (deactivateError) {
        console.error('[Admin] Error deactivating current version:', deactivateError);
        return fail(500, { error: 'Failed to deactivate current version' });
      }

      // Activate the target version
      const { error: activateError } = await supabase
        .from('email_templates')
        .update({ is_active: true })
        .eq('id', targetTemplate.id);

      if (activateError) {
        console.error('[Admin] Error activating target version:', activateError);
        return fail(500, { error: 'Failed to activate target version' });
      }

      return { success: true, revertedToVersion: targetVersion };
    } catch (error) {
      console.error('[Admin] Error in revertToVersion:', error);
      return fail(500, { error: 'Failed to revert to version' });
    }
  },

  sendTest: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const email = formData.get('email') as string;
    const subject = formData.get('subject') as string;
    const htmlBody = formData.get('htmlBody') as string;

    if (!email || !subject || !htmlBody) {
      return fail(400, { error: 'Missing required fields' });
    }

    // Sample values for common template variables
    const sampleVariables: Record<string, string> = {
      customer_name: 'Jane Doe',
      service_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // 1x1 placeholder
      amount_due: '$29.99',
      update_payment_url: 'https://example.com/update-payment',
      telegram_handle: '@FrontierMealsBot',
      deep_link: 'https://t.me/FrontierMealsBot?start=test123',
      email: email,
      magic_link: 'https://example.com/auth/verify?token=sample-token',
      message: 'This is a sample notification message for testing purposes.'
    };

    // Replace {{variable}} placeholders with sample values
    const fillVariables = (text: string): string => {
      return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmed = varName.trim();
        return sampleVariables[trimmed] ?? match;
      });
    };

    try {
      await sendEmail({
        to: email,
        subject: `[TEST] ${fillVariables(subject)}`,
        html: fillVariables(htmlBody),
        tags: [{ name: 'category', value: 'test_email' }]
      });

      return { testSent: true };
    } catch (error) {
      console.error('[Admin] Error sending test email:', error);
      return fail(500, { error: 'Failed to send test email' });
    }
  },

  deleteTemplate: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Missing template ID' });
    }

    // Check if this is a system template
    const { data: template } = await supabase
      .from('email_templates')
      .select('is_system, slug')
      .eq('id', id)
      .single();

    if (template?.is_system) {
      return fail(400, { error: 'System templates cannot be deleted' });
    }

    // Delete all versions of this template (by slug)
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('slug', template?.slug);

    if (error) {
      console.error('[Admin] Error deleting template:', error);
      return fail(500, { error: 'Failed to delete template' });
    }

    return { deleted: true };
  },

  restoreOriginal: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const slug = formData.get('slug') as string;

    if (!slug) {
      return fail(400, { error: 'Missing template slug' });
    }

    // Template mapping: slug → code template function
    const CODE_TEMPLATES: Record<string, () => Promise<any>> = {
      'qr-daily': () => import('$lib/email/templates/qr-daily').then(m => m.getQRDailyEmail),
      'dunning-soft': () => import('$lib/email/templates/dunning').then(m => m.getDunningSoftEmail),
      'dunning-retry': () => import('$lib/email/templates/dunning').then(m => m.getDunningRetryEmail),
      'dunning-final': () => import('$lib/email/templates/dunning').then(m => m.getDunningFinalEmail),
      'dunning-canceled': () => import('$lib/email/templates/dunning').then(m => m.getCanceledNoticeEmail),
      'telegram-link': () => import('$lib/email/templates/telegram-link').then(m => m.getTelegramLinkEmail),
      'admin-magic-link': () => import('$lib/email/templates/admin-magic-link').then(m => m.getAdminMagicLinkEmail),
      'schedule-change': () => import('$lib/email/templates/schedule-change').then(m => m.getScheduleChangeEmail),
    };

    if (!CODE_TEMPLATES[slug]) {
      return fail(400, { error: 'Unknown system template' });
    }

    try {
      // Load the template function
      const templateFn = await CODE_TEMPLATES[slug]();

      // Call with placeholder variables depending on the template
      let result: { subject: string; html: string };

      switch (slug) {
        case 'qr-daily':
          result = templateFn({
            customer_name: '{{customer_name}}',
            service_date: '2026-01-27',
            qr_code_base64: '{{qr_code_base64}}'
          });
          break;

        case 'dunning-soft':
          result = templateFn({
            customer_name: '{{customer_name}}',
            amount_due: '{{amount_due}}',
            update_payment_url: '{{update_payment_url}}'
          });
          break;

        case 'dunning-retry':
          result = templateFn({
            customer_name: '{{customer_name}}',
            update_payment_url: '{{update_payment_url}}'
          });
          break;

        case 'dunning-final':
          result = templateFn({
            customer_name: '{{customer_name}}',
            amount_due: '{{amount_due}}',
            update_payment_url: '{{update_payment_url}}'
          });
          break;

        case 'dunning-canceled':
          result = templateFn({
            customer_name: '{{customer_name}}'
          });
          break;

        case 'telegram-link':
          result = templateFn({
            customer_name: '{{customer_name}}',
            telegram_handle: '{{telegram_handle}}',
            deep_link: '{{deep_link}}'
          });
          break;

        case 'admin-magic-link':
          result = templateFn({
            email: '{{email}}',
            magic_link: '{{magic_link}}'
          });
          break;

        case 'schedule-change':
          result = templateFn({
            customer_name: '{{customer_name}}',
            message: '{{message}}',
            change_type: 'holiday',
            change_action: 'added',
            affected_dates: ['2026-01-27'],
            effective_date: '2026-01-27'
          });
          break;

        default:
          return fail(400, { error: 'Template function not found' });
      }

      // Get the current max version to increment
      const { data: maxVersionData } = await supabase
        .from('email_templates')
        .select('version')
        .eq('slug', slug)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      const newVersion = (maxVersionData?.version || 0) + 1;
      const staffId = await getStaffIdFromSession(session.email);

      // Deactivate current version
      await supabase
        .from('email_templates')
        .update({ is_active: false })
        .eq('slug', slug)
        .eq('is_active', true);

      // Insert new version with original HTML
      const { error } = await supabase
        .from('email_templates')
        .insert({
          slug,
          version: newVersion,
          subject: result.subject,
          html_body: result.html,
          is_system: true,
          is_active: true,
          created_by: staffId
        });

      if (error) {
        console.error('[Admin] Error restoring template:', error);
        return fail(500, { error: 'Failed to restore template' });
      }

      return { restored: true };
    } catch (error) {
      console.error('[Admin] Error loading template function:', error);
      return fail(500, { error: 'Failed to load original template' });
    }
  }
};
