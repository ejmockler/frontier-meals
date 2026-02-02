/**
 * Cloudflare Worker: Weekly Cleanup Cron Triggers
 *
 * Runs ALL cleanup jobs on Sunday at 03:00 UTC (single trigger to save cron slots).
 * Jobs run sequentially with small delays between them.
 */

export interface Env {
	CRON_SECRET: string;
	BASE_URL: string;
}

const ALL_JOBS = [
	{ name: 'cleanup-rate-limits', endpoint: '/api/cron/cleanup-rate-limits' },
	{ name: 'cleanup-expired-tokens', endpoint: '/api/cron/cleanup-expired-tokens' },
	{ name: 'cleanup-skip-sessions', endpoint: '/api/cron/cleanup-skip-sessions' }
];

async function triggerJob(
	env: Env,
	jobName: string,
	endpoint: string
): Promise<{ success: boolean; job: string; result?: unknown; error?: string }> {
	const url = `${env.BASE_URL}${endpoint}`;
	console.log(`[Cron] Triggering ${jobName} at ${url}`);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cron-Secret': env.CRON_SECRET,
				'X-Trigger-Source': 'cloudflare-worker-weekly'
			}
		});

		const result = await response.json();
		console.log(`[Cron] ${jobName} result:`, JSON.stringify(result));

		return { success: response.ok, job: jobName, result };
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Cron] ${jobName} failed:`, msg);
		return { success: false, job: jobName, error: msg };
	}
}

async function runAllJobs(env: Env): Promise<Response> {
	console.log(`[Cron] Starting all weekly cleanup jobs...`);

	const results = [];

	for (const job of ALL_JOBS) {
		const result = await triggerJob(env, job.name, job.endpoint);
		results.push(result);

		// Small delay between jobs to avoid overwhelming the database
		await new Promise((r) => setTimeout(r, 2000));
	}

	const allSuccess = results.every((r) => r.success);
	console.log(`[Cron] All weekly jobs complete. Success: ${allSuccess}`);

	return Response.json({
		success: allSuccess,
		jobs: results
	});
}

export default {
	/**
	 * Cron trigger handler - runs ALL cleanup jobs
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log(`[Cron] Weekly cleanup triggered at ${new Date(controller.scheduledTime).toISOString()}`);
		ctx.waitUntil(runAllJobs(env));
	},

	/**
	 * HTTP handler for health checks and manual triggers
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		// GET = health check
		if (request.method === 'GET') {
			return Response.json({
				service: 'frontier-meals-cron-weekly',
				jobs: ALL_JOBS.map((j) => j.name),
				schedule: 'Sunday 03:00 UTC (runs all jobs sequentially)',
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

			// Run all jobs if no specific job specified
			if (!jobName || jobName === 'all') {
				return runAllJobs(env);
			}

			// Run specific job
			const job = ALL_JOBS.find((j) => j.name === jobName);
			if (!job) {
				return Response.json(
					{
						error: `Unknown job: ${jobName}`,
						availableJobs: ALL_JOBS.map((j) => j.name)
					},
					{ status: 400 }
				);
			}

			const result = await triggerJob(env, job.name, job.endpoint);
			return Response.json(result);
		}

		return new Response('Method not allowed', { status: 405 });
	}
};
