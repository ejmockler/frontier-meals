import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RESEND_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, sha256 } from '$lib/utils/crypto';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Resend Webhook Endpoint
 * Handles email delivery events (delivered, bounced, complained, etc.)
 * Uses Svix HMAC-SHA256 signature verification
 *
 * Issue #5: Critical security fix
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();

	// Extract Svix signature headers
	const svixId = request.headers.get('svix-id');
	const svixTimestamp = request.headers.get('svix-timestamp');
	const svixSignature = request.headers.get('svix-signature');

	if (!svixId || !svixTimestamp || !svixSignature) {
		console.error('[Resend Webhook] Missing signature headers');
		return json({ error: 'Missing signature headers' }, { status: 400 });
	}

	// Verify Svix signature
	// Signed content format: "{id}.{timestamp}.{body}"
	const signedContent = `${svixId}.${svixTimestamp}.${body}`;

	const expectedSignature = crypto
		.createHmac('sha256', RESEND_WEBHOOK_SECRET)
		.update(signedContent)
		.digest('base64');

	// Svix includes multiple signatures in the header (for key rotation)
	// Format: "v1,signature1 v1,signature2"
	const signatures = svixSignature
		.split(' ')
		.map((s) => s.trim().split(',')[1])
		.filter(Boolean);

	const isValidSignature = signatures.includes(expectedSignature);

	if (!isValidSignature) {
		console.error('[Resend Webhook] Invalid signature');
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	// Verify timestamp to prevent replay attacks (within 5 minutes)
	const timestamp = parseInt(svixTimestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	const timeDiff = Math.abs(now - timestamp);

	if (timeDiff > 300) {
		// 5 minutes
		console.error('[Resend Webhook] Timestamp too old');
		return json({ error: 'Timestamp too old' }, { status: 400 });
	}

	// Parse event
	let event: any;
	try {
		event = JSON.parse(body);
	} catch (err) {
		console.error('[Resend Webhook] Invalid JSON:', err);
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	// Check for duplicate events (idempotency)
	const eventId = svixId; // Use Svix message ID as event ID

	const { error: insertError } = await supabase
		.from('webhook_events')
		.insert({
			source: 'resend',
			event_id: eventId,
			event_type: event.type,
			status: 'processing'
		})
		.select()
		.single();

	// Check if insert failed due to unique constraint violation (duplicate)
	if (insertError?.code === '23505') {
		console.log('[Resend Webhook] Duplicate event, skipping:', eventId);
		return json({ received: true });
	}

	if (insertError) {
		console.error('[Resend Webhook] Error inserting event:', insertError);
		return json({ error: 'Database error' }, { status: 500 });
	}

	try {
		// Handle different event types
		switch (event.type) {
			case 'email.delivered':
				await handleEmailDelivered(event.data);
				break;

			case 'email.bounced':
				await handleEmailBounced(event.data);
				break;

			case 'email.complained':
				await handleEmailComplained(event.data);
				break;

			case 'email.opened':
				await handleEmailOpened(event.data);
				break;

			case 'email.clicked':
				await handleEmailClicked(event.data);
				break;

			default:
				console.log('[Resend Webhook] Unhandled event type:', event.type);
		}

		// Mark event as processed
		await supabase
			.from('webhook_events')
			.update({ status: 'processed', processed_at: new Date().toISOString() })
			.eq('event_id', eventId);

		return json({ received: true });
	} catch (error) {
		console.error('[Resend Webhook] Error processing event:', error);

		// Mark event as failed
		await supabase
			.from('webhook_events')
			.update({
				status: 'failed',
				error_message: error instanceof Error ? error.message : 'Unknown error'
			})
			.eq('event_id', eventId);

		return json({ error: 'Event processing failed' }, { status: 500 });
	}
};

async function handleEmailDelivered(data: any) {
	console.log('[Resend] Email delivered:', data.email_id);

	const { error } = await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'email_delivered',
		subject: `email:${data.email_id}`,
		metadata: { to: data.to, subject: data.subject }
	});

	if (error) {
		console.error('[DB ERROR] Error creating audit_log for email_delivered:', {
			code: error.code,
			message: error.message
		});
	}
}

async function handleEmailBounced(data: any) {
	console.log('[Resend] Email bounced:', data.email_id);

	const { error } = await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'email_bounced',
		subject: `email:${data.email_id}`,
		metadata: { to: data.to, bounce_type: data.bounce_type }
	});

	if (error) {
		console.error('[DB ERROR] Error creating audit_log for email_bounced:', {
			code: error.code,
			message: error.message
		});
	}

	// TODO: Mark customer email as bounced in database if it's a permanent bounce
}

async function handleEmailComplained(data: any) {
	console.log('[Resend] Email complained (spam report):', data.email_id);

	const { error } = await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'email_complained',
		subject: `email:${data.email_id}`,
		metadata: { to: data.to }
	});

	if (error) {
		console.error('[DB ERROR] Error creating audit_log for email_complained:', {
			code: error.code,
			message: error.message
		});
	}

	// TODO: Add customer to suppression list to avoid future emails
}

async function handleEmailOpened(data: any) {
	console.log('[Resend] Email opened:', data.email_id);

	const { error } = await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'email_opened',
		subject: `email:${data.email_id}`,
		metadata: { to: data.to, opened_at: data.opened_at }
	});

	if (error) {
		console.error('[DB ERROR] Error creating audit_log for email_opened:', {
			code: error.code,
			message: error.message
		});
	}
}

async function handleEmailClicked(data: any) {
	console.log('[Resend] Email link clicked:', data.email_id);

	const { error } = await supabase.from('audit_log').insert({
		actor: 'system',
		action: 'email_clicked',
		subject: `email:${data.email_id}`,
		metadata: { to: data.to, url: data.url, clicked_at: data.clicked_at }
	});

	if (error) {
		console.error('[DB ERROR] Error creating audit_log for email_clicked:', {
			code: error.code,
			message: error.message
		});
	}
}
