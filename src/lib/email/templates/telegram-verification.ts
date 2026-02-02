import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle,
} from './base';
import { escapeHtml } from './utils';

/**
 * Telegram Account Verification Email
 *
 * Sent when a user clicks a Telegram deep link to verify they own
 * the email address associated with the customer account.
 *
 * Security: Prevents account takeover via shared deep links.
 */
export function getTelegramVerificationEmail(data: {
  customer_name: string;
  verification_code: string;
}) {
  const subject = `Your Frontier Meals verification code: ${data.verification_code}`;
  const scheme = brandColors.teal;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">&#128274;</div>
    <h1>Verify Your Account</h1>
    <p>Enter this code in Telegram to connect</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${escapeHtml(data.customer_name)},</p>

    <p style="${styles.p}">Someone is trying to connect your Frontier Meals account to Telegram. If this was you, enter the verification code below in our Telegram bot to complete the connection.</p>

    <!-- Verification Code -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.xl} 0;">
      <tr>
        <td align="center">
          <div style="background: ${tokens.bg.code}; padding: ${tokens.spacing.lg} ${tokens.spacing.xl}; border-radius: ${tokens.radius.lg}; display: inline-block;">
            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: ${tokens.text.primary}; font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;">${escapeHtml(data.verification_code)}</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Expiration Warning -->
    <div style="${infoBoxStyle('warning')}">
      <p style="${infoBoxTitleStyle('warning')}">This code expires in 10 minutes</p>
      <p style="${infoBoxTextStyle('warning')}">For security, you'll need to request a new code if this one expires.</p>
    </div>

    <!-- Security Notice -->
    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">Did not request this?</p>
      <p style="${infoBoxTextStyle('error')}">If you did not try to connect your account to Telegram, please ignore this email. Someone may have clicked a link intended for you, but they cannot access your account without this code.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: `Your verification code is ${data.verification_code}. Enter this in Telegram to connect your account.`,
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(scheme)
  });

  return { subject, html };
}
