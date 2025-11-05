import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { sendEmail } from '$lib/email/send';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';
import { IS_DEMO_MODE, getMockEmailTemplates, logDemoAction } from '$lib/demo';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async () => {
  // Demo mode: return mock email templates
  if (IS_DEMO_MODE) {
    logDemoAction('Loading email templates (demo)');
    return { templates: getMockEmailTemplates() };
  }

  const { data: templates } = await supabase
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: false });

  return { templates: templates || [] };
};

export const actions: Actions = {
  createTemplate: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Demo mode: simulate success without database writes
    if (IS_DEMO_MODE) {
      const slug = formData.get('slug') as string;
      logDemoAction('Create email template (demo)', { slug });
      return { success: true };
    }

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const slug = formData.get('slug') as string;
    const subject = formData.get('subject') as string;
    const htmlBody = formData.get('htmlBody') as string;
    const variables = formData.get('variables') as string;

    if (!slug || !subject || !htmlBody) {
      return fail(400, { error: 'Missing required fields' });
    }

    const { error } = await supabase
      .from('email_templates')
      .insert({
        slug,
        subject,
        html_body: htmlBody,
        variables: variables ? JSON.parse(variables) : null
      });

    if (error) {
      console.error('[Admin] Error creating template:', error);
      return fail(500, { error: 'Failed to create template' });
    }

    return { success: true };
  },

  updateTemplate: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Demo mode: simulate success without database writes
    if (IS_DEMO_MODE) {
      const id = formData.get('id') as string;
      logDemoAction('Update email template (demo)', { id });
      return { success: true };
    }

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const id = formData.get('id') as string;
    const subject = formData.get('subject') as string;
    const htmlBody = formData.get('htmlBody') as string;
    const variables = formData.get('variables') as string;

    if (!id || !subject || !htmlBody) {
      return fail(400, { error: 'Missing required fields' });
    }

    const { error } = await supabase
      .from('email_templates')
      .update({
        subject,
        html_body: htmlBody,
        variables: variables ? JSON.parse(variables) : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[Admin] Error updating template:', error);
      return fail(500, { error: 'Failed to update template' });
    }

    return { success: true };
  },

  sendTest: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Demo mode: simulate success without sending email
    if (IS_DEMO_MODE) {
      const email = formData.get('email') as string;
      logDemoAction('Send test email (demo)', { email });
      return { testSent: true };
    }

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const email = formData.get('email') as string;
    const subject = formData.get('subject') as string;
    const htmlBody = formData.get('htmlBody') as string;

    if (!email || !subject || !htmlBody) {
      return fail(400, { error: 'Missing required fields' });
    }

    try {
      await sendEmail({
        to: email,
        subject: `[TEST] ${subject}`,
        html: htmlBody,
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

    // Demo mode: simulate success without database writes
    if (IS_DEMO_MODE) {
      const id = formData.get('id') as string;
      logDemoAction('Delete email template (demo)', { id });
      return { deleted: true };
    }

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Missing template ID' });
    }

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Admin] Error deleting template:', error);
      return fail(500, { error: 'Failed to delete template' });
    }

    return { deleted: true };
  }
};
