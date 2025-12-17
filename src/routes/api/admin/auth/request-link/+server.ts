import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMagicLinkToken, isAdminEmail } from '$lib/auth/admin';
import { sendEmail } from '$lib/email/send';
import { getAdminMagicLinkEmail } from '$lib/email/templates/admin-magic-link';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Admin Magic Link Request Endpoint
 *
 * Generates a one-time magic link token and emails it to the admin.
 * Only works for emails in the admin allowlist.
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const { email } = await request.json();

  if (!email || typeof email !== 'string') {
    return json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limiting: 3 requests per hour per email
  // Prevents magic link spam and email enumeration attacks
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.magicLink(normalizedEmail),
    maxRequests: 3,
    windowMinutes: 60
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Admin Auth] Rate limit exceeded for:', normalizedEmail);
    // SECURITY: Return success even when rate limited to prevent email enumeration
    // Don't leak whether an email is in the admin list by varying the response
    return json({ success: true });
  }

  // Check if email is authorized
  if (!isAdminEmail(normalizedEmail)) {
    // Return success even for unauthorized emails (security: don't leak admin emails)
    return json({ success: true });
  }

  try {
    console.log('[Admin Auth] Generating magic link token for:', normalizedEmail);

    // Generate magic link token
    const token = await generateMagicLinkToken(normalizedEmail);

    console.log('[Admin Auth] Token generated successfully');
    // Use the actual request origin instead of PUBLIC_SITE_URL
    const magicLink = `${url.origin}/admin/auth/verify?token=${token}`;
    console.log('[Admin Auth] Magic link generated for:', normalizedEmail);

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
