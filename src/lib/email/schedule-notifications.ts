/**
 * Schedule Change Notification System
 *
 * Sends batch notifications to active customers when
 * the service schedule is modified by an admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendBatchEmails, type EmailOptions } from './send';
import { getScheduleChangeEmail, type ScheduleChangeEmailData } from './templates/schedule-change';

// Re-export utility functions from shared module for convenience
export {
  calculateAffectedDatesForPatternChange,
  calculateAffectedDatesForException
} from '$lib/utils/schedule-dates';

export interface ScheduleChangeNotificationParams {
  supabase: SupabaseClient;
  changeType: 'service_pattern' | 'holiday' | 'special_event';
  changeAction: 'added' | 'updated' | 'deleted';
  message: string;
  affectedDates: string[]; // YYYY-MM-DD format
  effectiveDate?: string; // YYYY-MM-DD format
}

export interface ScheduleChangeNotificationResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

/**
 * Get count of active customers for the notification preview
 */
export async function getActiveCustomerCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('subscriptions')
    .select('*, customers!inner(id)', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    console.error('[Schedule Notify] Error counting active customers:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Send schedule change notification to all active customers
 *
 * Uses batch send for efficiency. Resend supports up to 100 emails per batch.
 */
export async function sendScheduleChangeNotification(
  params: ScheduleChangeNotificationParams
): Promise<ScheduleChangeNotificationResult> {
  const { supabase, changeType, changeAction, message, affectedDates, effectiveDate } = params;

  console.log(`[Schedule Notify] Starting notification for ${changeType} ${changeAction}`);

  // Get all active subscriptions with customer info
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('id, customers(id, email, name)')
    .eq('status', 'active');

  if (subError) {
    console.error('[Schedule Notify] Error fetching subscriptions:', subError);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [{ email: 'N/A', error: `Database error: ${subError.message}` }]
    };
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('[Schedule Notify] No active subscriptions found');
    return { success: true, sent: 0, failed: 0, errors: [] };
  }

  // Extract unique customers (in case of multiple subscriptions per customer)
  const customerMap = new Map<string, { id: string; email: string; name: string | null }>();

  for (const sub of subscriptions) {
    const customer = Array.isArray(sub.customers) ? sub.customers[0] : sub.customers;
    if (customer && customer.email && !customerMap.has(customer.id)) {
      customerMap.set(customer.id, {
        id: customer.id,
        email: customer.email,
        name: customer.name
      });
    }
  }

  const customers = Array.from(customerMap.values());
  console.log(`[Schedule Notify] Sending to ${customers.length} unique customers`);

  // Generate emails for each customer
  const emails: EmailOptions[] = customers.map((customer) => {
    const emailData: ScheduleChangeEmailData = {
      customer_name: customer.name || 'there',
      message,
      change_type: changeType,
      change_action: changeAction,
      affected_dates: affectedDates,
      effective_date: effectiveDate
    };

    const { subject, html } = getScheduleChangeEmail(emailData);

    return {
      to: customer.email,
      subject,
      html,
      tags: [
        { name: 'category', value: 'schedule_change' },
        { name: 'customer_id', value: customer.id },
        { name: 'change_type', value: changeType },
        { name: 'change_action', value: changeAction }
      ]
    };
  });

  // Send in batches of 100 (Resend's limit)
  const BATCH_SIZE = 100;
  const results: ScheduleChangeNotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    console.log(`[Schedule Notify] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} emails)`);

    const batchResult = await sendBatchEmails(batch);

    if (batchResult.success) {
      results.sent += batch.length;
    } else {
      results.failed += batch.length;
      results.success = false;

      // Log batch failure
      const errorMsg = batchResult.error instanceof Error ? batchResult.error.message : 'Unknown error';
      batch.forEach((email) => {
        const to = Array.isArray(email.to) ? email.to[0] : email.to;
        results.errors.push({ email: to, error: errorMsg });
      });
    }
  }

  console.log(`[Schedule Notify] Complete. Sent: ${results.sent}, Failed: ${results.failed}`);

  return results;
}

