import { buildEmailHTML, brandColors, getSupportFooter } from './base';

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
    <h1 style="margin: 0 0 8px;">Your QR Code for ${dayName}</h1>
    <p style="margin: 0; opacity: 0.95;">${dateFormatted}</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name}!</p>

    <p>Scan this QR code at any kiosk to get your fresh meal today.</p>

    <!-- QR Code Container -->
    <div style="text-align: center; margin: 32px 0;">
      <div style="background: #ffffff; padding: 32px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        <img
          src="cid:qr-code"
          alt="Your meal QR code for ${dayName}"
          style="width: 280px; height: 280px; display: block;"
          width="280"
          height="280"
        >
      </div>
    </div>

    <!-- Expiry Notice -->
    <div class="info-box info-box-warning">
      <p style="margin: 0; font-weight: 600; color: #92400e;">⏰ Expires: Tonight at 11:59 PM PT</p>
      <p style="margin: 8px 0 0; color: #78350f;">You can redeem this QR code any time before midnight Pacific Time.</p>
    </div>

    <!-- Help Text -->
    <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p class="text-muted" style="margin: 0;">
        Need to skip a day? Use <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace;">/skip</code> in Telegram
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
