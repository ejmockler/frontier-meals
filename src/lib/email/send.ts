import { Resend } from 'resend';
import { RESEND_API_KEY } from '$env/static/private';

const resend = new Resend(RESEND_API_KEY);

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_id?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
  idempotencyKey?: string;
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

  const headers: any = {};
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  try {
    const response = await resend.emails.send(payload);
    return { success: true, data: response };
  } catch (error) {
    console.error('Resend email error:', error);
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
