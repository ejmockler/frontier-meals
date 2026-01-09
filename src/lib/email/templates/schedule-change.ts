/**
 * Schedule Change Notification Email Template
 *
 * Sent to active customers when admins modify the service schedule.
 * Uses teal color scheme (informational, not urgent).
 */

import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  linkStyle,
  infoBoxStyle,
} from './base';

export interface ScheduleChangeEmailData {
  customer_name: string;
  message: string;
  change_type: 'service_pattern' | 'holiday' | 'special_event';
  change_action: 'added' | 'updated' | 'deleted';
  affected_dates: string[]; // Array of YYYY-MM-DD dates
  effective_date?: string; // When the change takes effect (YYYY-MM-DD)
}

/**
 * Format a date string for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Convert plain text message to HTML paragraphs
 * Preserves line breaks as paragraph breaks
 */
function textToHtml(text: string): string {
  return text
    .split(/\n\n+/) // Split on double newlines (paragraphs)
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => `<p style="${styles.p}">${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Get human-readable change type label
 */
function getChangeTypeLabel(changeType: string): string {
  switch (changeType) {
    case 'service_pattern':
      return 'Service Pattern';
    case 'holiday':
      return 'Holiday';
    case 'special_event':
      return 'Special Event';
    default:
      return 'Schedule';
  }
}

/**
 * Generate schedule change notification email
 */
export function getScheduleChangeEmail(data: ScheduleChangeEmailData): { subject: string; html: string } {
  const changeLabel = getChangeTypeLabel(data.change_type);
  const subject = `Schedule Update: ${changeLabel} ${data.change_action}`;
  const scheme = brandColors.teal;

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">&#128197;</div>
    <h1>Schedule Update</h1>
    <p>Your service schedule has changed</p>
  `;

  // Convert admin's plain text message to HTML
  const messageHtml = textToHtml(data.message);

  // Build affected dates list
  let affectedDatesHtml = '';
  if (data.affected_dates.length > 0) {
    const datesList = data.affected_dates
      .slice(0, 10) // Limit to 10 dates in email
      .map(d => `<li style="${styles.li}">${formatDate(d)}</li>`)
      .join('');

    const moreCount = data.affected_dates.length - 10;
    const moreText = moreCount > 0 ? `<li style="margin: ${tokens.spacing.sm} 0; color: ${tokens.text.muted}; font-style: italic;">...and ${moreCount} more date${moreCount === 1 ? '' : 's'}</li>` : '';

    affectedDatesHtml = `
      <div style="margin: ${tokens.spacing.lg} 0;">
        <h3 style="${styles.h3}">Affected Dates:</h3>
        <ul style="margin: 0; padding-left: ${tokens.spacing.lg};">
          ${datesList}
          ${moreText}
        </ul>
      </div>
    `;
  }

  // Effective date info box
  let effectiveDateHtml = '';
  if (data.effective_date) {
    effectiveDateHtml = `
      <div style="${infoBoxStyle('info')}">
        <p style="margin: 0; font-size: ${tokens.fontSize.sm}; color: ${tokens.infoBox.info.text};">
          <strong>Effective:</strong> ${formatDate(data.effective_date)}
        </p>
      </div>
    `;
  }

  const bodyContent = `
    <p style="${styles.pLead}">Hi ${data.customer_name},</p>

    ${messageHtml}

    ${affectedDatesHtml}

    ${effectiveDateHtml}

    <div style="background: ${tokens.bg.subtle}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.md}; margin-top: ${tokens.spacing.xl};">
      <p style="${styles.pMuted}">
        If you have questions about this change, message <a href="https://t.me/noahchonlee" style="${linkStyle(scheme)}">@noahchonlee</a> on Telegram.
      </p>
    </div>
  `;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,
    preheader: `Your Frontier Meals service schedule has been updated.`,
    headerContent,
    bodyContent,
    footerContent: getSupportFooter(scheme)
  });

  return { subject, html };
}
