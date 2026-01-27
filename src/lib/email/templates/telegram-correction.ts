/**
 * Telegram Correction Email Template
 *
 * Sent by cron job when a customer hasn't linked their Telegram account
 * within 60 minutes of signup. Provides:
 * 1. Handle update link (primary) - correct a mistyped username
 * 2. Deep link (backup) - connect directly on Telegram
 */

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

export interface TelegramCorrectionEmailData {
  customer_name: string;
  handle_update_link: string;
  deep_link: string;
}

export function getTelegramCorrectionEmail(data: TelegramCorrectionEmailData) {
  const subject = 'Action needed: Correct your Telegram username';
  const scheme = brandColors.orange;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">&#9999;&#65039;</div>
    <h1>Correct Your Telegram Username</h1>
    <p>Let's fix this and get you connected</p>
  `;

  // Secondary button style (green for backup option)
  const secondaryButtonStyle = buttonStyle({ ...brandColors.green });

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">We noticed you haven't connected your Telegram account yet. This might be because your username was mistyped during signup.</p>

    <p style="${styles.p}"><strong style="color: ${tokens.text.primary};">Please correct your Telegram username to activate your account:</strong></p>

    <!-- Primary CTA -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.handle_update_link}" style="${buttonStyle(scheme)}">
            &#9999;&#65039; Update My Username
          </a>
        </td>
      </tr>
    </table>

    <!-- Benefits Box -->
    <div style="${infoBoxStyle('success')}">
      <p style="${infoBoxTitleStyle('success')}">This will let you:</p>
      <ul style="margin: 8px 0 0; padding-left: 20px; color: ${tokens.infoBox.success.textLight}; font-size: ${tokens.fontSize.sm}; line-height: 1.6;">
        <li style="margin: 4px 0;">Receive daily meal QR codes</li>
        <li style="margin: 4px 0;">Set dietary preferences</li>
        <li style="margin: 4px 0;">Skip dates when you're away</li>
        <li style="margin: 4px 0;">Manage your meal schedule</li>
      </ul>
    </div>

    <!-- Divider -->
    <div style="border-top: 2px solid ${tokens.border.light}; margin: ${tokens.spacing.xl} 0;"></div>

    <!-- Alternative Option -->
    <p style="${styles.pMuted}; margin-bottom: ${tokens.spacing.md};">
      <strong>Alternative:</strong> If you don't know your Telegram username, you can also connect directly:
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.md} 0;">
      <tr>
        <td align="center">
          <a href="${data.deep_link}" style="${secondaryButtonStyle}">
            &#128241; Connect on Telegram
          </a>
        </td>
      </tr>
    </table>

    <!-- Expiry Warning -->
    <div style="${infoBoxStyle('warning')}">
      <p style="${infoBoxTitleStyle('warning')}">&#9200; Links expire in 48 hours</p>
      <p style="${infoBoxTextStyle('warning')}">Need help? Message <a href="https://t.me/noahchonlee" style="color: ${scheme.link}; text-decoration: underline;">@noahchonlee</a> on Telegram.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: 'Update your Telegram username to start receiving your daily QR codes.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(scheme)
  });

  return { subject, html };
}
