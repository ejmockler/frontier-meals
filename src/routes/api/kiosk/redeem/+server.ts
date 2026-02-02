import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, QR_PUBLIC_KEY } from '$env/static/private';
import * as jose from 'jose';
import { validateKioskSessionWithRevocation } from '$lib/auth/kiosk';
import { isValidShortCode, normalizeShortCode } from '$lib/utils/short-code';
import { checkRateLimit, RateLimitKeys } from '$lib/utils/rate-limit';

// =============================================================================
// Configuration Constants
// =============================================================================

/** Maximum redemption attempts per kiosk session within the rate limit window */
const RATE_LIMIT_MAX_REQUESTS = 10;

/** Rate limit window duration in minutes */
const RATE_LIMIT_WINDOW_MINUTES = 1;

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request }) => {
  let qrToken: string;
  let kioskSessionToken: string;
  try {
    const body = await request.json();
    qrToken = body.qrToken;
    kioskSessionToken = body.kioskSessionToken;
  } catch {
    return json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!qrToken || !kioskSessionToken) {
    return json({ error: 'Missing required fields', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  // C1: Validate kiosk session with revocation check
  // This verifies JWT signature AND checks if session has been revoked in the database
  const kioskSession = await validateKioskSessionWithRevocation(kioskSessionToken, supabase);
  if (!kioskSession.valid) {
    // W11: Include error code for specific error handling
    const errorMessage = kioskSession.error_code === 'SESSION_REVOKED'
      ? 'Kiosk session has been revoked'
      : kioskSession.error_code === 'SESSION_EXPIRED'
        ? 'Kiosk session has expired'
        : 'Invalid kiosk session';

    return json({
      error: errorMessage,
      code: kioskSession.error_code || 'INVALID_SESSION'
    }, { status: 401 });
  }

  // Rate limiting per kiosk session to prevent brute force attacks on QR codes
  const rateLimitResult = await checkRateLimit(supabase, {
    key: RateLimitKeys.kiosk(kioskSessionToken),
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMinutes: RATE_LIMIT_WINDOW_MINUTES
  });

  if (!rateLimitResult.allowed) {
    console.warn('[Kiosk Redeem] Rate limit exceeded:', {
      kiosk_id: kioskSession.kiosk_id,
      reset_at: rateLimitResult.resetAt
    });

    return json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
        }
      }
    );
  }

  // Declare jwt outside try block so it's accessible in catch for debugging
  let jwt: string = '';

  try {
    let customerId: string;
    let serviceDate: string;
    let jti: string;

    // Check if qrToken is a short code or a JWT
    if (isValidShortCode(qrToken)) {
      // Short code - look up JWT from database
      console.log('[Kiosk Redeem] Received short code, looking up JWT...');
      const normalizedCode = normalizeShortCode(qrToken);

      const { data: tokenData, error: lookupError } = await supabase
        .from('qr_tokens')
        .select('jwt_token, customer_id, service_date, jti, used_at')
        .eq('short_code', normalizedCode)
        .single();

      if (lookupError || !tokenData || !tokenData.jwt_token) {
        console.error('[Kiosk Redeem] Short code lookup failed:', lookupError);
        return json({
          error: 'Invalid or expired QR code',
          code: 'INVALID_SHORT_CODE'
        }, { status: 400 });
      }

      // Check if already used (quick check before JWT verification)
      if (tokenData.used_at) {
        return json({
          error: 'QR code already used',
          code: 'ALREADY_USED',
          ...(process.env.NODE_ENV !== 'production' && { debug: { used_at: tokenData.used_at } })
        }, { status: 400 });
      }

      jwt = tokenData.jwt_token;
      console.log('[Kiosk Redeem] Found JWT for short code');
    } else {
      // Legacy JWT format (for backwards compatibility)
      console.log('[Kiosk Redeem] Received JWT directly (legacy format)');
      jwt = qrToken;
    }

    // Verify JWT signature and extract claims
    const publicKey = await jose.importSPKI(QR_PUBLIC_KEY, 'ES256');
    const { payload } = await jose.jwtVerify(jwt, publicKey, {
      issuer: 'frontier-meals-kiosk'
    });

    customerId = payload.sub as string;
    serviceDate = payload.service_date as string;
    jti = payload.jti as string;

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
          ...(process.env.NODE_ENV !== 'production' && {
            debug: {
              customer_id: customerId,
              service_date: serviceDate,
              jti: jti.substring(0, 8) + '...' // Partial JTI for debugging
            }
          })
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
      const decoded = jose.decodeJwt(jwt);
      // Log debug info for troubleshooting (server-side only)
      console.error('[Kiosk Redeem] Expired JWT claims:', {
        exp: decoded.exp,
        exp_iso: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
        current_time: Math.floor(Date.now() / 1000),
        current_time_iso: new Date().toISOString()
      });
      // Return generic error without exposing JWT internals
      return json({
        error: 'QR code expired',
        code: 'EXPIRED'
      }, { status: 400 });
    }

    // Build detailed error for debugging (only in non-production)
    const errorDetails = {
      type: error?.constructor?.name || 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      qrTokenPreview: isValidShortCode(qrToken) ? `Short code: ${qrToken}` : qrToken?.substring(0, 50) + '...'
    };

    console.error('[Kiosk Redeem] Returning error response:', errorDetails);

    return json({
      error: 'Invalid QR code',
      code: 'INVALID_TOKEN',
      ...(process.env.NODE_ENV !== 'production' && { debug: errorDetails })
    }, { status: 400 });
  }
};
