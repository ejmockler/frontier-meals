-- ============================================================================
-- SEED EMAIL TEMPLATES
-- ============================================================================
-- This migration seeds the database with existing code-based email templates
-- so they can be edited in the admin UI using the block editor.
--
-- Templates are stored with:
-- - HTML structure extracted from TypeScript functions
-- - Subject lines
-- - Variables schema (JSONB) for the block editor
-- - is_system flag to mark them as system templates
-- - is_active flag to enable them immediately
--
-- All templates use the base.ts email structure with color schemes and
-- proper WCAG AAA accessibility standards.
-- ============================================================================

-- Add missing columns to email_templates table
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variables_schema JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN email_templates.is_system IS 'System templates cannot be deleted';
COMMENT ON COLUMN email_templates.variables_schema IS 'JSON schema for template variables';

-- ============================================================================
-- TEMPLATE 1: Daily QR Code Email
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
  'qr-daily',
  1,
  'Your meal QR for {{day_name}}',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your QR Code for {{day_name}}</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your QR code for {{day_name}} is ready! Scan at any kiosk before 11:59 PM PT.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">🍽️</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Your QR Code for {{day_name}}</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">{{date_formatted}}</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}}!</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Scan this QR code at any kiosk to get your fresh meal today.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td>
                          <img src="cid:qr-code" alt="Your meal QR code for {{day_name}}" style="width: 280px; height: 280px; display: block;" width="280" height="280">
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #d97706; background-color: #fef3c7;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #78350f; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">⏰ Expires: Tonight at 11:59 PM PT</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #92400e; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">You can redeem this QR code any time before midnight Pacific Time.</p>
              </div>

              <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
                  Need to skip a day? Use <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, ''SF Mono'', SFMono-Regular, Menlo, Consolas, ''Liberation Mono'', monospace; font-size: 14px; color: #111827;">/skip</code> in Telegram
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
              <p style="margin: 8px 0; font-size: 14px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Questions? Message <a href="https://t.me/noahchonlee" style="color: #15803d; text-decoration: underline;">@noahchonlee</a> on Telegram</p>
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
    {"name": "service_date", "type": "string", "description": "Service date (YYYY-MM-DD)", "required": true},
    {"name": "day_name", "type": "string", "description": "Day of week (e.g., Monday)", "required": true},
    {"name": "date_formatted", "type": "string", "description": "Formatted date (e.g., January 27, 2026)", "required": true},
    {"name": "qr_code_base64", "type": "string", "description": "Base64-encoded QR code GIF", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 2: Dunning - Soft Payment Reminder
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
  'dunning-soft',
  1,
  'Payment issue with your Frontier Meals subscription',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Payment issue with your Frontier Meals subscription</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Please update your payment method to keep your meal service active.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #b45309 0%, #92400e 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">💳</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Payment Needs Attention</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We had trouble processing your payment</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We had trouble processing your payment of <strong style="color: #111827;">{{amount_due}}</strong> for your Frontier Meals subscription.</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">This happens sometimes! Usually it''s due to:</p>
              <ul style="margin: 16px 0; padding-left: 24px; color: #1f2937;">
                <li style="margin: 8px 0; color: #1f2937;">Card expiration</li>
                <li style="margin: 8px 0; color: #1f2937;">Insufficient funds</li>
                <li style="margin: 8px 0; color: #1f2937;">Billing address change</li>
              </ul>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;"><strong style="color: #111827;">Update your payment method now to keep your meals coming.</strong></p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{update_payment_url}}" style="display: inline-block; padding: 14px 32px; background-color: #374151; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; text-align: center; mso-padding-alt: 0; mso-text-raise: 0;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #16a34a; background-color: #dcfce7;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #14532d; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">✓ Good news</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #166534; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">Your meal access continues uninterrupted while we work this out. We''ll automatically retry in 24-48 hours.</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
              <p style="margin: 8px 0; font-size: 14px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Questions? Message <a href="https://t.me/noahchonlee" style="color: #b45309; text-decoration: underline;">@noahchonlee</a> on Telegram</p>
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
    {"name": "amount_due", "type": "string", "description": "Formatted amount due (e.g., $19.99)", "required": true},
    {"name": "update_payment_url", "type": "string", "description": "URL to update payment method", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 3: Dunning - Retry Payment Notice
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
  'dunning-retry',
  1,
  'Reminder: Update your Frontier Meals payment',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Reminder: Update your Frontier Meals payment</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your payment is still pending. Please update your payment method.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #b45309 0%, #92400e 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Payment Still Pending</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Action needed to keep your service active</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We tried processing your payment again, but it still didn''t go through.</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;"><strong style="color: #111827;">Your meal service will pause if we can''t collect payment. Please update your card details now.</strong></p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{update_payment_url}}" style="display: inline-block; padding: 14px 32px; background-color: #374151; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; text-align: center; mso-padding-alt: 0; mso-text-raise: 0;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #dc2626; background-color: #fee2e2;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #7f1d1d; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">⚠️ Action needed</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #991b1b; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">We''ll make one more automatic retry in 24-48 hours. If that fails, your subscription will be canceled.</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
              <p style="margin: 8px 0; font-size: 14px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Questions? Message <a href="https://t.me/noahchonlee" style="color: #b45309; text-decoration: underline;">@noahchonlee</a> on Telegram</p>
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
    {"name": "update_payment_url", "type": "string", "description": "URL to update payment method", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 4: Dunning - Final Payment Warning
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
  'dunning-final',
  1,
  'Final notice: Update payment to keep your Frontier Meals subscription',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Final notice: Update payment to keep your Frontier Meals subscription</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Final payment attempt - please update your payment method immediately.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">🚨</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Final Payment Attempt</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Immediate action required</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">This is our final automatic attempt to collect payment of <strong style="color: #111827;">{{amount_due}}</strong>.</p>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #dc2626; background-color: #fee2e2;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #7f1d1d; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">🚨 Important</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #991b1b; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">If this payment fails, your subscription will be canceled and you''ll stop receiving daily QR codes.</p>
              </div>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We''d love to keep serving you! Please update your payment method to continue.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{update_payment_url}}" style="display: inline-block; padding: 14px 32px; background-color: #b91c1c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; text-align: center; mso-padding-alt: 0; mso-text-raise: 0;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background: #f9fafb; padding: 24px; border-radius: 8px; margin-top: 32px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">If you''re facing financial difficulty or have questions, reach out to <a href="https://t.me/noahchonlee" style="color: #b91c1c; text-decoration: underline;">@noahchonlee</a> on Telegram—we''re here to help.</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
              <p style="margin: 8px 0; font-size: 14px; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Questions? Message <a href="https://t.me/noahchonlee" style="color: #b91c1c; text-decoration: underline;">@noahchonlee</a> on Telegram</p>
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
    {"name": "amount_due", "type": "string", "description": "Formatted amount due (e.g., $19.99)", "required": true},
    {"name": "update_payment_url", "type": "string", "description": "URL to update payment method", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 5: Subscription Canceled Notice
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
  'dunning-canceled',
  1,
  'Your Frontier Meals subscription has been canceled',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Frontier Meals subscription has been canceled</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your subscription has been canceled.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">👋</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Subscription Canceled</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We''re sorry to see you go</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Your Frontier Meals subscription has been canceled. You''ll stop receiving daily QR codes immediately.</p>

              <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 32px 0; text-align: center;">
                <p style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #111827;">Want to come back?</p>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">You''re always welcome to resubscribe at <a href="https://frontiermeals.com" style="color: #374151; text-decoration: underline;">frontiermeals.com</a></p>
              </div>

              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">We appreciate you being part of Frontier Meals. If you have any feedback about your experience, we''d love to hear it—message <a href="https://t.me/noahchonlee" style="color: #374151; text-decoration: underline;">@noahchonlee</a> on Telegram.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
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
    {"name": "customer_name", "type": "string", "description": "Customer''s first name", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 6: Telegram Welcome Link
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
  'telegram-link',
  1,
  'Welcome to Frontier Meals - Connect on Telegram',
  '<!DOCTYPE html>
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
                      <span style="color: #4b5563; font-size: 14px;">Every day at 12 PM PT via email</span>
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

              <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #111827;">
                  <strong>Your Telegram Handle:</strong> <code style="background: #ffffff; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, ''SF Mono'', SFMono-Regular, Menlo, Consolas, ''Liberation Mono'', monospace; font-size: 14px; color: #111827;">{{telegram_handle}}</code>
                </p>
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
  TRUE,
  TRUE,
  '[
    {"name": "customer_name", "type": "string", "description": "Customer''s first name", "required": true},
    {"name": "telegram_handle", "type": "string", "description": "Customer''s Telegram handle", "required": true},
    {"name": "deep_link", "type": "string", "description": "Telegram bot deep link URL", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 7: Admin Magic Link
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
  'admin-magic-link',
  1,
  'Your admin login link for Frontier Meals',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your admin login link for Frontier Meals</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Click to access your admin dashboard (expires in 15 minutes).
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #c2410c 0%, #9a3412 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Admin Login</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Access your dashboard</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi,</p>

              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Click the button below to access the Frontier Meals admin dashboard:</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{magic_link}}" style="display: inline-block; padding: 14px 32px; background-color: #c2410c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; text-align: center; mso-padding-alt: 0; mso-text-raise: 0;">
                      Login to Admin Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #d97706; background-color: #fef3c7;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #78350f; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">⏰ Expires in 15 minutes</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #92400e; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.5;">This link can only be used once and will expire soon.</p>
              </div>

              <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
                  If you didn''t request this login link, you can safely ignore this email.
                </p>
              </div>

              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Or copy and paste this URL into your browser:</p>
                <code style="display: block; background: #f3f4f6; padding: 16px; border-radius: 8px; word-break: break-all; font-family: ui-monospace, ''SF Mono'', SFMono-Regular, Menlo, Consolas, ''Liberation Mono'', monospace; font-size: 12px; color: #111827;">{{magic_link}}</code>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #ffffff;">
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
    {"name": "email", "type": "string", "description": "Admin email address", "required": true},
    {"name": "magic_link", "type": "string", "description": "Magic link URL for authentication", "required": true}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- TEMPLATE 8: Schedule Change Notification
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
  'schedule-change',
  1,
  'Schedule Update: {{change_type_label}} {{change_action}}',
  '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Schedule Update</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Your Frontier Meals service schedule has been updated.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); color: #ffffff; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">&#128197;</div>
              <h1 style="margin: 0 0 8px; font-size: 25px; font-weight: 700; line-height: 1.2; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Schedule Update</h1>
              <p style="margin: 0; font-size: 16px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Your service schedule has changed</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 24px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">Hi {{customer_name}},</p>

              {{message_html}}

              {{affected_dates_html}}

              {{effective_date_html}}

              <div style="background: #f9fafb; padding: 24px; border-radius: 8px; margin-top: 32px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
                  If you have questions about this change, message <a href="https://t.me/noahchonlee" style="color: #0f766e; text-decoration: underline;">@noahchonlee</a> on Telegram.
                </p>
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
    {"name": "message", "type": "string", "description": "Admin message about the schedule change", "required": true},
    {"name": "message_html", "type": "string", "description": "HTML-formatted message", "required": true},
    {"name": "change_type", "type": "string", "description": "Type of change (service_pattern, holiday, special_event)", "required": true},
    {"name": "change_type_label", "type": "string", "description": "Human-readable change type label", "required": true},
    {"name": "change_action", "type": "string", "description": "Action performed (added, updated, deleted)", "required": true},
    {"name": "affected_dates", "type": "array", "description": "Array of affected dates (YYYY-MM-DD)", "required": true},
    {"name": "affected_dates_html", "type": "string", "description": "HTML-formatted list of affected dates", "required": false},
    {"name": "effective_date", "type": "string", "description": "When the change takes effect (YYYY-MM-DD)", "required": false},
    {"name": "effective_date_html", "type": "string", "description": "HTML-formatted effective date notice", "required": false}
  ]'::jsonb
)
ON CONFLICT (slug, version) DO NOTHING;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
DECLARE
  template_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count
  FROM email_templates
  WHERE is_system = TRUE AND version = 1;

  RAISE NOTICE 'Email template seeding complete. % system templates seeded.', template_count;
END $$;
