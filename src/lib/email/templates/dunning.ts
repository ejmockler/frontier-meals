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

export function getSubscriptionSuspendedEmail(data: { customer_name: string; reactivate_url: string }) {
  const subject = 'Your Frontier Meals Subscription is Suspended';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
    <h1>Subscription Suspended</h1>
    <p>Action required to resume service</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Your Frontier Meals subscription has been suspended due to payment issues.</p>

    <!-- Warning Box -->
    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">⚠️ What this means</p>
      <p style="${infoBoxTextStyle('error')}">You won't receive daily QR codes until your payment method is updated and the subscription is reactivated.</p>
    </div>

    <p style="${styles.p}">To resume your meal service, please update your payment method and reactivate your subscription.</p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="${data.reactivate_url}" style="${buttonStyle(brandColors.gray)}">
            Update Payment Method
          </a>
        </td>
      </tr>
    </table>

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">Questions? Reach out to <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.amber)}">@noahchonlee</a> on Telegram—we're here to help.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.amber,
    title: subject,
    preheader: 'Action required: update your payment method to resume service.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.amber)
  });

  return { subject, html };
}

export function getSubscriptionReactivatedEmail(data: { customer_name: string }) {
  const subject = 'Welcome back! Your Frontier Meals subscription is active';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
    <h1>Welcome Back!</h1>
    <p>Your subscription has been reactivated</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Great news! Your Frontier Meals subscription has been successfully reactivated.</p>

    <!-- Success Box -->
    <div style="${infoBoxStyle('success')}">
      <p style="${infoBoxTitleStyle('success')}">✓ You're all set</p>
      <p style="${infoBoxTextStyle('success')}">Your daily QR codes will resume automatically. Check your Telegram for today's meal access.</p>
    </div>

    <p style="${styles.p}">We're glad to have you back! Your next billing cycle will proceed as scheduled.</p>

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">Questions? Reach out to <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.green)}">@noahchonlee</a> on Telegram—we're here to help.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.green,
    title: subject,
    preheader: 'Your subscription is active again - daily QR codes will resume.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.green)
  });

  return { subject, html };
}

export function getSubscriptionExpiredEmail(data: { customer_name: string }) {
  const subject = 'Your Frontier Meals subscription has ended';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">📅</div>
    <h1>Subscription Ended</h1>
    <p>Your billing period is complete</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Your Frontier Meals subscription has reached the end of its billing period and has expired.</p>

    <p style="${styles.p}">You'll no longer receive daily QR codes. We hope you enjoyed your meals!</p>

    <!-- Come Back Box -->
    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.lg}; margin: ${tokens.spacing.xl} 0; text-align: center;">
      <p style="margin: 0 0 ${tokens.spacing.md}; font-size: ${tokens.fontSize.lg}; font-weight: 600; color: ${tokens.text.primary};">Want to continue?</p>
      <p style="${styles.pMuted}">You can start a new subscription anytime at <a href="https://frontiermeals.com" style="${linkStyle(brandColors.gray)}">frontiermeals.com</a></p>
    </div>

    <p style="${styles.pMuted}">Thank you for being part of Frontier Meals. If you have any feedback about your experience, we'd love to hear it—message <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.gray)}">@noahchonlee</a> on Telegram.</p>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.gray,
    title: subject,
    preheader: 'Your subscription billing period has ended.',
    headerContent,
    bodyContent,
    footerContent: `<p style="${styles.pSmall}">&copy; ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`
  });

  return { subject, html };
}

export function getSubscriptionChargebackEmail(data: { customer_name: string }) {
  const subject = 'Important: Your Frontier Meals subscription has been suspended';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
    <h1>Subscription Suspended</h1>
    <p>Payment dispute detected</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">We've detected a payment dispute (chargeback) on your account, and your Frontier Meals subscription has been suspended.</p>

    <!-- Critical Warning Box -->
    <div style="${infoBoxStyle('error')}">
      <p style="${infoBoxTitleStyle('error')}">⚠️ What this means</p>
      <p style="${infoBoxTextStyle('error')}">Your subscription is suspended immediately. You won't receive daily QR codes or have access to meals until this is resolved.</p>
    </div>

    <p style="${styles.p}"><strong style="color: ${tokens.text.primary};">If you filed a dispute in error or want to resolve this:</strong></p>

    <ul style="margin: ${tokens.spacing.md} 0; padding-left: ${tokens.spacing.lg}; color: ${tokens.text.secondary};">
      <li style="${styles.li}">Contact your bank or payment provider to cancel the dispute</li>
      <li style="${styles.li}">Reach out to our support team to discuss resolution options</li>
    </ul>

    <!-- Contact Support Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="center">
          <a href="https://t.me/noahchonlee" style="${buttonStyle(brandColors.red)}">
            Contact Support
          </a>
        </td>
      </tr>
    </table>

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">Questions about this suspension? Message <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.red)}">@noahchonlee</a> on Telegram and we'll help you resolve this.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.red,
    title: subject,
    preheader: 'Your subscription has been suspended due to a payment dispute.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.red)
  });

  return { subject, html };
}

export function getSubscriptionPaymentRecoveredEmail(data: { customer_name: string }) {
  const subject = 'Payment successful - your Frontier Meals subscription is active!';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
    <h1>Payment Recovered!</h1>
    <p>Your subscription is back to normal</p>
  `;

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    <p style="${styles.p}">Great news! We've successfully processed your payment and your Frontier Meals subscription is now active.</p>

    <!-- Success Box -->
    <div style="${infoBoxStyle('success')}">
      <p style="${infoBoxTitleStyle('success')}">✓ All set</p>
      <p style="${infoBoxTextStyle('success')}">Your daily QR codes will continue without interruption. Thank you for updating your payment method!</p>
    </div>

    <p style="${styles.p}">No action needed on your part—everything is back to normal. Your next billing cycle will proceed as scheduled.</p>

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">Questions about your subscription? Reach out to <a href="https://t.me/noahchonlee" style="${linkStyle(brandColors.green)}">@noahchonlee</a> on Telegram—we're here to help.</p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.green,
    title: subject,
    preheader: 'Your payment was successful and your subscription is active.',
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(brandColors.green)
  });

  return { subject, html };
}
