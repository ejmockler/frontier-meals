import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMagicLinkToken, isAdminEmail } from '$lib/auth/admin';
import { sendEmail } from '$lib/email/send';
import { getAdminMagicLinkEmail } from '$lib/email/templates/admin-magic-link';
import { PUBLIC_SITE_URL } from '$env/static/public';

/**
 * Admin Magic Link Request Endpoint
 *
 * Generates a one-time magic link token and emails it to the admin.
 * Only works for emails in the admin allowlist.
 */
export const POST: RequestHandler = async ({ request }) => {
  const { email } = await request.json();

  if (!email || typeof email !== 'string') {
    return json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email is authorized
  if (!isAdminEmail(normalizedEmail)) {
    // Return success even for unauthorized emails (security: don't leak admin emails)
    return json({ success: true });
  }

  try {
    console.log('[Admin Auth] Generating magic link token for:', normalizedEmail);

    // Generate magic link token
    const token = await generateMagicLinkToken(normalizedEmail);

    console.log('[Admin Auth] Token generated successfully:', token);
    const magicLink = `${PUBLIC_SITE_URL}/admin/auth/verify?token=${token}`;
    console.log('[Admin Auth] Magic link URL:', magicLink);

    // Send email
    const emailTemplate = getAdminMagicLinkEmail({
      email: normalizedEmail,
      magic_link: magicLink
    });

    console.log('[Admin Auth] Sending email to:', normalizedEmail);
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      tags: [
        { name: 'category', value: 'admin_magic_link' }
      ],
      idempotencyKey: `admin_magic_link/${token}`
    });

    console.log('[Admin Auth] Email send result:', emailResult);

    if (!emailResult.success) {
      console.error('[Admin Auth] Email failed to send:', emailResult.error);
      throw new Error('Failed to send email');
    }

    return json({ success: true });
  } catch (error) {
    console.error('[Admin Auth] Error generating magic link:', error);
    console.error('[Admin Auth] Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return json({ error: 'Failed to send magic link' }, { status: 500 });
  }
};
