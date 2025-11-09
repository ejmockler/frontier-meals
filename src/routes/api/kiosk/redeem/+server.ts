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

    // Extract first name only
    const firstName = redemptionResult.customer_name?.split(' ')[0] || redemptionResult.customer_name;

    return json({
      success: true,
      customer: {
        name: firstName,
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

      // Log RPC business rule failure for debugging
      console.error('[Kiosk Redeem] RPC business rule failure:', {
        error_code: redemptionResult.error_code,
        error_message: redemptionResult.error_message,
        customer_id: customerId,
        service_date: serviceDate,
        jti: jti
      });

      return json(
        {
          error: redemptionResult.error_message,
          code: redemptionResult.error_code,
          debug: {
            customer_id: customerId,
            service_date: serviceDate,
            jti: jti.substring(0, 8) + '...' // Partial JTI for debugging
          }
        },
        { status: statusCode }
      );
    }

    // Success - return customer data and redemption info
    // Extract first name only (split on space, take first part)
    const firstName = redemptionResult.customer_name?.split(' ')[0] || redemptionResult.customer_name;

    return json({
      success: true,
      customer: {
        name: firstName,
        dietary_flags: redemptionResult.customer_dietary_flags
      },
      redemption: {
        id: redemptionResult.redemption_id,
        redeemed_at: new Date().toISOString() // Approximate - actual time set by DB
      }
    });
  } catch (error) {
    // Log ALL errors to console.error (not suppressed by Cloudflare)
    console.error('[Kiosk Redeem] JWT verification error:', {
      type: error?.constructor?.name,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    if (error instanceof jose.errors.JWTExpired) {
      const decoded = jose.decodeJwt(qrToken);
      console.error('[Kiosk Redeem] Expired JWT claims:', decoded);
      return json({
        error: 'QR code expired',
        code: 'EXPIRED',
        debug: {
          exp: decoded.exp,
          exp_iso: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
          current_time: Math.floor(Date.now() / 1000),
          current_time_iso: new Date().toISOString()
        }
      }, { status: 400 });
    }

    // Return detailed error for debugging
    const errorDetails = {
      type: error?.constructor?.name || 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      qrTokenPreview: qrToken?.substring(0, 50) + '...'
    };

    console.error('[Kiosk Redeem] Returning error response:', errorDetails);

    return json({
      error: 'Invalid QR code',
      code: 'INVALID_TOKEN',
      debug: errorDetails
    }, { status: 400 });
  }
};
