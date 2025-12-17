import { buildEmailHTML, brandColors } from './base';

export function getAdminMagicLinkEmail(data: {
  email: string;
  magic_link: string;
}) {
  const subject = 'Your admin login link for Frontier Meals';

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
    <h1 style="margin: 0 0 8px;">Admin Login</h1>
    <p style="margin: 0; opacity: 0.95;">Access your dashboard</p>
  `;

  const bodyContent = `
    <p style="font-size: 18px; font-weight: 500; color: #111827;">Hi,</p>

    <p>Click the button below to access the Frontier Meals admin dashboard:</p>

    <!-- CTA Button -->
    <div class="text-center">
      <a href="${data.magic_link}" class="email-button" style="background-color: #E67E50;">
        Login to Admin Dashboard
      </a>
    </div>

    <!-- Expiry Warning -->
    <div class="info-box info-box-warning">
      <p style="margin: 0; font-weight: 600; color: #92400e;">⏰ Expires in 15 minutes</p>
      <p style="margin: 8px 0 0; color: #78350f;">This link can only be used once and will expire soon.</p>
    </div>

    <!-- Security Notice -->
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        If you didn't request this login link, you can safely ignore this email.
      </p>
    </div>

    <!-- Alternative Link -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p class="text-muted" style="margin: 0 0 8px;">Or copy and paste this URL into your browser:</p>
      <code style="display: block; background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; font-family: 'Courier New', monospace; color: #111827;">${data.magic_link}</code>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: brandColors.orange,
    title: subject,
    preheader: 'Click to access your admin dashboard (expires in 15 minutes).',
    headerContent,
    bodyContent,
    footerContent: `<p class="text-small text-muted">© ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`
  });

  return { subject, html };
}
