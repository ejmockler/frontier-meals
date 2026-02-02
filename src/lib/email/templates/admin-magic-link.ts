import {
  buildEmailHTML,
  brandColors,
  styles,
  tokens,
  buttonStyle,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle,
} from './base';
import { escapeHtml } from './utils';

export function getAdminMagicLinkEmail(data: {
  email: string;
  magic_link: string;
}) {
  const subject = 'Your admin login link for Frontier Meals';
  const scheme = brandColors.orange;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
    <h1>Admin Login</h1>
    <p>Access your dashboard</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi,</p>

    <p style="${styles.p}">Click the button below to access the Frontier Meals admin dashboard:</p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.magic_link}" style="${buttonStyle(scheme)}">
            Login to Admin Dashboard
          </a>
        </td>
      </tr>
    </table>

    <!-- Expiry Warning -->
    <div style="${infoBoxStyle('warning')}">
      <p style="${infoBoxTitleStyle('warning')}">⏰ Expires in 15 minutes</p>
      <p style="${infoBoxTextStyle('warning')}">This link can only be used once and will expire soon.</p>
    </div>

    <!-- Security Notice -->
    <div style="background: ${tokens.bg.code}; padding: ${tokens.spacing.md}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.lg};">
      <p style="${styles.pMuted}">
        If you didn't request this login link, you can safely ignore this email.
      </p>
    </div>

    <!-- Alternative Link -->
    <div style="margin-top: ${tokens.spacing.xl}; padding-top: ${tokens.spacing.lg}; border-top: 1px solid ${tokens.border.light};">
      <p style="${styles.pMuted}; margin-bottom: ${tokens.spacing.sm};">Or copy and paste this URL into your browser:</p>
      <code style="${styles.codeBlock}">${escapeHtml(data.magic_link)}</code>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: 'Click to access your admin dashboard (expires in 15 minutes).',
    headerContent,
    bodyContent,
    footerContent: `<p style="${styles.pSmall}">&copy; ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`
  });

  return { subject, html };
}
