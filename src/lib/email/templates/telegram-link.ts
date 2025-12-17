import { buildEmailHTML, brandColors, getSupportFooter } from './base';

export function getTelegramLinkEmail(data: {
  customer_name: string;
  telegram_handle: string;
  deep_link: string;
}) {
  const subject = 'Welcome to Frontier Meals - Connect on Telegram';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🍽️</div>
    <h1 style="margin: 0 0 8px;">Welcome to Frontier Meals!</h1>
    <p style="margin: 0; opacity: 0.95;">Let's get you set up on Telegram</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name},</p>

    <p>Your subscription is active! To complete your setup and manage your meals, connect with our Telegram bot.</p>

    <!-- CTA Button -->
    <div class="text-center">
      <a href="${data.deep_link}" class="email-button" style="background-color: #2D9B9B;">
        📱 Connect on Telegram
      </a>
    </div>

    <!-- Steps -->
    <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 32px 0;">
      <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #111827;">What happens next:</h2>

      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; vertical-align: top;">
            <div style="background: #2D9B9B; color: white; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">1</div>
          </td>
          <td style="padding: 12px 0 12px 16px; vertical-align: top;">
            <strong style="display: block; color: #111827; margin-bottom: 4px;">Connect on Telegram</strong>
            <span style="color: #6b7280; font-size: 14px;">Click the button above to open our bot</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top;">
            <div style="background: #2D9B9B; color: white; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">2</div>
          </td>
          <td style="padding: 12px 0 12px 16px; vertical-align: top;">
            <strong style="display: block; color: #111827; margin-bottom: 4px;">Set your preferences</strong>
            <span style="color: #6b7280; font-size: 14px;">Tell us your diet and any allergies</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top;">
            <div style="background: #2D9B9B; color: white; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">3</div>
          </td>
          <td style="padding: 12px 0 12px 16px; vertical-align: top;">
            <strong style="display: block; color: #111827; margin-bottom: 4px;">Get your daily QR code</strong>
            <span style="color: #6b7280; font-size: 14px;">Every day at 12 PM PT via email</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; vertical-align: top;">
            <div style="background: #2D9B9B; color: white; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">4</div>
          </td>
          <td style="padding: 12px 0 12px 16px; vertical-align: top;">
            <strong style="display: block; color: #111827; margin-bottom: 4px;">Pick up your meal</strong>
            <span style="color: #6b7280; font-size: 14px;">Scan your QR at any kiosk before 11:59 PM PT</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Handle Display -->
    <p style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 24px 0;">
      <strong style="color: #111827;">Your Telegram Handle:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace;">${data.telegram_handle}</code>
    </p>

    <!-- Warning Notice -->
    <div class="info-box info-box-warning">
      <p style="margin: 0; font-weight: 600; color: #92400e;">⚠️ Important</p>
      <p style="margin: 8px 0 0; color: #78350f;">You must connect on Telegram within 60 minutes to start receiving your daily QR codes.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.teal,
    title: subject,
    preheader: 'Your subscription is active! Connect on Telegram to get started.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.teal)
  });

  return { subject, html };
}
