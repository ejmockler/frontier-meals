import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  buttonStyle,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle,
} from './base';
import { escapeHtml } from './utils';

/**
 * Perceptual Engineering Principles Applied:
 * - Single focal point: The Telegram button is the ONE thing to do
 * - Causality clear: Payment confirmed → connect Telegram → meals start
 * - Recognition > recall: Button is obvious, no memorization needed
 * - Reduced anxiety: Expiry info is present but not alarming
 * - Working memory: 3 steps max, chunked into clear sequence
 */
export function getTelegramLinkEmail(data: {
  customer_name: string;
  telegram_handle?: string; // Optional - not shown in welcome email
  deep_link: string;
}) {
  const subject = `${escapeHtml(data.customer_name.split(' ')[0])}, your Frontier Meals subscription is ready`;
  const scheme = brandColors.teal;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">✓</div>
    <h1>Payment Confirmed</h1>
    <p>One step left to start your meals</p>
  `;

  // Step number badge style
  const stepBadge = `background: ${scheme.primary}; color: ${scheme.onPrimary}; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: ${tokens.fontSize.sm}; line-height: 28px;`;
  const stepBadgeComplete = `background: ${tokens.text.muted}; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: ${tokens.fontSize.sm}; line-height: 28px;`;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${escapeHtml(data.customer_name.split(' ')[0])},</p>

    <p style="${styles.p}">Your subscription is confirmed. Connect your Telegram account to start receiving daily meal QR codes.</p>

    <!-- Primary CTA - THE focal point -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.xl} 0;">
      <tr>
        <td align="center">
          <a href="${data.deep_link}" style="${buttonStyle(scheme)}; font-size: 18px; padding: 16px 32px;">
            Connect Telegram →
          </a>
        </td>
      </tr>
    </table>

    <!-- Progress indicator - shows where they are -->
    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.lg}; margin: ${tokens.spacing.xl} 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding: 8px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadgeComplete}">✓</div>
          </td>
          <td style="padding: 8px 0 8px 12px; vertical-align: middle;">
            <span style="color: ${tokens.text.muted}; text-decoration: line-through;">Subscribe</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">2</div>
          </td>
          <td style="padding: 8px 0 8px 12px; vertical-align: middle;">
            <strong style="color: ${tokens.text.primary};">Connect Telegram</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};"> ← you are here</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadgeComplete}; background: ${tokens.bg.card}; color: ${tokens.text.muted}; border: 2px solid ${tokens.text.muted};">3</div>
          </td>
          <td style="padding: 8px 0 8px 12px; vertical-align: middle;">
            <span style="color: ${tokens.text.muted};">Receive daily QR codes at noon</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Link expires - low anxiety framing -->
    <p style="${styles.p}; color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">
      This link is valid for 7 days. After connecting, you'll receive your first QR code at the next noon delivery.
    </p>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: 'Your subscription is active! Connect on Telegram to get started.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(scheme)
  });

  return { subject, html };
}
