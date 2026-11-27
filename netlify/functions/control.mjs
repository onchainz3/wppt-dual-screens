/* Remote control for the booth screens.

   GET  /api/control  -> { serverTime, reloadAt, startAt }
        Polled by both screens. serverTime lets them use the server's clock
        instead of their own (TV clocks drift), reloadAt tells them to
        reload, startAt (if set) restarts the loop from talk #1.

   POST /api/control  { pin, action: "reload" | "restart" }
        Used by control.html. The PIN is the CONTROL_PIN environment
        variable set on the Netlify site. */
import { getStore } from '@netlify/blobs';

const KEY = 'state';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  const store = getStore({ name: 'screen-control', consistency: 'strong' });
  const state = (await store.get(KEY, { type: 'json' })) || { reloadAt: null, startAt: null };

  if (req.method === 'GET') {
    return json({ serverTime: Date.now(), ...state });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }

  const pin = Netlify.env.get('CONTROL_PIN');
  if (!pin) return json({ error: 'CONTROL_PIN is not set on the site' }, 500);
  if (String(body.pin || '') !== pin) return json({ error: 'wrong PIN' }, 401);

  const now = Date.now();
  if (body.action === 'reload') state.reloadAt = now;
  else if (body.action === 'restart') { state.startAt = new Date(now).toISOString(); state.reloadAt = now; }
  else if (body.action !== 'check') return json({ error: 'unknown action' }, 400);

  if (body.action !== 'check') await store.setJSON(KEY, state);
  return json({ ok: true, serverTime: now, ...state });
};

export const config = { path: '/api/control' };
