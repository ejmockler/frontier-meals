import { buildEmailHTML, brandColors, getSupportFooter } from './base';

export function getDunningSoftEmail(data: { customer_name: string; amount_due: string; update_payment_url: string}) {
  const subject = 'Payment issue with your Frontier Meals subscription';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">💳</div>
    <h1 style="margin: 0 0 8px;">Payment Needs Attention</h1>
    <p style="margin: 0; opacity: 0.95;">We had trouble processing your payment</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name},</p>

    <p>We had trouble processing your payment of <strong style="color: #111827;">${data.amount_due}</strong> for your Frontier Meals subscription.</p>

    <p>This happens sometimes! Usually it's due to:</p>
    <ul style="margin: 16px 0; padding-left: 24px; color: #374151;">
      <li style="margin: 8px 0;">Card expiration</li>
      <li style="margin: 8px 0;">Insufficient funds</li>
      <li style="margin: 8px 0;">Billing address change</li>
    </ul>

    <p><strong style="color: #111827;">Update your payment method now to keep your meals coming.</strong></p>

    <!-- CTA Button -->
    <div class="text-center">
      <a href="${data.update_payment_url}" class="email-button" style="background-color: #111827;">
        Update Payment Method
      </a>
    </div>

    <!-- Good News Box -->
    <div class="info-box info-box-success">
      <p style="margin: 0; font-weight: 600; color: #065f46;">✓ Good news</p>
      <p style="margin: 8px 0 0; color: #065f46;">Your meal access continues uninterrupted while we work this out. We'll automatically retry in 24-48 hours.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.amber,
    title: subject,
    preheader: 'Please update your payment method to keep your meal service active.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.amber)
  });

  return { subject, html };
}

export function getDunningRetryEmail(data: { customer_name: string; update_payment_url: string }) {
  const subject = 'Reminder: Update your Frontier Meals payment';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
    <h1 style="margin: 0 0 8px;">Payment Still Pending</h1>
    <p style="margin: 0; opacity: 0.95;">Action needed to keep your service active</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name},</p>

    <p>We tried processing your payment again, but it still didn't go through.</p>

    <p><strong style="color: #111827;">Your meal service will pause if we can't collect payment. Please update your card details now.</strong></p>

    <!-- CTA Button -->
    <div class="text-center">
      <a href="${data.update_payment_url}" class="email-button" style="background-color: #111827;">
        Update Payment Method
      </a>
    </div>

    <!-- Warning Box -->
    <div class="info-box info-box-error">
      <p style="margin: 0; font-weight: 600; color: #991b1b;">⚠️ Action needed</p>
      <p style="margin: 8px 0 0; color: #991b1b;">We'll make one more automatic retry in 24-48 hours. If that fails, your subscription will be canceled.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.amber,
    title: subject,
    preheader: 'Your payment is still pending. Please update your payment method.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.amber)
  });

  return { subject, html };
}

export function getDunningFinalEmail(data: { customer_name: string; amount_due: string; update_payment_url: string }) {
  const subject = 'Final notice: Update payment to keep your Frontier Meals subscription';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🚨</div>
    <h1 style="margin: 0 0 8px;">Final Payment Attempt</h1>
    <p style="margin: 0; opacity: 0.95;">Immediate action required</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name},</p>

    <p>This is our final automatic attempt to collect payment of <strong style="color: #111827;">${data.amount_due}</strong>.</p>

    <!-- Critical Warning Box -->
    <div class="info-box info-box-error">
      <p style="margin: 0; font-weight: 600; color: #991b1b;">🚨 Important</p>
      <p style="margin: 8px 0 0; color: #991b1b;">If this payment fails, your subscription will be canceled and you'll stop receiving daily QR codes.</p>
    </div>

    <p>We'd love to keep serving you! Please update your payment method to continue.</p>

    <!-- CTA Button -->
    <div class="text-center">
      <a href="${data.update_payment_url}" class="email-button" style="background-color: #dc2626;">
        Update Payment Method
      </a>
    </div>

    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 32px;">
      <p style="margin: 0; color: #6b7280;">If you're facing financial difficulty or have questions, reach out to <a href="https://t.me/noahchonlee" style="color: #dc2626; text-decoration: underline;">@noahchonlee</a> on Telegram—we're here to help.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.red,
    title: subject,
    preheader: 'Final payment attempt - please update your payment method immediately.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.red)
  });

  return { subject, html };
}

export function getCanceledNoticeEmail(data: { customer_name: string }) {
  const subject = 'Your Frontier Meals subscription has been canceled';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">👋</div>
    <h1 style="margin: 0 0 8px;">Subscription Canceled</h1>
    <p style="margin: 0; opacity: 0.95;">We're sorry to see you go</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi ${data.customer_name},</p>

    <p>Your Frontier Meals subscription has been canceled. You'll stop receiving daily QR codes immediately.</p>

    <!-- Come Back Box -->
    <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 32px 0; text-align: center;">
      <p style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #111827;">Want to come back?</p>
      <p style="margin: 0; color: #6b7280;">You're always welcome to resubscribe at <a href="https://frontiermeals.com" style="color: #6b7280; text-decoration: underline;">frontiermeals.com</a></p>
    </div>

    <p style="color: #6b7280;">We appreciate you being part of Frontier Meals. If you have any feedback about your experience, we'd love to hear it—message <a href="https://t.me/noahchonlee" style="color: #6b7280; text-decoration: underline;">@noahchonlee</a> on Telegram.</p>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.gray,
    title: subject,
    preheader: 'Your subscription has been canceled.',
    headerContent,
    bodyContent,
    footerContent: `<p class="text-small text-muted">© ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`
  });

  return { subject, html };
}
