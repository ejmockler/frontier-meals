/**
 * Cloudflare Worker: QR Code Cron Trigger
 *
 * A lightweight cron trigger that calls the existing Pages Function endpoint.
 * All business logic stays in the Pages Function - this Worker only triggers it.
 *
 * Schedule: 19:00 UTC daily (12:00 PM PT)
 */

export interface Env {
	CRON_SECRET: string;
	TARGET_URL: string;
	TELEGRAM_BOT_TOKEN?: string;
}

const ADMIN_TELEGRAM_ID = '1413464598'; // @noahchonlee

async function sendAlert(env: Env, message: string): Promise<void> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		console.error('[Cron] No Telegram token configured, skipping alert');
		return;
	}

	try {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: ADMIN_TELEGRAM_ID,
				text: message,
				parse_mode: 'Markdown'
			})
		});
	} catch (e) {
		console.error('[Cron] Failed to send Telegram alert:', e);
	}
}

async function triggerWithRetry(env: Env, attempt = 1): Promise<Response> {
	const maxRetries = 3;

	console.log(`[Cron] Triggering QR issuance (attempt ${attempt}/${maxRetries})`);

	try {
		const response = await fetch(env.TARGET_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cron-Secret': env.CRON_SECRET,
				'X-Trigger-Source': 'cloudflare-worker'
			}
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
		}

		const result = await response.json();
		console.log('[Cron] Success:', JSON.stringify(result));

		return Response.json({
			success: true,
			attempt,
			result
		});
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Cron] Attempt ${attempt} failed:`, errorMsg);

		if (attempt < maxRetries) {
			// Exponential backoff: 2s, 4s, 8s
			const delay = Math.pow(2, attempt) * 1000;
			console.log(`[Cron] Retrying in ${delay}ms...`);
			await new Promise((r) => setTimeout(r, delay));
			return triggerWithRetry(env, attempt + 1);
		}

		// All retries exhausted - send alert
		await sendAlert(
			env,
			`🚨 *QR Cron Worker Failed*\n\n` +
				`All ${maxRetries} attempts failed.\n\n` +
				`*Error*: ${errorMsg}\n\n` +
				`_Manual intervention required._`
		);

		return Response.json(
			{
				success: false,
				error: errorMsg,
				attempts: attempt
			},
			{ status: 500 }
		);
	}
}

export default {
	/**
	 * Cron trigger handler - fires at scheduled time
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		const scheduledTime = new Date(controller.scheduledTime).toISOString();
		console.log(`[Cron] Scheduled event fired at ${scheduledTime}`);

		// Use waitUntil to ensure the fetch completes even if handler returns early
		ctx.waitUntil(triggerWithRetry(env));
	},

	/**
	 * HTTP handler for manual triggers and health checks
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		// GET = health check
		if (request.method === 'GET') {
			return Response.json({
				service: 'frontier-meals-cron',
				status: 'healthy',
				schedule: '19:00 UTC daily (12:00 PM PT)',
				target: env.TARGET_URL
			});
		}

		// POST = manual trigger (requires auth)
		if (request.method === 'POST') {
			const secret = request.headers.get('Cron-Secret');
			if (secret !== env.CRON_SECRET) {
				return new Response('Unauthorized', { status: 401 });
			}

			return triggerWithRetry(env);
		}

		return new Response('Method not allowed', { status: 405 });
	}
};
