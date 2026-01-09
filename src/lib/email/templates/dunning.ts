import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  buttonStyle,
  linkStyle,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle,
} from './base';

export function getDunningSoftEmail(data: { customer_name: string; amount_due: string; update_payment_url: string}) {
  const subject = 'Payment issue with your Frontier Meals subscription';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">💳</div>
    <h1>Payment Needs Attention</h1>
    <p>We had trouble processing your payment</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">We had trouble processing your payment of <strong style="color: ${tokens.text.primary};">${data.amount_due}</strong> for your Frontier Meals subscription.</p>

    <p style="${styles.p}">This happens sometimes! Usually it's due to:</p>
    <ul style="margin: ${tokens.spacing.md} 0; padding-left: ${tokens.spacing.lg}; color: ${tokens.text.secondary};">
      <li style="${styles.li}">Card expiration</li>
      <li style="${styles.li}">Insufficient funds</li>
      <li style="${styles.li}">Billing address change</li>
    </ul>

    <p style="${styles.p}"><strong style="color: ${tokens.text.primary};">Update your payment method now to keep your meals coming.</strong></p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.update_payment_url}" style="${buttonStyle(brandColors.gray)}">
            Update Payment Method
          </a>
        </td>
      </tr>
    </table>

    <!-- Good News Box -->
    <div style="${infoBoxStyle('success')}">
      <p style="${infoBoxTitleStyle('success')}">✓ Good news</p>
      <p style="${infoBoxTextStyle('success')}">Your meal access continues uninterrupted while we work this out. We'll automatically retry in 24-48 hours.</p>
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
    <h1>Payment Still Pending</h1>
    <p>Action needed to keep your service active</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">We tried processing your payment again, but it still didn't go through.</p>

    <p style="${styles.p}"><strong style="color: ${tokens.text.primary};">Your meal service will pause if we can't collect payment. Please update your card details now.</strong></p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.update_payment_url}" style="${buttonStyle(brandColors.gray)}">
            Update Payment Method
          </a>
        </td>
      </tr>
    </table>

    <!-- Warning Box -->
    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">⚠️ Action needed</p>
      <p style="${infoBoxTextStyle('error')}">We'll make one more automatic retry in 24-48 hours. If that fails, your subscription will be canceled.</p>
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
    <h1>Final Payment Attempt</h1>
    <p>Immediate action required</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">This is our final automatic attempt to collect payment of <strong style="color: ${tokens.text.primary};">${data.amount_due}</strong>.</p>

    <!-- Critical Warning Box -->
    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">🚨 Important</p>
      <p style="${infoBoxTextStyle('error')}">If this payment fails, your subscription will be canceled and you'll stop receiving daily QR codes.</p>
    </div>

    <p style="${styles.p}">We'd love to keep serving you! Please update your payment method to continue.</p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.update_payment_url}" style="${buttonStyle(brandColors.red)}">
            Update Payment Method
          </a>
        </td>
      </tr>
    </table>

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">If you're facing financial difficulty or have questions, reach out to <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.red)}">@noahchonlee</a> on Telegram—we're here to help.</p>
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
    <h1>Subscription Canceled</h1>
    <p>We're sorry to see you go</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Your Frontier Meals subscription has been canceled. You'll stop receiving daily QR codes immediately.</p>

    <!-- Come Back Box -->
    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.lg}; margin: ${tokens.spacing.xl} 0; text-align: center;">
      <p style="margin: 0 0 ${tokens.spacing.md}; font-size: ${tokens.fontSize.lg}; font-weight: 600; color: ${tokens.text.primary};">Want to come back?</p>
      <p style="${styles.pMuted}">You're always welcome to resubscribe at <a href="https://frontiermeals.com" style="${linkStyle(brandColors.gray)}">frontiermeals.com</a></p>
    </div>

    <p style="${styles.pMuted}">We appreciate you being part of Frontier Meals. If you have any feedback about your experience, we'd love to hear it—message <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.gray)}">@noahchonlee</a> on Telegram.</p>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.gray,
    title: subject,
    preheader: 'Your subscription has been canceled.',
    headerContent,
    bodyContent,
    footerContent: `<p style="${styles.pSmall}">&copy; ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`
  });

  return { subject, html };
}
