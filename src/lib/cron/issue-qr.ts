import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import qrcode from 'qrcode-generator';
import { sendEmail } from '$lib/email/send';
import { getQRDailyEmail } from '$lib/email/templates/qr-daily';
import { todayInPT, endOfDayPT, startOfDayPT } from '$lib/utils/timezone';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import { isServiceDay } from '$lib/utils/service-calendar';

export async function issueDailyQRCodes(config: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  qrPrivateKey: string;
}) {
  const jobStartTime = Date.now();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const today = todayInPT(); // YYYY-MM-DD in Pacific Time

  console.log(`[QR Job] Starting QR issuance for ${today}`);

  // TEMPORARILY DISABLED FOR TESTING: Check if today is a service day (weekday, excluding restaurant closure holidays)
  // if (!isServiceDay(today)) {
  //   const date = new Date(today + 'T12:00:00-08:00');
  //   const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  //   console.log(`[QR Job] Skipping ${dayOfWeek} ${today} - not a service day (weekend or restaurant closed)`);
  //   return { issued: 0, errors: [], skipped: true };
  // }

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
    errors: [] as Array<{ customer_id: string; error: string }>
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

      // Check if QR already exists for this customer + date (race condition check)
      const { data: existingQR } = await supabase
        .from('qr_tokens')
        .select('jti, issued_at')
        .eq('customer_id', customer.id)
        .eq('service_date', today)
        .single();

      let jti: string;
      let jwt: string;

      if (existingQR) {
        // QR already generated by another cron instance - skip generation
        console.log(`[QR Job] QR already exists for customer ${customer.id} on ${today} (issued at ${existingQR.issued_at})`);

        // Re-generate JWT from existing JTI to send in email/telegram
        jti = existingQR.jti;
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

        // Store QR token metadata using INSERT (not UPSERT)
        // This will fail with unique constraint violation if another cron already created it
        const { error: insertError } = await supabase
          .from('qr_tokens')
          .insert({
            customer_id: customer.id,
            service_date: today,
            jti,
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

      // Send QR code to Telegram (only delivery method)
      if (!customer.telegram_user_id) {
        console.log(`[QR Job] Customer ${customer.id} has no telegram_user_id - skipping QR delivery`);
        results.issued++;
        continue;
      }

      // Generate QR code image using qrcode-generator (pure JS, Cloudflare Workers compatible)
      const qr = qrcode(0, 'H'); // 0 = auto type number, 'H' = high error correction
      qr.addData(jwt);
      qr.make();
      const qrCodeDataUrl = qr.createDataURL(10, 2); // cellSize=10, margin=2 (returns data:image/gif;base64,...)

      // Extract base64 content from data URL (strip "data:image/gif;base64," prefix)
      const base64Content = qrCodeDataUrl.replace(/^data:image\/gif;base64,/, '');

      // Send QR code via Telegram Bot API
      try {
        // Convert base64 content to Uint8Array for Telegram photo upload
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const formData = new FormData();
        formData.append('chat_id', customer.telegram_user_id.toString());
        formData.append('photo', new Blob([bytes], { type: 'image/gif' }), 'qr-code.gif');
        formData.append('caption', `🍽️ Your Frontier Meals QR Code\n📅 ${new Date(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\nShow this at the kiosk to get your meal!`);

        const { TELEGRAM_BOT_TOKEN } = await import('$env/static/private');

        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
          {
            method: 'POST',
            body: formData
          }
        );

        if (!telegramResponse.ok) {
          console.error(`[QR Job] Failed to send Telegram QR to customer ${customer.id}:`, await telegramResponse.text());
          throw new Error(`Telegram API error: ${telegramResponse.status}`);
        }

        console.log(`[QR Job] Sent QR to Telegram for customer ${customer.id}`);
      } catch (telegramError) {
        console.error(`[QR Job] Error sending QR to Telegram for customer ${customer.id}:`, telegramError);
        results.errors.push({
          customer_id: customer.id,
          error: `Telegram delivery failed: ${telegramError instanceof Error ? telegramError.message : 'Unknown error'}`
        });
        continue; // Skip to next customer if Telegram fails
      }

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

  const executionTime = Date.now() - jobStartTime;
  console.log(`[QR Job] Complete. Issued: ${results.issued}, Errors: ${results.errors.length}, Time: ${executionTime}ms`);

  // Alert if approaching Cloudflare Pages timeout (30s = 30000ms)
  if (executionTime > 20000) {
    console.warn(`[QR Job] ⚠️  WARNING: Execution time ${executionTime}ms is approaching timeout threshold (30s)`);
  }

  // TODO: If errors > 0, send alert to @noahchonlee via Telegram

  return results;
}
