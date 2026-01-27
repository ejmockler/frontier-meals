import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import * as jose from 'jose';
import { randomUUID, sha256 } from '$lib/utils/crypto';
import qrcode from 'qrcode-generator';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';
import { validateCSRFFromFormData } from '$lib/auth/csrf';
import { getAdminSession } from '$lib/auth/session';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ url, depends }) => {
  depends('app:customers');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'all';

  let query = supabase
    .from('customers')
    .select('*, subscriptions(*), telegram_link_status(*)')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%,telegram_handle.ilike.%${search}%`);
  }

  const { data: customers, error } = await query;

  if (error) {
    console.error('[Admin] Error fetching customers:', error);
    return { customers: [] };
  }

  // Filter by subscription status if specified
  let filteredCustomers = customers || [];
  if (status !== 'all') {
    filteredCustomers = filteredCustomers.filter(c => {
      const sub = Array.isArray(c.subscriptions) ? c.subscriptions[0] : c.subscriptions;
      return sub?.status === status;
    });
  }

  return { customers: filteredCustomers, search, status };
};

export const actions: Actions = {
  regenerateQR: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Validate CSRF
    const session = await getAdminSession(cookies);
    if (!session || !await validateCSRFFromFormData(formData, session.sessionId)) {
      return fail(403, { error: 'Invalid CSRF token' });
    }

    const customerId = formData.get('customerId') as string;
    const qrPrivateKey = formData.get('qrPrivateKey') as string;

    if (!customerId || !qrPrivateKey) {
      return fail(400, { error: 'Missing required fields' });
    }

    try {
      // Get customer
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (!customer) {
        return fail(404, { error: 'Customer not found' });
      }

      const today = new Date().toISOString().split('T')[0];
      const jti = randomUUID();
      const expiresAt = new Date(today + 'T23:59:59-07:00');

      // Generate JWT
      const privateKey = await jose.importPKCS8(qrPrivateKey, 'ES256');
      const jwt = await new jose.SignJWT({ service_date: today })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer('frontier-meals-kiosk')
        .setSubject(customer.id)
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(privateKey);

      // Generate QR code using qrcode-generator (pure JS, Cloudflare Workers compatible)
      const qr = qrcode(0, 'H'); // 0 = auto type number, 'H' = high error correction
      qr.addData(jwt);
      qr.make();
      const qrCodeDataUrl = qr.createDataURL(10, 2); // cellSize=10, margin=2 (returns data:image/gif;base64,...)

      // Extract base64 content from data URL
      const base64Content = qrCodeDataUrl.replace(/^data:image\/gif;base64,/, '');

      // Upsert entitlement
      await supabase
        .from('entitlements')
        .upsert({
          customer_id: customer.id,
          service_date: today,
          meals_allowed: 1,
          meals_redeemed: 0
        }, { onConflict: 'customer_id,service_date' });

      // Upsert QR token
      await supabase
        .from('qr_tokens')
        .upsert({
          customer_id: customer.id,
          service_date: today,
          jti,
          issued_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          used_at: null
        }, { onConflict: 'customer_id,service_date' });

      // Send email with QR code as inline attachment (CID)
      const { subject, html } = await renderTemplate(
        'qr_daily',
        {
          customer_name: customer.name,
          service_date: today,
          qr_code_base64: base64Content
        },
        SUPABASE_SERVICE_ROLE_KEY
      );

      await sendEmail({
        to: customer.email,
        subject,
        html,
        attachments: [
          {
            filename: 'qr-code.gif',
            content: base64Content,
            contentType: 'image/gif',
            inlineContentId: 'qr-code' // Inline attachment ID for cid:qr-code reference
          }
        ],
        tags: [
          { name: 'category', value: 'qr_regenerated' },
          { name: 'service_date', value: today },
          { name: 'customer_id', value: customer.id }
        ],
        idempotencyKey: `qr_regenerated/${today}/${customer.id}/${Date.now()}`
      });

      // Log audit event
      await supabase.from('audit_log').insert({
        actor: 'admin',
        action: 'qr_regenerated',
        subject: `customer:${customer.id}`,
        metadata: { service_date: today }
      });

      return { success: true };
    } catch (error) {
      console.error('[Admin] Error regenerating QR:', error);
      return fail(500, { error: 'Failed to regenerate QR code' });
    }
  }
};
