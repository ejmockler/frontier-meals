import { createClient } from '@supabase/supabase-js';
import { PUBLIC_TELEGRAM_BOT_USERNAME } from '$env/static/public';
import { sendEmail } from '$lib/email/send';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { renderTemplate } from '$lib/email/templates';
import { sendAdminAlert, formatJobErrorAlert } from '$lib/utils/alerts';

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
  const errors: Array<{ customer_id: string; email?: string; error: string }> = [];

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
      const newDeepLink = `https://t.me/${PUBLIC_TELEGRAM_BOT_USERNAME}?start=${deepLinkToken}`;

      // Store hashed deep link token
      await supabase.from('telegram_deep_link_tokens').insert({
        customer_id: customer.id,
        token_hash: deepLinkTokenHash,
        expires_at: deepLinkExpiresAt.toISOString()
      });

      // Build handle update link
      const handleUpdateLink = `${config.siteUrl}/handle/update/${handleToken}`;

      // Render correction email using unified template service
      const { subject, html } = await renderTemplate(
        'telegram_correction',
        {
          customer_name: customer.name,
          handle_update_link: handleUpdateLink,
          deep_link: newDeepLink
        },
        config.supabaseServiceKey
      );

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
      errors.push({
        customer_id: customer.id,
        email: customer.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  console.log(`[Telegram Check] Complete. Checked: ${unlinkedCustomers.length}, Emails sent: ${emailsSent}, Errors: ${errors.length}`);

  // Send alert if there were errors
  if (errors.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const alertMessage = formatJobErrorAlert({
      jobName: 'Telegram Link Check Job',
      date: today,
      errorCount: errors.length,
      totalProcessed: unlinkedCustomers.length,
      errors,
      maxErrorsToShow: 5
    });

    await sendAdminAlert(alertMessage);
    console.log(`[Telegram Check] Sent error alert to admin - ${errors.length} errors`);
  }

  return { checked: unlinkedCustomers.length, emails_sent: emailsSent };
}
