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

export function getQRDailyEmail(data: {
  customer_name: string;
  service_date: string;
  qr_code_base64: string; // base64-encoded GIF image (without data URL prefix)
}) {
  const date = new Date(data.service_date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateFormatted = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const subject = `Your meal QR for ${dayName}`;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🍽️</div>
    <h1>Your QR Code for ${dayName}</h1>
    <p>${dateFormatted}</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${escapeHtml(data.customer_name)}!</p>

    <p style="${styles.p}">Scan this QR code at any kiosk to get your fresh meal today.</p>

    <!-- QR Code Container -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.xl} 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background: ${tokens.bg.card}; padding: ${tokens.spacing.xl}; border-radius: ${tokens.radius.lg}; border: 1px solid ${tokens.border.light};">
            <tr>
              <td>
                <img
                  src="cid:qr-code"
                  alt="Your meal QR code for ${dayName}"
                  style="width: 280px; height: 280px; display: block;"
                  width="280"
                  height="280"
                >
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Expiry Notice -->
    <div style="${infoBoxStyle('warning')}">
      <p style="${infoBoxTitleStyle('warning')}">⏰ Expires: Tonight at 11:59 PM PT</p>
      <p style="${infoBoxTextStyle('warning')}">You can redeem this QR code any time before midnight Pacific Time.</p>
    </div>

    <!-- Help Text -->
    <div style="text-align: center; margin-top: ${tokens.spacing.xl}; padding-top: ${tokens.spacing.lg}; border-top: 1px solid ${tokens.border.light};">
      <p style="${styles.pMuted}">
        Need to skip a day? Use <code style="${styles.code}">/skip</code> in Telegram
      </p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.green,
    title: subject,
    preheader: `Your QR code for ${dayName} is ready! Scan at any kiosk before 11:59 PM PT.`,
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.green)
  });

  return { subject, html };
}
