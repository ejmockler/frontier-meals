/**
 * Cloudflare Worker: Frequent Cron Triggers
 *
 * Triggers high-frequency jobs that need reliable execution.
 *
 * Schedule:
 *   - Every 5 min → cleanup-discount-reservations (release abandoned checkouts)
 *   - Every 6 hours → retry-emails (exponential backoff retries)
 *   - Daily 20:00 UTC → check-telegram-links (1 hour after QR issuance)
 */

export interface Env {
	CRON_SECRET: string;
	BASE_URL: string;
}

const ENDPOINTS: Record<string, string> = {
	'cleanup-discount': '/api/cron/cleanup-discount-reservations',
	'retry-emails': '/api/cron/retry-emails',
	'check-telegram': '/api/cron/check-telegram-links'
};

/**
 * Map cron pattern to job name
 */
function getJobForCron(cron: string): string {
	// Every 5 minutes: */5 * * * *
	if (cron.startsWith('*/5')) return 'cleanup-discount';

	// Every 6 hours: 0 */6 * * *
	if (cron.includes('*/6')) return 'retry-emails';

	// Daily at 20:00: 0 20 * * *
	if (cron.includes(' 20 ')) return 'check-telegram';

	return 'unknown';
}

async function triggerJob(env: Env, jobName: string): Promise<Response> {
	const endpoint = ENDPOINTS[jobName];
	if (!endpoint) {
		console.error(`[Cron] Unknown job: ${jobName}`);
		return Response.json({ error: `Unknown job: ${jobName}` }, { status: 400 });
	}

	const url = `${env.BASE_URL}${endpoint}`;
	console.log(`[Cron] Triggering ${jobName} at ${url}`);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cron-Secret': env.CRON_SECRET,
				'X-Trigger-Source': 'cloudflare-worker-frequent'
			}
		});

		const result = await response.json();

		// Only log full result for non-frequent jobs to reduce log noise
		if (jobName !== 'cleanup-discount') {
			console.log(`[Cron] ${jobName} result:`, JSON.stringify(result));
		} else {
			// For discount cleanup, just log success/failure
			console.log(`[Cron] ${jobName}: ${response.ok ? 'success' : 'failed'}`);
		}

		return Response.json({
			success: response.ok,
			job: jobName,
			result
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Cron] ${jobName} failed:`, msg);
		return Response.json(
			{
				success: false,
				job: jobName,
				error: msg
			},
			{ status: 500 }
		);
	}
}

export default {
	/**
	 * Cron trigger handler - fires on schedule
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		const jobName = getJobForCron(controller.cron);

		// Only log for non-frequent jobs to reduce noise
		if (jobName !== 'cleanup-discount') {
			console.log(
				`[Cron] Scheduled event for ${jobName} at ${new Date(controller.scheduledTime).toISOString()}`
			);
		}

		ctx.waitUntil(triggerJob(env, jobName));
	},

	/**
	 * HTTP handler for health checks and manual triggers
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		// GET = health check
		if (request.method === 'GET') {
			return Response.json({
				service: 'frontier-meals-cron-frequent',
				jobs: Object.keys(ENDPOINTS),
				schedules: {
					'cleanup-discount': 'Every 5 minutes',
					'retry-emails': 'Every 6 hours',
					'check-telegram': 'Daily at 20:00 UTC'
				},
				status: 'healthy'
			});
		}

		// POST = manual trigger (requires auth)
		if (request.method === 'POST') {
			if (request.headers.get('Cron-Secret') !== env.CRON_SECRET) {
				return new Response('Unauthorized', { status: 401 });
			}

			const url = new URL(request.url);
			const jobName = url.searchParams.get('job');

			if (!jobName) {
				return Response.json(
					{
						error: 'Missing ?job= parameter',
						availableJobs: Object.keys(ENDPOINTS)
					},
					{ status: 400 }
				);
			}

			return triggerJob(env, jobName);
		}

		return new Response('Method not allowed', { status: 405 });
	}
};
