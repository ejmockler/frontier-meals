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
    // Generate magic link token
    const token = await generateMagicLinkToken(normalizedEmail);
    const magicLink = `${PUBLIC_SITE_URL}/admin/auth/verify?token=${token}`;

    // Send email
    const emailTemplate = getAdminMagicLinkEmail({
      email: normalizedEmail,
      magic_link: magicLink
    });

    await sendEmail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      tags: [
        { name: 'category', value: 'admin_magic_link' },
        { name: 'admin_email', value: normalizedEmail }
      ],
      idempotencyKey: `admin_magic_link/${token}`
    });

    return json({ success: true });
  } catch (error) {
    console.error('[Admin Auth] Error generating magic link:', error);
    return json({ error: 'Failed to send magic link' }, { status: 500 });
  }
};
