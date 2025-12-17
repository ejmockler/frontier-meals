import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import qrcode from 'qrcode-generator';
import { sendEmail } from '$lib/email/send';
import { getQRDailyEmail } from '$lib/email/templates/qr-daily';
import { todayInPT, endOfDayPT, startOfDayPT } from '$lib/utils/timezone';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { isServiceDay } from '$lib/utils/service-calendar';
import { generateShortCode } from '$lib/utils/short-code';
import { sendAdminAlert, formatJobErrorAlert } from '$lib/utils/alerts';

export async function issueDailyQRCodes(config: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  qrPrivateKey: string;
}) {
  const jobStartTime = Date.now();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const today = todayInPT(); // YYYY-MM-DD in Pacific Time

  console.log(`[QR Job] Starting QR issuance for ${today}`);

  // Check if today is a service day (configured via admin panel + database)
  if (!(await isServiceDay(today))) {
    const date = new Date(today + 'T12:00:00-08:00');
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`[QR Job] Skipping ${dayOfWeek} ${today} - not a service day (weekend, holiday, or special closure)`);
    return { issued: 0, errors: [], skipped: true };
  }

  // CRITICAL SAFETY CHECK: Alert on subscriptions with NULL period dates
  const { data: nullDateSubs, error: nullCheckError } = await supabase
    .from('subscriptions')
    .select('id, stripe_subscription_id, customers(email)')
    .eq('status', 'active')
    .or('current_period_start.is.null,current_period_end.is.null');

  if (nullCheckError) {
    console.error('[QR Job] Error checking for NULL dates:', nullCheckError);
  } else if (nullDateSubs && nullDateSubs.length > 0) {
    const alertMessage = `🚨 CRITICAL: ${nullDateSubs.length} active subscriptions have NULL period dates!\n\nThese customers will NOT receive QR codes:\n${nullDateSubs.map(s => {
      const customer = Array.isArray(s.customers) ? s.customers[0] : s.customers;
      return `- ${customer?.email} (${s.stripe_subscription_id})`;
    }).join('\n')}`;

    console.error('[QR Job] NULL DATE ALERT:', alertMessage);

    // Send alert via Telegram if bot token is available
    try {
      const { TELEGRAM_BOT_TOKEN } = await import('$env/static/private');
      const NOAH_TELEGRAM_ID = '1413464598'; // @noahchonlee

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: NOAH_TELEGRAM_ID,
          text: alertMessage,
          parse_mode: 'Markdown'
        })
      });
    } catch (alertError) {
      console.error('[QR Job] Failed to send NULL date alert:', alertError);
    }
  }

  // Get all active subscriptions where today falls within the PAID period
  // Critical: This prevents QR issuance if invoice payment failed
  // Use proper Pacific Time day boundaries for comparison
  const todayStartPT = startOfDayPT(today); // Midnight PT as UTC timestamp
  const todayEndPT = endOfDayPT(today);     // 11:59:59.999 PM PT as UTC timestamp

  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('*, customers(*)')
    .eq('status', 'active')
    .lte('current_period_start', todayEndPT.toISOString())   // Period started before end of today PT
    .gte('current_period_end', todayStartPT.toISOString());  // Period ends after start of today PT

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
    errors: [] as Array<{ customer_id: string; email?: string; error: string }>
  };

  // Import private key ONCE outside loop (optimization: saves 5-10ms per customer)
  const startTime = Date.now();
  const privateKey = await jose.importPKCS8(config.qrPrivateKey, 'ES256');
  console.log(`[QR Job] Key imported in ${Date.now() - startTime}ms`);

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
      // CRITICAL: Only set meals_redeemed on INSERT, not UPDATE
      // If customer already redeemed their meal, we must NOT reset the counter
      // We only update meals_allowed (in case skip status changed)
      const { data: existingEntitlement } = await supabase
        .from('entitlements')
        .select('meals_redeemed')
        .eq('customer_id', customer.id)
        .eq('service_date', today)
        .single();

      if (existingEntitlement) {
        // Entitlement exists - only update meals_allowed, preserve meals_redeemed
        await supabase
          .from('entitlements')
          .update({
            meals_allowed: mealsAllowed
          })
          .eq('customer_id', customer.id)
          .eq('service_date', today);
      } else {
        // New entitlement - insert with meals_redeemed = 0
        await supabase
          .from('entitlements')
          .insert({
            customer_id: customer.id,
            service_date: today,
            meals_allowed: mealsAllowed,
            meals_redeemed: 0
          });
      }

      // Skip QR generation if meal was skipped
      if (mealsAllowed === 0) {
        console.log(`[QR Job] Skipping QR for customer ${customer.id} - date skipped`);
        continue;
      }

      // Check if QR already exists for this customer + date (race condition check)
      const { data: existingQR } = await supabase
        .from('qr_tokens')
        .select('jti, issued_at')
        .eq('customer_id', customer.id)
        .eq('service_date', today)
        .single();

      let jti: string;
      let jwt: string;
      let shortCode: string;

      if (existingQR) {
        // QR already generated by another cron instance - skip generation
        console.log(`[QR Job] QR already exists for customer ${customer.id} on ${today} (issued at ${existingQR.issued_at})`);

        // Fetch existing short code and JWT
        const { data: fullQR } = await supabase
          .from('qr_tokens')
          .select('jti, short_code, jwt_token')
          .eq('customer_id', customer.id)
          .eq('service_date', today)
          .single();

        if (!fullQR) {
          throw new Error('QR token exists but cannot be retrieved');
        }

        jti = fullQR.jti;
        shortCode = fullQR.short_code || '';
        jwt = fullQR.jwt_token || '';

        // If missing short code or JWT (legacy data), regenerate
        if (!shortCode || !jwt) {
          const expiresAt = endOfDayPT(today);

          jwt = await new jose.SignJWT({
            service_date: today
          })
            .setProtectedHeader({ alg: 'ES256' })
            .setIssuer('frontier-meals-kiosk')
            .setSubject(customer.id)
            .setJti(jti)
            .setIssuedAt()
            .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
            .sign(privateKey);

          shortCode = generateShortCode(10); // 10 chars for better security/collision resistance

          // Update with short code and JWT
          await supabase
            .from('qr_tokens')
            .update({
              short_code: shortCode,
              jwt_token: jwt
            })
            .eq('customer_id', customer.id)
            .eq('service_date', today);

          console.log(`[QR Job] Updated legacy QR token with short code for customer ${customer.id}`);
        }
      } else {
        // Generate new QR code JWT
        jti = randomUUID();
        const expiresAt = endOfDayPT(today); // 11:59:59.999 PM PT (handles PST/PDT automatically)

        jwt = await new jose.SignJWT({
          service_date: today
        })
          .setProtectedHeader({ alg: 'ES256' })
          .setIssuer('frontier-meals-kiosk')
          .setSubject(customer.id)
          .setJti(jti)
          .setIssuedAt()
          .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
          .sign(privateKey);

        // Generate short code for QR
        shortCode = generateShortCode(10); // 10 chars = ~58 bits entropy (32^10)

        // Store QR token metadata using INSERT (not UPSERT)
        // This will fail with unique constraint violation if another cron already created it
        const { error: insertError } = await supabase
          .from('qr_tokens')
          .insert({
            customer_id: customer.id,
            service_date: today,
            jti,
            short_code: shortCode,
            jwt_token: jwt,
            issued_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            used_at: null
          });

        if (insertError) {
          // Check if it's a unique constraint violation (code 23505)
          if (insertError.code === '23505') {
            console.log(`[QR Job] Race condition detected for customer ${customer.id} - QR already created by another instance`);

            // Fetch the winning instance's JTI so we can still send email
            const { data: winningQR } = await supabase
              .from('qr_tokens')
              .select('jti')
              .eq('customer_id', customer.id)
              .eq('service_date', today)
              .single();

            if (winningQR) {
              jti = winningQR.jti;
              console.log(`[QR Job] Using JTI ${jti} from winning instance`);
              // Fall through to email/telegram send - don't skip the customer!
            } else {
              console.error(`[QR Job] Race condition but can't find winning QR token for customer ${customer.id}`);
              throw new Error('Race condition: QR token exists but cannot be retrieved');
            }
          } else {
            // Other database error - throw to be caught by outer error handler
            throw insertError;
          }
        } else {
          console.log(`[QR Job] Created new QR token for customer ${customer.id}`);
        }
      }

      // Generate QR code image using qrcode-generator (pure JS, Cloudflare Workers compatible)
      // IMPORTANT: Use short code instead of JWT for much simpler, easier-to-scan QR codes
      const qr = qrcode(0, 'M'); // 0 = auto type number, 'M' = medium error correction (lower than 'H' since code is shorter)
      qr.addData(shortCode);
      qr.make();
      const qrCodeDataUrl = qr.createDataURL(12, 4); // cellSize=12, margin=4 (larger cells for easier scanning)

      // Extract base64 content from data URL (format: "data:image/gif;base64,...")
      const base64Content = qrCodeDataUrl.split(',')[1];

      // Send QR code via email
      try {
        const { subject, html } = getQRDailyEmail({
          customer_name: customer.name || 'there',
          service_date: today,
          qr_code_base64: base64Content
        });

        await sendEmail({
          to: customer.email,
          subject,
          html,
          attachments: [
            {
              filename: 'qr-code.gif',
              content: base64Content,
              contentType: 'image/gif',
              inlineContentId: 'qr-code' // CORRECT property name per Resend SDK
            }
          ],
          tags: [
            { name: 'category', value: 'qr_daily' },
            { name: 'customer_id', value: customer.id },
            { name: 'service_date', value: today }
          ],
          idempotencyKey: `qr_daily/${customer.id}/${today}`
        });

        console.log(`[QR Job] Sent QR email to ${customer.email}`);
      } catch (emailError) {
        console.error(`[QR Job] Error sending QR email to customer ${customer.id}:`, emailError);
        results.errors.push({
          customer_id: customer.id,
          email: customer.email,
          error: `Email delivery failed: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`
        });
        continue; // Skip to next customer if email fails
      }

      results.issued++;
      console.log(`[QR Job] Issued QR for customer ${customer.id} (${customer.email})`);

    } catch (error) {
      console.error(`[QR Job] Error issuing QR for customer ${customer.id}:`, error);
      results.errors.push({
        customer_id: customer.id,
        email: customer.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const executionTime = Date.now() - jobStartTime;
  console.log(`[QR Job] Complete. Issued: ${results.issued}, Errors: ${results.errors.length}, Time: ${executionTime}ms`);

  // Alert if approaching Cloudflare Pages timeout (30s = 30000ms)
  if (executionTime > 20000) {
    console.warn(`[QR Job] ⚠️  WARNING: Execution time ${executionTime}ms is approaching timeout threshold (30s)`);
  }

  // Send alert if there were errors
  if (results.errors.length > 0) {
    const alertMessage = formatJobErrorAlert({
      jobName: 'QR Issuance Job',
      date: today,
      errorCount: results.errors.length,
      totalProcessed: subscriptions.length,
      errors: results.errors,
      maxErrorsToShow: 5
    });

    await sendAdminAlert(alertMessage);
    console.log(`[QR Job] Sent error alert to admin - ${results.errors.length} errors`);
  }

  return results;
}
