import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endOfDayPT, startOfDayPT, todayInPT } from '$lib/utils/timezone';

export const GET: RequestHandler = async () => {
  const today = todayInPT();
  const testDate = '2025-11-09';

  const todayStart = startOfDayPT(today);
  const todayEnd = endOfDayPT(today);

  const testStart = startOfDayPT(testDate);
  const testEnd = endOfDayPT(testDate);

  return json({
    server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    current_time_utc: new Date().toISOString(),
    current_time_unix: Math.floor(Date.now() / 1000),
    today_pt_string: today,
    today_start_pt: {
      iso: todayStart.toISOString(),
      unix: Math.floor(todayStart.getTime() / 1000),
      human: todayStart.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    },
    today_end_pt: {
      iso: todayEnd.toISOString(),
      unix: Math.floor(todayEnd.getTime() / 1000),
      human: todayEnd.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    },
    test_date_2025_11_09: {
      start: {
        iso: testStart.toISOString(),
        unix: Math.floor(testStart.getTime() / 1000),
        human: testStart.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
      },
      end: {
        iso: testEnd.toISOString(),
        unix: Math.floor(testEnd.getTime() / 1000),
        human: testEnd.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
      }
    },
    raw_date_constructor_test: {
      input: '2025-11-09T23:59:59.999',
      output_iso: new Date('2025-11-09T23:59:59.999').toISOString(),
      output_unix: Math.floor(new Date('2025-11-09T23:59:59.999').getTime() / 1000)
    }
  });
};
