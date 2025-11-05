export function getTelegramLinkEmail(data: {
  customer_name: string;
  telegram_handle: string;
  deep_link: string;
}) {
  const subject = 'Welcome to Frontier Meals - Connect on Telegram';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button:hover { background: #5568d3; }
    .steps { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .step { display: flex; align-items: start; margin: 15px 0; }
    .step-number { background: #667eea; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 28px;">🍽️ Welcome to Frontier Meals!</h1>
    <p style="margin: 10px 0 0; opacity: 0.9;">Let's get you set up on Telegram</p>
  </div>

  <div class="content">
    <p>Hi ${data.customer_name},</p>

    <p>Your subscription is active! To complete your setup and manage your meals, you'll need to connect with our Telegram bot.</p>

    <div style="text-align: center;">
      <a href="${data.deep_link}" class="button">📱 Connect on Telegram</a>
    </div>

    <div class="steps">
      <h3 style="margin-top: 0;">What happens next:</h3>

      <div class="step">
        <div class="step-number">1</div>
        <div>
          <strong>Connect on Telegram</strong><br>
          Click the button above to open our bot
        </div>
      </div>

      <div class="step">
        <div class="step-number">2</div>
        <div>
          <strong>Set your preferences</strong><br>
          Tell us your diet and any allergies
        </div>
      </div>

      <div class="step">
        <div class="step-number">3</div>
        <div>
          <strong>Get your daily QR code</strong><br>
          Every day at 12 PM PT via email
        </div>
      </div>

      <div class="step">
        <div class="step-number">4</div>
        <div>
          <strong>Pick up your meal</strong><br>
          Scan your QR at any kiosk before 11:59 PM PT
        </div>
      </div>
    </div>

    <p><strong>Your Telegram Handle:</strong> ${data.telegram_handle}</p>

    <p style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
      <strong>⚠️ Important:</strong> You must connect on Telegram within 60 minutes to start receiving your daily QR codes.
    </p>
  </div>

  <div class="footer">
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: #667eea;">@noahchonlee</a> on Telegram</p>
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}
