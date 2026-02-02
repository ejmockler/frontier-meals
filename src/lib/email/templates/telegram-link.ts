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

export function getTelegramLinkEmail(data: {
  customer_name: string;
  telegram_handle: string;
  deep_link: string;
}) {
  const subject = 'Welcome to Frontier Meals - Connect on Telegram';
  const scheme = brandColors.teal;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🍽️</div>
    <h1>Welcome to Frontier Meals!</h1>
    <p>Let's get you set up on Telegram</p>
  `;

  // Step number badge style
  const stepBadge = `background: ${scheme.primary}; color: ${scheme.onPrimary}; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: ${tokens.fontSize.sm}; line-height: 28px;`;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${escapeHtml(data.customer_name)},</p>

    <p style="${styles.p}">Your subscription is active! To complete your setup and manage your meals, connect with our Telegram bot.</p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.deep_link}" style="${buttonStyle(scheme)}">
            📱 Connect on Telegram
          </a>
        </td>
      </tr>
    </table>

    <!-- Steps -->
    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.lg}; margin: ${tokens.spacing.xl} 0;">
      <h2 style="${styles.h3}">What happens next:</h2>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">1</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">Connect on Telegram</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">Click the button above to open our bot</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">2</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">Set your preferences</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">Tell us your diet and any allergies</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">3</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">Get your daily QR code</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">Every day at 12 PM PT via email</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">4</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">Pick up your meal</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">Scan your QR at any kiosk before 11:59 PM PT</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Handle Display -->
    <div style="background: ${tokens.bg.code}; padding: ${tokens.spacing.md}; border-radius: ${tokens.radius.md}; margin: ${tokens.spacing.lg} 0;">
      <p style="margin: 0; color: ${tokens.text.primary};">
        <strong>Your Telegram Handle:</strong> <code style="${styles.code}; background: ${tokens.bg.card};">${escapeHtml(data.telegram_handle)}</code>
      </p>
    </div>

    <!-- Warning Notice -->
    <div style="${infoBoxStyle('warning')}">
      <p style="${infoBoxTitleStyle('warning')}">⚠️ Important</p>
      <p style="${infoBoxTextStyle('warning')}">This link expires in 7 days. Connect on Telegram to start receiving your daily QR codes.</p>
    </div>
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
