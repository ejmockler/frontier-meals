import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } from '$env/static/private';
import { Resend } from 'resend';
import { RESEND_API_KEY } from '$env/static/private';
import { sendAdminAlert, formatJobErrorAlert } from '$lib/utils/alerts';

const resend = new Resend(RESEND_API_KEY);

/**
 * Calculate next retry time using exponential backoff
 * Attempt 1: 5 minutes
 * Attempt 2: 15 minutes
 * Attempt 3: 60 minutes (1 hour)
 * Attempt 4: 240 minutes (4 hours)
 */
function calculateNextRetry(attemptCount: number): Date {
	const delayMinutes = [5, 15, 60, 240];
	const delay = delayMinutes[attemptCount] || 240;
	return new Date(Date.now() + delay * 60 * 1000);
}

/**
 * Email Retry Cron Job
 * Runs every 5 minutes to process failed email sends with exponential backoff
 *
 * Schedule: Every 5 minutes
 * Authorization: Cron-Secret header must match CRON_SECRET env variable
 */
export const POST: RequestHandler = async ({ request }) => {
	// Verify cron secret
	const cronSecret = request.headers.get('cron-secret');
	if (cronSecret !== CRON_SECRET) {
		console.error('[Email Retry] Unauthorized attempt to trigger retry job');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	console.log('[Email Retry] Starting retry job');

	// Find emails that are ready to retry (next_retry_at <= NOW)
	const { data: pendingRetries, error: fetchError } = await supabase
		.from('email_retry')
		.select('*')
		.in('status', ['pending', 'retrying'])
		.lte('next_retry_at', new Date().toISOString())
		.lt('attempt_count', 4) // Max 4 attempts
		.order('next_retry_at', { ascending: true })
		.limit(50); // Process max 50 emails per run

	if (fetchError) {
		console.error('[Email Retry] Error fetching retries:', fetchError);
		return json({ error: 'Database error' }, { status: 500 });
	}

	if (!pendingRetries || pendingRetries.length === 0) {
		console.log('[Email Retry] No emails to retry');
		return json({ retried: 0, succeeded: 0, failed: 0 });
	}

	console.log(`[Email Retry] Found ${pendingRetries.length} emails to retry`);

	const results = {
		retried: 0,
		succeeded: 0,
		failed: 0
	};

	const permanentFailures: Array<{ email: string; error: string }> = [];

	for (const retry of pendingRetries) {
		try {
			// Attempt to send email
			const payload: any = {
				from: retry.metadata?.from || 'Frontier Meals <meals@frontiermeals.com>',
				to: retry.recipient_email,
				subject: retry.subject,
				html: retry.html_body
			};

			// Add tags if present
			if (retry.tags && Array.isArray(retry.tags) && retry.tags.length > 0) {
				payload.tags = retry.tags;
			}

			// Add idempotency key if present
			const headers: any = {};
			if (retry.idempotency_key) {
				headers['Idempotency-Key'] = retry.idempotency_key;
			}

			const response = await resend.emails.send(payload);

			// Success - mark as completed
			await supabase
				.from('email_retry')
				.update({
					status: 'completed',
					completed_at: new Date().toISOString(),
					last_attempted_at: new Date().toISOString()
				})
				.eq('id', retry.id);

			results.succeeded++;
			console.log(`[Email Retry] Successfully sent email to ${retry.recipient_email} (attempt ${retry.attempt_count + 1})`);

		} catch (error) {
			// Failure - increment attempt count
			const newAttemptCount = retry.attempt_count + 1;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			if (newAttemptCount >= retry.max_attempts) {
				// Max attempts reached - mark as failed
				await supabase
					.from('email_retry')
					.update({
						status: 'failed',
						attempt_count: newAttemptCount,
						last_error: errorMessage,
						last_attempted_at: new Date().toISOString()
					})
					.eq('id', retry.id);

				console.error(`[Email Retry] Max attempts reached for ${retry.recipient_email}: ${errorMessage}`);
				permanentFailures.push({
					email: retry.recipient_email,
					error: errorMessage
				});
				results.failed++;
			} else {
				// Schedule next retry with exponential backoff
				const nextRetry = calculateNextRetry(newAttemptCount);

				await supabase
					.from('email_retry')
					.update({
						status: 'retrying',
						attempt_count: newAttemptCount,
						next_retry_at: nextRetry.toISOString(),
						last_error: errorMessage,
						last_attempted_at: new Date().toISOString()
					})
					.eq('id', retry.id);

				console.log(`[Email Retry] Failed attempt ${newAttemptCount} for ${retry.recipient_email}, next retry at ${nextRetry.toISOString()}`);
			}
		}

		results.retried++;
	}

	console.log(`[Email Retry] Complete. Retried: ${results.retried}, Succeeded: ${results.succeeded}, Failed: ${results.failed}`);

	// Send alert if there were permanent failures
	if (permanentFailures.length > 0) {
		const today = new Date().toISOString().split('T')[0];
		const alertMessage = formatJobErrorAlert({
			jobName: 'Email Retry Job',
			date: today,
			errorCount: permanentFailures.length,
			totalProcessed: pendingRetries.length,
			errors: permanentFailures,
			maxErrorsToShow: 5
		});

		await sendAdminAlert(alertMessage);
		console.log(`[Email Retry] Sent permanent failure alert to admin - ${permanentFailures.length} emails permanently failed`);
	}

	return json({
		retried: results.retried,
		succeeded: results.succeeded,
		failed: results.failed
	});
};

/**
 * GET endpoint for testing purposes
 * Returns info about the cron job without executing it
 */
export const GET: RequestHandler = async () => {
	return json({
		endpoint: '/api/cron/retry-emails',
		method: 'POST',
		description: 'Email retry job with exponential backoff',
		schedule: 'Every 5 minutes',
		authorization: 'Cron-Secret header required',
		retry_schedule: {
			attempt_1: '5 minutes',
			attempt_2: '15 minutes',
			attempt_3: '60 minutes',
			attempt_4: '240 minutes'
		}
	});
};
