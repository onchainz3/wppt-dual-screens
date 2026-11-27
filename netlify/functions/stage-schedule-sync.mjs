/* Scheduled job: every 30 minutes during the conference, copy the program
   from https://privacypreserving.tech/program into Netlify Blobs, where
   stage.html picks it up (via /api/stage-schedule).

   When it runs: the cron (see config below) is in UTC and fires every
   30 min on 6 and 7 December (UTC), which covers all of 7 December in Hong Kong
   (UTC+8). On top of that, the code only does work between SYNC_FROM and
   SYNC_UNTIL (7 December 2026, 00:00 to 24:00 HKT), so after the workshop
   it does nothing, including in later years. */
import { getStore } from '@netlify/blobs';
import { fetchProgram, SYNC_FROM, SYNC_UNTIL, PROGRAM_URL } from '../lib/program.mjs';

export default async () => {
  const now = Date.now();
  if (now < SYNC_FROM || now >= SYNC_UNTIL) {
    console.log('Outside the conference window, nothing to do.');
    return;
  }
  try {
    const items = await fetchProgram();
    await getStore({ name: 'stage-schedule', consistency: 'strong' })
      .setJSON('program', { items, fetchedAt: new Date(now).toISOString(), source: PROGRAM_URL });
    console.log(`Synced ${items.length} schedule items.`);
  } catch (e) {
    // Keep the last good copy; the next run tries again.
    console.error('Schedule sync failed:', e.message);
  }
};

export const config = { schedule: '*/30 * 6,7 12 *' };
