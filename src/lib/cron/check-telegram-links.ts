import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '$lib/email/send';
import { randomUUID, sha256 } from '$lib/utils/crypto';

/**
 * Check for customers who haven't linked Telegram within 60 minutes
 * and send them a passwordless correction email
 */
export async function checkTelegramLinks(config: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  siteUrl: string;
}) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

  console.log('[Telegram Check] Starting link verification check');

  // Find customers who:
  // 1. Have telegram_link_status.is_linked = false
  // 2. Were created more than 60 minutes ago
  // 3. Haven't already been sent a correction email (check if telegram_handle is null or telegram_user_id is null)

  const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { data: unlinkedCustomers, error } = await supabase
    .from('customers')
    .select('*, telegram_link_status(*)')
    .lt('created_at', sixtyMinutesAgo.toISOString())
    .is('telegram_user_id', null);

  if (error) {
    console.error('[Telegram Check] Error fetching customers:', error);
    throw error;
  }

  if (!unlinkedCustomers || unlinkedCustomers.length === 0) {
    console.log('[Telegram Check] No unlinked customers found');
    return { checked: 0, emails_sent: 0 };
  }

  console.log(`[Telegram Check] Found ${unlinkedCustomers.length} unlinked customers`);

  let emailsSent = 0;

  for (const customer of unlinkedCustomers) {
    const linkStatus = Array.isArray(customer.telegram_link_status)
      ? customer.telegram_link_status[0]
      : customer.telegram_link_status;

    // Skip if already linked
    if (linkStatus?.is_linked) {
      continue;
    }

    try {
      // Generate handle update token (passwordless correction flow)
      const handleToken = randomUUID();
      const handleTokenHash = await sha256(handleToken);
      const handleTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      // Store hashed handle update token
      await supabase.from('handle_update_tokens').insert({
        customer_id: customer.id,
        token_hash: handleTokenHash,
        expires_at: handleTokenExpiresAt.toISOString()
      });

      // Generate new deep link token (backup flow)
      const deepLinkToken = randomUUID();
      const deepLinkTokenHash = await sha256(deepLinkToken);
      const deepLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const newDeepLink = `https://t.me/frontiermealsbot?start=${deepLinkToken}`;

      // Store hashed deep link token
      await supabase.from('telegram_deep_link_tokens').insert({
        customer_id: customer.id,
        token_hash: deepLinkTokenHash,
        expires_at: deepLinkExpiresAt.toISOString()
      });

      // Build handle update link
      const handleUpdateLink = `${config.siteUrl}/handle/update/${handleToken}`;

      // Send correction email with handle update link (primary) and deep link (backup)
      const subject = 'Action needed: Correct your Telegram username';
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #E67E50 0%, #D97F3E 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #E67E50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button-secondary { background: #52A675; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">✏️ Correct Your Telegram Username</h1>
  </div>

  <div class="content">
    <p>Hi ${customer.name},</p>

    <p>We noticed you haven't connected your Telegram account yet. This might be because your username was mistyped during signup.</p>

    <p><strong>Please correct your Telegram username to activate your account:</strong></p>

    <div style="text-align: center;">
      <a href="${handleUpdateLink}" class="button">✏️ Update My Username</a>
    </div>

    <p style="background: #D1F4DD; padding: 15px; border-left: 4px solid #52A675; border-radius: 4px; margin: 20px 0;">
      <strong>This will let you:</strong><br>
      • Receive daily meal QR codes<br>
      • Set dietary preferences<br>
      • Skip dates when you're away<br>
      • Manage your meal schedule
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 14px; color: #6b7280;">
      <strong>Alternative:</strong> If you don't know your Telegram username, you can also connect directly:
    </p>

    <div style="text-align: center;">
      <a href="${newDeepLink}" class="button button-secondary">📱 Connect on Telegram</a>
    </div>

    <p style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
      <strong>⏰ Links expire in 48 hours.</strong><br>
      Need help? Message <a href="https://t.me/noahchonlee" style="color: #E67E50;">@noahchonlee</a> on Telegram.
    </p>
  </div>

  <div class="footer">
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: #E67E50;">@noahchonlee</a> on Telegram</p>
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
      `.trim();

      await sendEmail({
        to: customer.email,
        subject,
        html,
        tags: [
          { name: 'category', value: 'telegram_correction' },
          { name: 'customer_id', value: customer.id }
        ],
        idempotencyKey: `telegram_correction/${customer.id}`
      });

      emailsSent++;
      console.log(`[Telegram Check] Sent correction email to ${customer.email}`);
    } catch (error) {
      console.error(`[Telegram Check] Error processing customer ${customer.id}:`, error);
    }
  }

  console.log(`[Telegram Check] Complete. Checked: ${unlinkedCustomers.length}, Emails sent: ${emailsSent}`);

  return { checked: unlinkedCustomers.length, emails_sent: emailsSent };
}
