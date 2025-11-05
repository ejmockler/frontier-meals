import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import QRCode from 'qrcode';
import { sendEmail } from '$lib/email/send';
import { getQRDailyEmail } from '$lib/email/templates/qr-daily';
import { todayInPT, endOfDayPT } from '$lib/utils/timezone';
import * as crypto from 'crypto';

export async function issueDailyQRCodes(config: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  qrPrivateKey: string;
}) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const today = todayInPT(); // YYYY-MM-DD in Pacific Time

  console.log(`[QR Job] Starting QR issuance for ${today}`);

  // Get all active subscriptions where today falls within the PAID period
  // Critical: This prevents QR issuance if invoice payment failed
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('*, customers(*)')
    .eq('status', 'active')
    .lte('current_period_start', today)  // Period has started
    .gte('current_period_end', today);   // Period hasn't ended

  if (subError) {
    console.error('[QR Job] Error fetching subscriptions:', subError);
    throw subError;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('[QR Job] No active subscriptions found');
    return { issued: 0, errors: [] };
  }

  console.log(`[QR Job] Found ${subscriptions.length} active subscriptions`);

  const results = {
    issued: 0,
    errors: [] as Array<{ customer_id: string; error: string }>
  };

  for (const subscription of subscriptions) {
    const customer = Array.isArray(subscription.customers)
      ? subscription.customers[0]
      : subscription.customers;

    if (!customer) {
      console.error(`[QR Job] No customer found for subscription ${subscription.id}`);
      continue;
    }

    try {
      // Check if customer has skipped this date
      const { data: skip } = await supabase
        .from('skips')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('skip_date', today)
        .single();

      const mealsAllowed = skip ? 0 : 1;

      // Upsert entitlement for today
      await supabase
        .from('entitlements')
        .upsert({
          customer_id: customer.id,
          service_date: today,
          meals_allowed: mealsAllowed,
          meals_redeemed: 0
        }, {
          onConflict: 'customer_id,service_date'
        });

      // Skip QR generation if meal was skipped
      if (mealsAllowed === 0) {
        console.log(`[QR Job] Skipping QR for customer ${customer.id} - date skipped`);
        continue;
      }

      // Generate QR code JWT
      const jti = crypto.randomUUID();
      const expiresAt = endOfDayPT(today); // 11:59:59.999 PM PT (handles PST/PDT automatically)

      const privateKey = await jose.importPKCS8(config.qrPrivateKey, 'ES256');

      const jwt = await new jose.SignJWT({
        service_date: today
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer('frontier-meals-kiosk')
        .setSubject(customer.id)
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(privateKey);

      // Store QR token metadata
      await supabase
        .from('qr_tokens')
        .upsert({
          customer_id: customer.id,
          service_date: today,
          jti,
          issued_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          used_at: null
        }, {
          onConflict: 'customer_id,service_date'
        });

      // Generate QR code image (base64 data URL)
      const qrCodeDataUrl = await QRCode.toDataURL(jwt, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Send email with QR code
      const emailTemplate = getQRDailyEmail({
        customer_name: customer.name,
        service_date: today,
        qr_code_data_url: qrCodeDataUrl
      });

      await sendEmail({
        to: customer.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        tags: [
          { name: 'category', value: 'qr_daily' },
          { name: 'service_date', value: today },
          { name: 'customer_id', value: customer.id }
        ],
        idempotencyKey: `qr_daily/${today}/${customer.id}`
      });

      results.issued++;
      console.log(`[QR Job] Issued QR for customer ${customer.id} (${customer.email})`);

    } catch (error) {
      console.error(`[QR Job] Error issuing QR for customer ${customer.id}:`, error);
      results.errors.push({
        customer_id: customer.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  console.log(`[QR Job] Complete. Issued: ${results.issued}, Errors: ${results.errors.length}`);

  // TODO: If errors > 0, send alert to @noahchonlee via Telegram

  return results;
}
