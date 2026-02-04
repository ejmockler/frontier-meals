-- Migration: 20260202700000_fix_telegram_link_template.sql
-- Date: 2026-02-02
-- Purpose: Remove telegram_handle from welcome email (it's not set yet at this point)
--
-- Problem: The telegram-link template shows "Your Telegram Handle: {{telegram_handle}}"
-- but this email is sent immediately after subscription activation, BEFORE the user
-- connects Telegram. So telegram_handle is always empty/undefined.
--
-- Solution: Remove the telegram_handle display section and mark it as not required.

-- Update the telegram-link template to remove the telegram_handle section
UPDATE email_templates
SET
  html_body = '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Welcome to Frontier Meals - Connect on Telegram</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your subscription is active! Connect on Telegram to get started.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">🍽️</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Welcome to Frontier Meals!</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Let''s get you set up on Telegram</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Your subscription is active! To complete your setup and manage your meals, connect with our Telegram bot.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{deep_link}}" style="display: inline-block; padding: 14px 32px; background-color: #0f766e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; text-align: center; mso-padding-alt: 0; mso-text-raise: 0;">
                      📱 Connect on Telegram
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 32px 0;">
                <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; line-height: 1.3; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">What happens next:</h2>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top; width: 40px;">
                      <div style="background: #0f766e; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: 14px; line-height: 28px;">1</div>
                    </td>
                    <td style="padding: 12px 0 12px 12px; vertical-align: top;">
                      <strong style="display: block; color: #111827; margin-bottom: 4px;">Connect on Telegram</strong>
                      <span style="color: #4b5563; font-size: 14px;">Click the button above to open our bot</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top; width: 40px;">
                      <div style="background: #0f766e; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: 14px; line-height: 28px;">2</div>
                    </td>
                    <td style="padding: 12px 0 12px 12px; vertical-align: top;">
                      <strong style="display: block; color: #111827; margin-bottom: 4px;">Set your preferences</strong>
                      <span style="color: #4b5563; font-size: 14px;">Tell us your diet and any allergies</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top; width: 40px;">
                      <div style="background: #0f766e; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: 14px; line-height: 28px;">3</div>
                    </td>
                    <td style="padding: 12px 0 12px 12px; vertical-align: top;">
                      <strong style="display: block; color: #111827; margin-bottom: 4px;">Get your daily QR code</strong>
                      <span style="color: #4b5563; font-size: 14px;">Every day at 12 PM PT via Telegram</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top; width: 40px;">
                      <div style="background: #0f766e; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: 14px; line-height: 28px;">4</div>
                    </td>
                    <td style="padding: 12px 0 12px 12px; vertical-align: top;">
                      <strong style="display: block; color: #111827; margin-bottom: 4px;">Pick up your meal</strong>
                      <span style="color: #4b5563; font-size: 14px;">Scan your QR at any kiosk before 11:59 PM PT</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #d97706; background-color: #fef3c7;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #78350f; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">⚠️ Important</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #92400e; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">You must connect on Telegram within 60 minutes to start receiving your daily QR codes.</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
              <p style="margin: 8px 0; font-size: 14px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Questions? Message <a href="https://t.me/noahchonlee" style="color: #0f766e; text-decoration: underline;">@noahchonlee</a> on Telegram</p>
              <p style="margin: 0; font-size: 12px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">&copy; 2026 Frontier Meals. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  variables_schema = '[
    {"name": "customer_name", "type": "string", "description": "Customer''s first name", "required": true},
    {"name": "deep_link", "type": "string", "description": "Telegram bot deep link URL", "required": true}
  ]'::jsonb,
  updated_at = NOW()
WHERE slug = 'telegram-link' AND version = 1;
