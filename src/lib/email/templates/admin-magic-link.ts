export function getAdminMagicLinkEmail(data: {
  email: string;
  magic_link: string;
}) {
  const subject = 'Your admin login link for Frontier Meals';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #E67E50 0%, #D97F3E 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #E67E50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button:hover { background: #D97F3E; }
    .expiry { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">🔐 Admin Login</h1>
  </div>

  <div class="content">
    <p>Hi,</p>

    <p>Click the button below to access the Frontier Meals admin dashboard:</p>

    <div style="text-align: center;">
      <a href="${data.magic_link}" class="button">Login to Admin Dashboard</a>
    </div>

    <div class="expiry">
      <p style="margin: 0;"><strong>⏰ Expires in 15 minutes</strong></p>
      <p style="margin: 5px 0 0; font-size: 14px; color: #6b7280;">This link can only be used once and will expire soon.</p>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      If you didn't request this login link, you can safely ignore this email.
    </p>

    <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
      Or copy and paste this URL into your browser:<br>
      <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; word-break: break-all;">${data.magic_link}</code>
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
