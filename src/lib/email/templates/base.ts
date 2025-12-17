/**
 * Shared email template base system
 * Provides consistent styling and structure across all emails
 */

export interface EmailBaseStyles {
  primaryColor: string;
  primaryColorDark: string;
}

export const brandColors = {
  orange: { primary: '#E67E50', dark: '#D97F3E' },
  teal: { primary: '#2D9B9B', dark: '#1F7A7A' },
  green: { primary: '#52A675', dark: '#3D8559' },
  amber: { primary: '#f59e0b', dark: '#d97706' },
  red: { primary: '#dc2626', dark: '#b91c1c' },
  gray: { primary: '#6b7280', dark: '#4b5563' }
};

/**
 * Base CSS styles for all email templates
 * Uses inline styles for maximum email client compatibility
 */
export function getBaseStyles(colorScheme: EmailBaseStyles = brandColors.orange) {
  return `
    /* Reset and base styles */
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Dark mode overrides */
    @media (prefers-color-scheme: dark) {
      body { background-color: #111827 !important; color: #f9fafb !important; }
      .email-wrapper { background-color: #1f2937 !important; }
      .email-content { background-color: #111827 !important; }
      .text-muted { color: #9ca3af !important; }
    }

    /* Container */
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    /* Header */
    .email-header {
      background: linear-gradient(135deg, ${colorScheme.primary} 0%, ${colorScheme.primaryDark} 100%);
      color: #ffffff;
      padding: 40px 24px;
      text-align: center;
    }

    .email-header h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }

    .email-header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }

    /* Content */
    .email-content {
      padding: 32px 24px;
      background-color: #ffffff;
    }

    .email-content p {
      margin: 0 0 16px;
      font-size: 16px;
      line-height: 1.6;
      color: #374151;
    }

    .email-content p:last-child {
      margin-bottom: 0;
    }

    .email-content h2 {
      margin: 32px 0 16px;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }

    .email-content h2:first-child {
      margin-top: 0;
    }

    /* Buttons */
    .email-button {
      display: inline-block;
      padding: 14px 32px;
      margin: 24px 0;
      background-color: ${colorScheme.primary};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      transition: background-color 0.2s;
    }

    .email-button:hover {
      background-color: ${colorScheme.primaryDark};
    }

    .email-button-secondary {
      background-color: #6b7280;
    }

    .email-button-secondary:hover {
      background-color: #4b5563;
    }

    /* Info boxes */
    .info-box {
      padding: 16px;
      margin: 24px 0;
      border-radius: 8px;
      border-left: 4px solid;
    }

    .info-box-success {
      background-color: #d1f4dd;
      border-color: #52A675;
    }

    .info-box-warning {
      background-color: #fef3c7;
      border-color: #f59e0b;
    }

    .info-box-error {
      background-color: #fee2e2;
      border-color: #dc2626;
    }

    .info-box-info {
      background-color: #dbeafe;
      border-color: #3b82f6;
    }

    .info-box p {
      margin: 0;
      font-size: 14px;
    }

    .info-box p + p {
      margin-top: 8px;
    }

    /* Footer */
    .email-footer {
      padding: 24px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }

    .email-footer p {
      margin: 8px 0;
    }

    .email-footer a {
      color: ${colorScheme.primary};
      text-decoration: none;
    }

    /* Utility classes */
    .text-center { text-align: center; }
    .text-muted { color: #6b7280; font-size: 14px; }
    .text-small { font-size: 12px; }
    .mt-0 { margin-top: 0 !important; }
    .mb-0 { margin-bottom: 0 !important; }
  `;
}

/**
 * Generate complete email HTML with base template
 */
export function buildEmailHTML(options: {
  colorScheme?: EmailBaseStyles;
  title: string;
  preheader?: string;
  headerContent: string;
  bodyContent: string;
  footerContent?: string;
}): string {
  const styles = getBaseStyles(options.colorScheme);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${options.title}</title>
  <style>${styles}</style>
</head>
<body>
  ${options.preheader ? `
  <!-- Preheader text (hidden in email, shown in inbox preview) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${options.preheader}
  </div>
  ` : ''}

  <!-- Email wrapper -->
  <div class="email-wrapper">
    <!-- Header -->
    <div class="email-header">
      ${options.headerContent}
    </div>

    <!-- Content -->
    <div class="email-content">
      ${options.bodyContent}
    </div>

    <!-- Footer -->
    <div class="email-footer">
      ${options.footerContent || `
        <p class="text-small text-muted">© ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>
      `}
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Common footer with support link
 */
export function getSupportFooter(colorScheme: EmailBaseStyles = brandColors.orange): string {
  return `
    <p>Questions? Message <a href="https://t.me/noahchonlee" style="color: ${colorScheme.primary};">@noahchonlee</a> on Telegram</p>
    <p class="text-small text-muted">© ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>
  `;
}
