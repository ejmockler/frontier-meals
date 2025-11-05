import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkTelegramLinks } from '$lib/cron/check-telegram-links';
import { PUBLIC_SUPABASE_URL, PUBLIC_SITE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  const cronSecret = request.headers.get('cron-secret');

  if (cronSecret !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await checkTelegramLinks({
      supabaseUrl: PUBLIC_SUPABASE_URL,
      supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY,
      siteUrl: PUBLIC_SITE_URL
    });

    return json({ success: true, ...results });
  } catch (error) {
    console.error('[Cron] Error checking Telegram links:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  return json({
    endpoint: '/api/cron/check-telegram-links',
    method: 'POST',
    description: 'Check for unlinked Telegram accounts and send correction emails',
    schedule: 'Every hour',
    authorization: 'Cron-Secret header required'
  });
};
