export function getDunningSoftEmail(data: { customer_name: string; amount_due: string; update_payment_url: string }) {
  const subject = 'Payment issue with your Frontier Meals subscription';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #171717; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">Payment Needs Attention</h1>
  </div>

  <div class="content">
    <p>Hi ${data.customer_name},</p>

    <p>We had trouble processing your payment of <strong>${data.amount_due}</strong> for your Frontier Meals subscription.</p>

    <p>This happens sometimes! Usually it's due to:</p>
    <ul>
      <li>Card expiration</li>
      <li>Insufficient funds</li>
      <li>Billing address change</li>
    </ul>

    <p><strong>Update your payment method now to keep your meals coming.</strong></p>

    <div style="text-align: center;">
      <a href="${data.update_payment_url}" class="button">Update Payment Method</a>
    </div>

    <p style="background: #D1F4DD; padding: 15px; border-left: 4px solid #52A675; border-radius: 4px; margin-top: 24px;">
      <strong>Good news:</strong> Your meal access continues uninterrupted while we work this out. We'll automatically retry in 24-48 hours.
    </p>
  </div>

  <div class="footer">
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: #E67E50;">@noahchonlee</a> on Telegram</p>
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

export function getDunningRetryEmail(data: { customer_name: string; update_payment_url: string }) {
  const subject = 'Reminder: Update your Frontier Meals payment';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #171717; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">Payment Still Pending</h1>
  </div>

  <div class="content">
    <p>Hi ${data.customer_name},</p>

    <p>We tried processing your payment again, but it still didn't go through.</p>

    <p><strong>Your meal service will pause if we can't collect payment. Please update your card details now.</strong></p>

    <div style="text-align: center;">
      <a href="${data.update_payment_url}" class="button">Update Payment Method</a>
    </div>

    <p style="background: #fee2e2; padding: 15px; border-left: 4px solid #ef4444; border-radius: 4px; margin-top: 24px;">
      <strong>⚠️ Action needed:</strong> We'll make one more automatic retry in 24-48 hours. If that fails, your subscription will be canceled.
    </p>
  </div>

  <div class="footer">
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: #E67E50;">@noahchonlee</a> on Telegram</p>
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

export function getDunningFinalEmail(data: { customer_name: string; amount_due: string; update_payment_url: string }) {
  const subject = 'Final notice: Update payment to keep your Frontier Meals subscription';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #171717; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">⚠️ Final Payment Attempt</h1>
  </div>

  <div class="content">
    <p>Hi ${data.customer_name},</p>

    <p>This is our final automatic attempt to collect payment of <strong>${data.amount_due}</strong>.</p>

    <p style="background: #fee2e2; padding: 15px; border-left: 4px solid #dc2626; border-radius: 4px;">
      <strong>🚨 Important:</strong> If this payment fails, your subscription will be canceled and you'll stop receiving daily QR codes.
    </p>

    <p>We'd love to keep serving you! Please update your payment method to continue.</p>

    <div style="text-align: center;">
      <a href="${data.update_payment_url}" class="button">Update Payment Method</a>
    </div>

    <p>If you're facing financial difficulty or have questions, reach out to @noahchonlee on Telegram—we're here to help.</p>
  </div>

  <div class="footer">
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: #E67E50;">@noahchonlee</a> on Telegram</p>
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

export function getCanceledNoticeEmail(data: { customer_name: string }) {
  const subject = 'Your Frontier Meals subscription has been canceled';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6b7280; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">Subscription Canceled</h1>
  </div>

  <div class="content">
    <p>Hi ${data.customer_name},</p>

    <p>Your Frontier Meals subscription has been canceled. You'll stop receiving daily QR codes immediately.</p>

    <p><strong>Want to come back?</strong> You're always welcome to resubscribe at <a href="https://frontier-meals.com" style="color: #E67E50;">frontier-meals.com</a></p>

    <p>We appreciate you being part of Frontier Meals. If you have any feedback about your experience, we'd love to hear it—message @noahchonlee on Telegram.</p>
  </div>

  <div class="footer">
    <p style="color: #9ca3af; font-size: 12px;">© 2025 Frontier Meals. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}
