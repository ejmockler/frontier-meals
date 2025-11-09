import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminSession } from '$lib/auth/session';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, QR_PRIVATE_KEY_BASE64, TELEGRAM_BOT_TOKEN } from '$env/static/private';
import * as jose from 'jose';
import { randomUUID } from '$lib/utils/crypto';
import { todayInPT, endOfDayPT } from '$lib/utils/timezone';
import qrcode from 'qrcode-generator';

export const POST: RequestHandler = async ({ request, cookies }) => {
  // Verify admin session
  const session = await getAdminSession(cookies);
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get service date from request body, default to today
  const body = await request.json().catch(() => ({}));
  const serviceDate = body.serviceDate || todayInPT();

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get admin's customer record (assuming admin has telegram_user_id)
    // For now, we'll use the first active customer with a telegram_user_id as a test
    const { data: testCustomer } = await supabase
      .from('customers')
      .select('*')
      .not('telegram_user_id', 'is', null)
      .limit(1)
      .single();

    if (!testCustomer) {
      return json({ error: 'No customer found with Telegram ID' }, { status: 404 });
    }

    // Decode base64-encoded private key
    const binaryString = atob(QR_PRIVATE_KEY_BASE64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const qrPrivateKey = new TextDecoder().decode(bytes);

    // Generate test QR JWT for the specified service date
    const jti = randomUUID();
    const expiresAt = endOfDayPT(serviceDate);
    console.log('[Admin Test QR] Service date:', serviceDate);
    console.log('[Admin Test QR] Expires at (UTC):', expiresAt.toISOString());
    console.log('[Admin Test QR] Expires at (Unix):', Math.floor(expiresAt.getTime() / 1000));
    console.log('[Admin Test QR] Current time (UTC):', new Date().toISOString());
    console.log('[Admin Test QR] Current time (Unix):', Math.floor(Date.now() / 1000));
    const privateKey = await jose.importPKCS8(qrPrivateKey, 'ES256');

    const jwt = await new jose.SignJWT({
      service_date: serviceDate
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('frontier-meals-kiosk')
      .setSubject(testCustomer.id)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(privateKey);

    // CRITICAL: Write to database so kiosk can verify the token
    // Create entitlement for this date
    await supabase
      .from('entitlements')
      .upsert({
        customer_id: testCustomer.id,
        service_date: serviceDate,
        meals_allowed: 1,
        meals_redeemed: 0
      }, {
        onConflict: 'customer_id,service_date'
      });

    // Check if QR already exists for this customer + date
    const { data: existingQR } = await supabase
      .from('qr_tokens')
      .select('jti, issued_at, used_at')
      .eq('customer_id', testCustomer.id)
      .eq('service_date', serviceDate)
      .single();

    if (existingQR) {
      // If the existing QR was already used, delete it and create a new one
      // If it's unused, we can reuse it or delete and recreate
      console.log('[Admin Test QR] QR already exists, deleting and recreating');
      await supabase
        .from('qr_tokens')
        .delete()
        .eq('customer_id', testCustomer.id)
        .eq('service_date', serviceDate);
    }

    // Store QR token metadata
    const { error: insertError } = await supabase
      .from('qr_tokens')
      .insert({
        customer_id: testCustomer.id,
        service_date: serviceDate,
        jti,
        issued_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        used_at: null
      });

    if (insertError) {
      console.error('[Admin Test QR] Error storing QR token:', insertError);
      return json({ error: 'Failed to store QR token metadata', details: insertError.message }, { status: 500 });
    }

    // Generate QR code image
    const qr = qrcode(0, 'H');
    qr.addData(jwt);
    qr.make();
    const qrCodeDataUrl = qr.createDataURL(10, 2);
    const base64Content = qrCodeDataUrl.replace(/^data:image\/gif;base64,/, '');

    // Send QR code via Telegram
    const binaryStr = atob(base64Content);
    const photoBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      photoBytes[i] = binaryStr.charCodeAt(i);
    }

    const formData = new FormData();
    formData.append('chat_id', testCustomer.telegram_user_id.toString());
    formData.append('photo', new Blob([photoBytes], { type: 'image/gif' }), 'test-qr.gif');
    formData.append('caption', `🧪 Test QR Code from Admin\n📅 Service Date: ${new Date(serviceDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n⏰ Expires: ${expiresAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'short' })} PT\n\nThis is a test QR code sent by the admin.`);

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!telegramResponse.ok) {
      const errorText = await telegramResponse.text();
      console.error('[Admin Test QR] Telegram error:', errorText);
      return json({ error: 'Failed to send via Telegram' }, { status: 500 });
    }

    // Decode JWT to verify claims
    const decoded = jose.decodeJwt(jwt);

    return json({
      success: true,
      message: `Test QR sent to ${testCustomer.email} via Telegram for ${serviceDate}`,
      customerId: testCustomer.id,
      serviceDate,
      debug: {
        expiresAt_iso: expiresAt.toISOString(),
        expiresAt_unix: Math.floor(expiresAt.getTime() / 1000),
        currentTime_iso: new Date().toISOString(),
        currentTime_unix: Math.floor(Date.now() / 1000),
        jwt_claims: decoded,
        jwt_preview: jwt.substring(0, 50) + '...'
      }
    });
  } catch (error) {
    console.error('[Admin Test QR] Error:', error);
    return json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
