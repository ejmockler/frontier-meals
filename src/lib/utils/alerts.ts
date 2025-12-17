/**
 * Admin Alert System
 * Sends critical error notifications to admin via Telegram
 */

const NOAH_TELEGRAM_ID = '1413464598'; // @noahchonlee

interface AlertContext {
  [key: string]: unknown;
}

/**
 * Send an alert to admin via Telegram
 * Uses Markdown formatting for better readability
 */
export async function sendAdminAlert(
  message: string,
  context?: AlertContext
): Promise<void> {
  try {
    // Import bot token from env (dynamic to support both server-side and edge)
    const { TELEGRAM_BOT_TOKEN } = await import('$env/static/private');

    // Format alert with context if provided
    let alertText = message;

    if (context) {
      alertText += '\n\n*Context:*';
      for (const [key, value] of Object.entries(context)) {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const formattedValue = typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
        alertText += `\n• ${formattedKey}: ${formattedValue}`;
      }
    }

    // Send to Telegram
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: NOAH_TELEGRAM_ID,
        text: alertText,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Alert] Failed to send Telegram alert:', {
        status: response.status,
        error: errorText
      });
    }
  } catch (error) {
    // Log but don't throw - alerting failures should not crash jobs
    console.error('[Alert] Error sending admin alert:', error);
  }
}

/**
 * Format a job error alert for cron jobs
 */
export function formatJobErrorAlert(params: {
  jobName: string;
  date: string;
  errorCount: number;
  totalProcessed: number;
  errors: Array<{ customer_id?: string; email?: string; error: string }>;
  maxErrorsToShow?: number;
}): string {
  const { jobName, date, errorCount, totalProcessed, errors, maxErrorsToShow = 5 } = params;

  let alert = `🚨 *${jobName} Alert*\n\n`;
  alert += `*Date*: ${date}\n`;
  alert += `*Errors*: ${errorCount} of ${totalProcessed}\n\n`;

  if (errors.length > 0) {
    alert += `*Affected customers*:\n`;
    const errorsToShow = errors.slice(0, maxErrorsToShow);

    for (const err of errorsToShow) {
      const identifier = err.email || err.customer_id || 'Unknown';
      // Escape special markdown characters in error messages
      const errorMsg = err.error
        .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
        .substring(0, 100); // Truncate long errors
      alert += `• ${identifier}: ${errorMsg}\n`;
    }

    if (errors.length > maxErrorsToShow) {
      alert += `\n_...and ${errors.length - maxErrorsToShow} more_\n`;
    }
  }

  alert += '\n_Job completed with partial success_';

  return alert;
}
