/* GET /api/stage-schedule -> { items, fetchedAt, source }

   Serves the copy of the main website's program that stage-schedule-sync
   stores. If there is no copy yet (e.g. right after the first deploy), it
   fetches the program once and stores it. If that fails too, it returns
   503 and stage.html keeps using the schedule built into the page. */
import { getStore } from '@netlify/blobs';
import { fetchProgram, PROGRAM_URL } from '../lib/program.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async () => {
  const store = getStore({ name: 'stage-schedule', consistency: 'strong' });
  let data = await store.get('program', { type: 'json' });
  if (!data) {
    try {
      data = { items: await fetchProgram(), fetchedAt: new Date().toISOString(), source: PROGRAM_URL };
      await store.setJSON('program', data);
    } catch (e) {
      return json({ error: e.message }, 503);
    }
  }
  return json(data);
};

export const config = { path: '/api/stage-schedule' };
