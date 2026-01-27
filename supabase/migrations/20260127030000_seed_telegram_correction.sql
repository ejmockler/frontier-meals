-- Seed telegram_correction template
-- This is a follow-up email sent when customer hasn't linked Telegram within 60 minutes

INSERT INTO email_templates (
  id,
  slug,
  version,
  subject,
  html_body,
  variables_schema,
  is_active,
  is_system,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'telegram_correction',
  1,
  'Action needed: Correct your Telegram username',
  '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Correct Your Telegram Username</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F3F0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F5F3F0;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #E67E50 0%, #D97F3E 100%); padding: 40px 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">✏️</div>
              <h1 style="margin: 0 0 8px; color: #FFFFFF; font-size: 28px; font-weight: 700;">Correct Your Telegram Username</h1>
              <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Let''s fix this and get you connected</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #1A1816; font-size: 18px; line-height: 1.6;">Hi {{customer_name}},</p>
              <p style="margin: 0 0 16px; color: #4A4845; font-size: 16px; line-height: 1.6;">We noticed you haven''t connected your Telegram account yet. This might be because your username was mistyped during signup.</p>
              <p style="margin: 0 0 16px; color: #4A4845; font-size: 16px; line-height: 1.6;"><strong style="color: #1A1816;">Please correct your Telegram username to activate your account:</strong></p>

              <!-- Primary CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{handle_update_link}}" style="display: inline-block; padding: 16px 32px; background-color: #E67E50; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">✏️ Update My Username</a>
                  </td>
                </tr>
              </table>

              <!-- Benefits Box -->
              <div style="background-color: #E8F5E8; border-left: 4px solid #4CAF50; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0 0 8px; color: #2E7D32; font-weight: 600; font-size: 14px;">This will let you:</p>
                <ul style="margin: 8px 0 0; padding-left: 20px; color: #4A7C4A; font-size: 14px; line-height: 1.6;">
                  <li style="margin: 4px 0;">Receive daily meal QR codes</li>
                  <li style="margin: 4px 0;">Set dietary preferences</li>
                  <li style="margin: 4px 0;">Skip dates when you''re away</li>
                  <li style="margin: 4px 0;">Manage your meal schedule</li>
                </ul>
              </div>

              <!-- Divider -->
              <div style="border-top: 2px solid #E8E6E3; margin: 32px 0;"></div>

              <!-- Alternative Option -->
              <p style="margin: 0 0 16px; color: #6B6966; font-size: 14px; line-height: 1.6;">
                <strong>Alternative:</strong> If you don''t know your Telegram username, you can also connect directly:
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td align="center">
                    <a href="{{deep_link}}" style="display: inline-block; padding: 16px 32px; background-color: #4CAF50; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">📱 Connect on Telegram</a>
                  </td>
                </tr>
              </table>

              <!-- Expiry Warning -->
              <div style="background-color: #FFF8E1; border-left: 4px solid #FFC107; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0 0 4px; color: #F57C00; font-weight: 600; font-size: 14px;">⏰ Links expire in 48 hours</p>
                <p style="margin: 0; color: #8D6E00; font-size: 13px;">Need help? Message <a href="https://t.me/noahchonlee" style="color: #E67E50; text-decoration: underline;">@noahchonlee</a> on Telegram.</p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #FAF9F7; border-top: 1px solid #E8E6E3; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6B6966; font-size: 13px;">Questions? Reply to this email or message us on Telegram.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '{"customer_name": {"type": "string", "description": "Customer''s name"}, "handle_update_link": {"type": "string", "description": "URL to update Telegram handle"}, "deep_link": {"type": "string", "description": "Telegram bot deep link"}}',
  true,
  true,
  NOW(),
  NOW()
) ON CONFLICT (slug, version) DO NOTHING;
