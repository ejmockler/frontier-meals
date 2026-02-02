-- ============================================================================
-- TELEGRAM VERIFICATION CODE EMAIL TEMPLATE
-- Security fix for C1: Email template for account ownership verification
-- ============================================================================

INSERT INTO email_templates (
  slug,
  version,
  subject,
  html_body,
  is_system,
  is_active,
  variables_schema
) VALUES (
  'telegram_verification',
  1,
  'Your Frontier Meals verification code: {{verification_code}}',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Frontier Meals verification code</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your verification code is {{verification_code}}. Enter this in Telegram to connect your account.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">&#128274;</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Verify Your Account</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Enter this code in Telegram to connect</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Someone is trying to connect your Frontier Meals account to Telegram. If this was you, enter the verification code below in our Telegram bot to complete the connection.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <div style="background: #f3f4f6; padding: 24px 48px; border-radius: 12px; display: inline-block;">
                      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: ui-monospace, ''SF Mono'', SFMono-Regular, Menlo, Consolas, ''Liberation Mono'', monospace;">{{verification_code}}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #d97706; background-color: #fef3c7;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #78350f; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">This code expires in 10 minutes</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #92400e; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">For security, you''ll need to request a new code if this one expires.</p>
              </div>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #dc2626; background-color: #fee2e2;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #7f1d1d; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Did not request this?</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #991b1b; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">If you did not try to connect your account to Telegram, please ignore this email. Someone may have clicked a link intended for you, but they cannot access your account without this code.</p>
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
  TRUE,
  TRUE,
  '[
    {"name": "customer_name", "type": "string", "description": "Customer''s first name", "required": true},
    {"name": "verification_code", "type": "string", "description": "6-digit verification code", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;
