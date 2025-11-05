import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, QR_PUBLIC_KEY } from '$env/static/private';
import * as jose from 'jose';
import { validateKioskSession } from '$lib/auth/kiosk';
import { IS_DEMO_MODE, bypassMealRedemption } from '$lib/demo';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request }) => {
  const { qrToken, kioskSessionToken } = await request.json();

  if (!qrToken || !kioskSessionToken) {
    return json({ error: 'Missing required fields' }, { status: 400 });
  }

  const kioskSession = await validateKioskSession(kioskSessionToken);
  if (!kioskSession.valid) {
    return json({ error: 'Invalid kiosk session' }, { status: 401 });
  }

  // Demo mode: bypass JWT verification and database operations
  if (IS_DEMO_MODE) {
    const redemptionResult = bypassMealRedemption(qrToken);

    if (!redemptionResult.success) {
      const statusCode = redemptionResult.error_code === 'CUSTOMER_NOT_FOUND' ? 404 : 400;
      return json(
        {
          error: redemptionResult.error_message,
          code: redemptionResult.error_code
        },
        { status: statusCode }
      );
    }

    return json({
      success: true,
      customer: {
        name: redemptionResult.customer_name,
        dietary_flags: redemptionResult.customer_dietary_flags
      },
      redemption: {
        id: redemptionResult.redemption_id,
        redeemed_at: new Date().toISOString()
      }
    });
  }

  try {
    // Verify JWT signature and extract claims
    const publicKey = await jose.importSPKI(QR_PUBLIC_KEY, 'ES256');
    const { payload } = await jose.jwtVerify(qrToken, publicKey, {
      issuer: 'frontier-meals-kiosk'
    });

    const customerId = payload.sub as string;
    const serviceDate = payload.service_date as string;
    const jti = payload.jti as string;

    // Call atomic redemption function to prevent race conditions
    const { data: result, error: rpcError } = await supabase.rpc('redeem_meal', {
      p_customer_id: customerId,
      p_service_date: serviceDate,
      p_kiosk_id: kioskSession.kiosk_id,
      p_qr_token_jti: jti,
      p_kiosk_location: kioskSession.location
    }).single();

    if (rpcError) {
      console.error('[Kiosk Redeem] RPC error:', rpcError);
      return json({ error: 'Database error' }, { status: 500 });
    }

    // Type assertion for RPC result
    const redemptionResult = result as {
      success: boolean;
      error_code?: string;
      error_message?: string;
      customer_name?: string;
      customer_dietary_flags?: string[];
      redemption_id?: string;
    };

    // Check if redemption succeeded
    if (!redemptionResult.success) {
      const statusCode = redemptionResult.error_code === 'CUSTOMER_NOT_FOUND' ? 404 : 400;
      return json(
        {
          error: redemptionResult.error_message,
          code: redemptionResult.error_code
        },
        { status: statusCode }
      );
    }

    // Success - return customer data and redemption info
    return json({
      success: true,
      customer: {
        name: redemptionResult.customer_name,
        dietary_flags: redemptionResult.customer_dietary_flags
      },
      redemption: {
        id: redemptionResult.redemption_id,
        redeemed_at: new Date().toISOString() // Approximate - actual time set by DB
      }
    });
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return json({ error: 'QR code expired', code: 'EXPIRED' }, { status: 400 });
    }
    return json({ error: 'Invalid QR code', code: 'INVALID_TOKEN' }, { status: 400 });
  }
};
