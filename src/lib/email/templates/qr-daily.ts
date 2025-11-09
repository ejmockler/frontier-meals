export function getQRDailyEmail(data: {
  customer_name: string;
  service_date: string;
  qr_code_data_url: string; // base64 data URL of QR code image
}) {
  const date = new Date(data.service_date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

  const subject = `Your meal QR for ${dayName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; text-align: center; border-radius: 0 0 8px 8px; }
    .qr-container { background: white; padding: 30px; border-radius: 8px; display: inline-block; margin: 20px 0; }
    .qr-code { width: 280px; height: 280px; }
    .expiry { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; text-align: left; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 32px;">🍽️</h1>
    <h2 style="margin: 10px 0 0; font-size: 24px;">Your QR Code for ${dayName}</h2>
    <p style="margin: 5px 0 0; opacity: 0.9; font-size: 16px;">${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>

  <div class="content">
    <p style="font-size: 18px; margin-bottom: 10px;">Hi ${data.customer_name}!</p>

    <p>Scan this QR code at any kiosk to get your fresh meal today.</p>

    <div class="qr-container">
      <img src="${data.qr_code_data_url}" alt="QR Code" class="qr-code">
    </div>

    <div class="expiry">
      <p style="margin: 0;"><strong>⏰ Expires:</strong> Tonight at 11:59 PM PT</p>
      <p style="margin: 5px 0 0; font-size: 14px; color: #6b7280;">You can redeem this QR code any time before midnight Pacific Time.</p>
    </div>

    <p style="color: #6b7280;">
      Need to skip a day? Use <code>/skip</code> in Telegram<br>
      Questions? Message <a href="https://t.me/noahchonlee" style="color: #52A675;">@noahchonlee</a>
    </p>
  </div>

  <div class="footer">
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}
