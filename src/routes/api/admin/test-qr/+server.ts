import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminSession } from '$lib/auth/session';
import { extractCSRFToken, validateCSRFToken } from '$lib/auth/csrf';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, QR_PRIVATE_KEY_BASE64 } from '$env/static/private';
import * as jose from 'jose';
import { randomUUID } from '$lib/utils/crypto';
import { todayInPT, endOfDayPT } from '$lib/utils/timezone';
import qrcode from 'qrcode-generator';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { generateShortCode } from '$lib/utils/short-code';

export const POST: RequestHandler = async ({ request, cookies }) => {
  // Verify admin session
  const session = await getAdminSession(cookies);
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate CSRF token
  const csrfToken = extractCSRFToken(request);
  if (!await validateCSRFToken(session.sessionId, csrfToken)) {
    return json({ error: 'Invalid CSRF token' }, { status: 403 });
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
    // Get first customer for test (no longer needs telegram_user_id since we send via email)
    const { data: testCustomer } = await supabase
      .from('customers')
      .select('*')
      .limit(1)
      .single();

    if (!testCustomer) {
      return json({ error: 'No customer found' }, { status: 404 });
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

    // Generate short code for QR (same as production)
    const shortCode = generateShortCode(10);

    // Store QR token metadata with short code and JWT
    const { error: insertError } = await supabase
      .from('qr_tokens')
      .insert({
        customer_id: testCustomer.id,
        service_date: serviceDate,
        jti,
        short_code: shortCode,
        jwt_token: jwt,
        issued_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        used_at: null
      });

    if (insertError) {
      console.error('[Admin Test QR] Error storing QR token:', insertError);
      return json({ error: 'Failed to store QR token metadata', details: insertError.message }, { status: 500 });
    }

    // Generate QR code image with short code (same as production)
    const qr = qrcode(0, 'M'); // Medium error correction
    qr.addData(shortCode); // Use short code, not JWT!
    qr.make();
    const qrCodeDataUrl = qr.createDataURL(12, 4); // Larger cells for easier scanning

    // Extract base64 content from data URL (format: "data:image/gif;base64,...")
    const base64Content = qrCodeDataUrl.split(',')[1];

    // Send QR code via email (same as production)
    // Derive day_name and date_formatted for DB template compatibility
    const parsedDate = new Date(serviceDate);
    const dayName = parsedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dateFormatted = parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const { subject, html } = await renderTemplate(
      'qr_daily',
      {
        customer_name: testCustomer.name || 'there',
        service_date: serviceDate,
        qr_code_base64: base64Content,
        day_name: dayName,
        date_formatted: dateFormatted
      },
      SUPABASE_SERVICE_ROLE_KEY
    );

    await sendEmail({
      to: testCustomer.email,
      subject: `[TEST] ${subject}`,
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
        { name: 'category', value: 'qr_daily_test' },
        { name: 'customer_id', value: testCustomer.id },
        { name: 'service_date', value: serviceDate }
      ],
      idempotencyKey: `qr_daily_test/${testCustomer.id}/${serviceDate}/${Date.now()}`
    });

    console.log('[Admin Test QR] Sent test QR email to', testCustomer.email);

    // Decode JWT to verify claims
    const decoded = jose.decodeJwt(jwt);

    return json({
      success: true,
      message: `Test QR sent to ${testCustomer.email} via EMAIL for ${serviceDate}`,
      customerId: testCustomer.id,
      customerEmail: testCustomer.email,
      serviceDate,
      shortCode,
      debug: {
        expiresAt_iso: expiresAt.toISOString(),
        expiresAt_unix: Math.floor(expiresAt.getTime() / 1000),
        currentTime_iso: new Date().toISOString(),
        currentTime_unix: Math.floor(Date.now() / 1000),
        jwt_claims: decoded,
        jwt_preview: jwt.substring(0, 50) + '...',
        short_code: shortCode
      }
    });
  } catch (error) {
    console.error('[Admin Test QR] Error:', error);
    return json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
