import { Resend } from 'resend';
import { RESEND_API_KEY } from '$env/static/private';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const resend = new Resend(RESEND_API_KEY);

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string; // MIME type (e.g., 'image/png')
    inlineContentId?: string; // For CID embedding (not contentId!)
  }>;
  tags?: Array<{ name: string; value: string }>;
  idempotencyKey?: string;

  // Optional Supabase client for retry queue
  // If not provided, failures will NOT be queued (backward compatible)
  supabase?: SupabaseClient;
}

/**
 * Calculate next retry time using exponential backoff
 * Attempt 1: 5 minutes
 * Attempt 2: 15 minutes
 * Attempt 3: 60 minutes (1 hour)
 * Attempt 4: 240 minutes (4 hours)
 */
function calculateNextRetry(attemptCount: number): Date {
  const delayMinutes = [5, 15, 60, 240];
  const delay = delayMinutes[attemptCount] || 240; // Default to 4 hours if beyond array
  return new Date(Date.now() + delay * 60 * 1000);
}

export async function sendEmail(options: EmailOptions) {
  const payload: any = {
    from: options.from || 'Frontier Meals <meals@frontiermeals.com>',
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html
  };

  if (options.attachments) {
    payload.attachments = options.attachments;
  }

  if (options.tags) {
    payload.tags = options.tags;
  }

  try {
    // Pass idempotency key as second parameter if provided
    // This ensures Resend won't send duplicate emails if the same key is used
    const sendOptions = options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : undefined;

    const response = await resend.emails.send(payload, sendOptions);
    return { success: true, data: response };
  } catch (error) {
    console.error('[Email] Resend error:', error);

    // Queue for retry if Supabase client provided
    if (options.supabase) {
      try {
        const category = options.tags?.find(t => t.name === 'category')?.value || 'unknown';
        const recipientEmail = Array.isArray(options.to) ? options.to[0] : options.to;

        await options.supabase.from('email_retry').insert({
          recipient_email: recipientEmail,
          subject: options.subject,
          html_body: options.html,
          category,
          idempotency_key: options.idempotencyKey || null,
          attempt_count: 0,
          max_attempts: 4,
          next_retry_at: calculateNextRetry(0).toISOString(),
          last_error: error instanceof Error ? error.message : 'Unknown error',
          status: 'pending',
          tags: options.tags || [],
          metadata: {
            from: payload.from,
            attachments_count: options.attachments?.length || 0
          }
        });

        console.log('[Email] Queued for retry:', { recipient: recipientEmail, category });
      } catch (queueError) {
        console.error('[Email] Failed to queue retry:', queueError);
        // Don't throw - we already failed to send, no need to crash the calling code
      }
    }

    return { success: false, error };
  }
}

export async function sendBatchEmails(emails: EmailOptions[]) {
  const payload = emails.map(email => ({
    from: email.from || 'Frontier Meals <meals@frontiermeals.com>',
    to: Array.isArray(email.to) ? email.to : [email.to],
    subject: email.subject,
    html: email.html,
    attachments: email.attachments,
    tags: email.tags
  }));

  try {
    const response = await resend.batch.send(payload);
    return { success: true, data: response };
  } catch (error) {
    console.error('Resend batch email error:', error);
    return { success: false, error };
  }
}
