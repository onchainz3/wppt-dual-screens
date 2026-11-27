/* Reads the official program from the main website and turns it into the
   schedule format stage.html uses:
     { id, start:'HH:MM', end:'HH:MM', kind, tag?, title, desc, speakers[] }
   plus { id, kind:'divider', title } for section headings.

   Source: <ol class="schedule"> on https://privacypreserving.tech/program
     <li id="…" class="slot slot-{break|session|keynote|talk}">
       <time datetime="2026-12-07T09:05+08:00">09:05</time> … <time …>09:30</time>
       <p class="label">Keynote 1</p> <h3 class="title">…</h3> <p class="speaker">…</p>
     <li class="session"><h2>Signatures &amp; credentials</h2></li> */

export const PROGRAM_URL = 'https://privacypreserving.tech/program';

/* Conference window (Hong Kong time). The scheduled sync only does work
   inside it, so it stops by itself once the workshop is over. */
export const SYNC_FROM = Date.parse('2026-12-07T00:00:00+08:00');
export const SYNC_UNTIL = Date.parse('2026-12-08T00:00:00+08:00');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = s => s
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
                 : (ENTITIES[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

const all = (re, s) => [...s.matchAll(re)].map(m => text(m[1]));

export function parseProgram(html){
  const start = html.indexOf('<ol class="schedule"');
  if (start < 0) throw new Error('schedule list not found on the program page');
  const list = html.slice(start, html.indexOf('</ol>', start));

  const items = [];
  for (const m of list.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)) {
    const attrs = m[1], body = m[2];
    const cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || '';

    if (/\bsession\b/.test(cls) && !/\bslot\b/.test(cls)) {
      const title = all(/<h2[^>]*>([\s\S]*?)<\/h2>/g, body)[0];
      if (title) items.push({ id: 'div-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), kind: 'divider', title });
      continue;
    }

    const kind = (/\bslot-(break|session|keynote|talk)\b/.exec(cls) || [])[1];
    if (!kind) continue;
    const times = all(/<time\b[^>]*>([\s\S]*?)<\/time>/g, body);
    const title = all(/<h3[^>]*class="title"[^>]*>([\s\S]*?)<\/h3>/g, body)[0];
    if (times.length < 2 || !title) continue;

    const item = {
      id: (/id="([^"]*)"/.exec(attrs) || [])[1] || title,
      start: times[0], end: times[1], kind, title, desc: '',
      speakers: all(/<p[^>]*class="speaker"[^>]*>([\s\S]*?)<\/p>/g, body),
    };
    const label = all(/<p[^>]*class="label[^"]*"[^>]*>([\s\S]*?)<\/p>/g, body)[0];
    if (label) item.tag = label;
    items.push(item);
  }

  // Sanity check: never replace a good schedule with a broken parse.
  const slots = items.filter(i => i.kind !== 'divider');
  if (slots.length < 10) throw new Error(`only ${slots.length} sessions parsed`);
  if (slots.some(s => !/^\d\d:\d\d$/.test(s.start) || !/^\d\d:\d\d$/.test(s.end))) throw new Error('bad time format');
  return items;
}

export async function fetchProgram(){
  const res = await fetch(PROGRAM_URL, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error('program page returned ' + res.status);
  return parseProgram(await res.text());
}
