/* =====================================================================
   Shared config + shared clock logic for both screens.
   Both big.html and small.html load this one file and
   independently compute "what should be showing right now" from the
   (server-corrected) clock against the same TALKS list below — no
   websocket, no manual start button. As long as both pages are open
   and have this file, they stay in step, and either one can reload or
   a TV can reboot without breaking the loop.

   Durations are each talk's real length in seconds (pulled from the
   YouTube video itself), so the small screen's panel for a talk stays
   up for exactly as long as that talk plays on the big screen.
   ===================================================================== */
const TALKS = [
  { id: 'rqJ5ir-8hAQ', duration: 1158, title: 'Post-Quantum Transition',
    links: ['pq.ethereum.org'] },
  { id: 'BA1Vpoq1Y6o', duration: 1695, title: 'PQ Ethereum Q&A',
    links: ['pq.ethereum.org'] },
  { id: 'oXya1uS32Ak', duration: 1581, title: 'Private Information Retrieval for Ethereum',
    links: ['reads.ethereum.foundation', 'reads@ethereum.org'] },
  { id: 'Bu_u9FUqFaA', duration: 466, title: 'leanSPHINCS: Signing for the long run',
    links: ['pq.ethereum.org'] },
  { id: 'VBXLxmboPig', duration: 1028, title: 'LeanVM',
    links: ['zkevm.ethereum.foundation', 'github.com/leanEthereum/leanVM'] },
  { id: 'XffwTy3S_FI', duration: 1398, title: "You can't withdraw your privacy: PQ analysis of Kohaku privacy protocols",
    links: ['pq.ethereum.org', 'ethereum.github.io/kohaku'] },
  { id: 'n99w0n5Eto8', duration: 1420, title: 'Diamond iO: New Cryptanalysis and Efficiency Improvements',
    links: ['eprint.iacr.org/2025/236', 'simons.berkeley.edu/talks/sora-suegami-ethereum-foundation-machina-io-2025-06-24', 'machina-io.com', 'github.com/orgs/MachinaIO/repositories'] },
  { id: 'WAAcQeh2TV0', duration: 1489, title: 'Anonymity Is Censorship Resistance: Efficient Anonymous Broadcast Under Censorship',
    links: ['strawmap.org'] },
  { id: 'Dbh3fnvBW-Q', duration: 1379, title: 'Formally Verifying a Shielded Pool in Lean 4',
    links: ['ethsystems.org'] },
  { id: 'iwX5k5Rsm5A', duration: 468, title: 'Challenges of Quantum-Safe Privacy on Ethereum',
    links: ['ethresear.ch/t/faster-aggregatable-and-quantum-safe-privacy-pools/26163', 'ethresear.ch/t/towards-native-post-quantum-private-eth/25291'] },
  { id: '8NWGd5AwyZ8', duration: 522, title: 'Where to Hide: Wormholes, Beacon Deposits, and the Cost of Deniability',
    links: ['ethresear.ch/t/wormholes-and-the-cost-of-plausible-deniability/23728', 'eips.ethereum.org/EIPS/eip-8222'] },
  { id: 'Dc4sI6T5Dd8', duration: 2815, title: 'Enforcing transaction outcomes with native on-chain state change validation in EIP-7906',
    links: [] },
  { id: 'kDuAFDVCgN0', duration: 1401, title: 'Migrating from a Private Blockchain to Ethereum: Engineering Lessons',
    links: ['publicsector.ethereum.foundation', 'epic@ethereum.org'] },
  { id: 'KNHlogU2lN4', duration: 453, title: "Lessons learned shipping proof of personhood on Taiwan's citizen digital certificate",
    links: ['github.com/ethereum/openac-taiwan-citizen-digital-certificate-web-example', 'publicsector.ethereum.foundation', 'epic@ethereum.org'] },
  { id: '0ziKiYwhJHk', duration: 959, title: 'Mopro: Make Client-side Proving on Mobile Easy | Devcon SEA',
    links: ['github.com/zkmopro/mopro'] },
  { id: 'Zhm46eM58xM', duration: 2778, title: 'Evaluating Client-Side Proving Systems',
    links: ['ethproofs.org'] },
  { id: 'QgG5l2SST_E', duration: 1538, title: 'Your RPC provider sees too much: a standard for anonymized wallet reads',
    links: ['reads.ethereum.foundation', 'reads@ethereum.org'] },
  { id: '6c-JgdOPyxI', duration: 450, title: 'Paths to a Private L1',
    links: ['strawmap.org'] },
  { id: '0PNMQx4tysU', duration: 3283, title: 'leanSPHINCS for developers: how to build on Post-Quantum Ethereum',
    links: ['pq.ethereum.org'] },
];

/* The loop starts at CONFIG.START_TIME, and only then. Before it, both
   screens show a "starting soon" placeholder instead of the first talk.
   After it, the playlist loops forever, anchored to this instant — so
   the first lap always starts clean at talk #1, second 0.

   START_TIME comes from two places:
     - config.json "startAt" (e.g. '2026-12-07T08:30:00+08:00'), changed
       by editing the file and redeploying;
     - the "Next talk" / "Restart from talk 1" buttons on control.html,
       stored by the /api/control function with the time they were
       pressed (setAt).
   A button press wins if it happened after config.json's startAt, so
   config.json can still schedule a future start, and pressing a button
   once the loop is running takes over.

   Remote control (control.html, PIN protected):
     - "Reload both screens" makes every open screen reload itself.
     - "Next talk" shifts the start time so the next talk begins now
       (no reload: screens switch on their next poll).
     - "Restart from talk 1" sets a new start time to now, then reloads.
   Screens check /api/control every CONTROL_POLL_MS.

   Clock: TVs' own clocks are often off by seconds or minutes, which
   would put the two screens permanently out of step. So both screens
   use the server's clock instead — CONFIG.now() is Date.now() corrected
   by the offset measured against /api/control. */
const CONFIG_POLL_MS = 30000;
const CONTROL_POLL_MS = 15000;

const CONFIG = { TALKS, START_TIME: null, followReloads: true };  // control.html sets followReloads = false
CONFIG.cycleLength = TALKS.reduce((s, t) => s + t.duration, 0);

/* ---- server clock ---- */
let clockOffset = 0;        // server time minus local time, in ms
const clockSamples = [];    // recent { rtt, offset } measurements
CONFIG.now = () => Date.now() + clockOffset;

let fileStartAt = null;     // from config.json
let controlStartAt = null;  // from /api/control
let controlSetAt = null;    // when that was set (ms)
let lastReloadAt;           // undefined until the first successful poll

function applyStartTime(){
  const fileT = fileStartAt ? new Date(fileStartAt).getTime() : null;
  const ctlT = controlStartAt ? new Date(controlStartAt).getTime() : null;
  let next = fileT;
  if (ctlT !== null && (fileT === null || (controlSetAt ?? ctlT) >= fileT)) next = ctlT;
  const changed = next !== CONFIG.START_TIME;
  CONFIG.START_TIME = next;
  return changed;
}

async function pollConfigFile(){
  try {
    const res = await fetch('config.json?t=' + Date.now(), { cache: 'no-store' });
    fileStartAt = (await res.json()).startAt || null;
  } catch(e){}
}

/* Returns false if the control endpoint isn't reachable (e.g. opened as a
   plain file), so the screens keep working on config.json alone. */
async function pollControl(){
  let data, sent, received;
  try {
    sent = Date.now();
    const res = await fetch('/api/control?t=' + sent, { cache: 'no-store' });
    received = Date.now();
    if (!res.ok) return false;
    data = await res.json();
  } catch(e){ return false; }

  // Use the recent sample with the shortest round trip: it's the most
  // accurate. Only the last few count, so if the TV's own clock jumps
  // (e.g. it syncs itself) the offset follows within a couple of minutes.
  const rtt = received - sent;
  clockSamples.push({ rtt, offset: data.serverTime + rtt / 2 - received });
  if (clockSamples.length > 6) clockSamples.shift();
  clockOffset = clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;

  if (CONFIG.followReloads && lastReloadAt !== undefined && data.reloadAt && data.reloadAt !== lastReloadAt) {
    location.reload();
    return true;
  }
  lastReloadAt = data.reloadAt || null;
  controlStartAt = data.startAt || null;
  controlSetAt = data.setAt || null;
  return true;
}

/* Call once on page load before using currentPhase(). Takes a few quick
   clock samples so the screens are accurate from the first second. */
CONFIG.boot = async function boot(){
  await pollConfigFile();
  for (let i = 0; i < 3; i++) { if (!(await pollControl())) break; }
  applyStartTime();
};

/* Re-read /api/control right away (control.html calls this after a button
   press so its "should be playing" card updates immediately). */
CONFIG.syncNow = async function syncNow(){ await pollControl(); return applyStartTime(); };

/* Then call this once. onChange runs when the start time changes, so the
   page can reset its "currently showing" tracking and re-render. */
CONFIG.startPolling = function startPolling(onChange){
  const check = () => { if (applyStartTime() && onChange) onChange(); };
  setInterval(async () => { await pollConfigFile(); check(); }, CONFIG_POLL_MS);
  setInterval(async () => { await pollControl(); check(); }, CONTROL_POLL_MS);
};

/* ---- shared phase computation: identical on both screens ----
   Returns which talk is "playing" right now and how far into it we
   are, purely from (server-corrected) clock time. Both pages call this
   every tick. */
CONFIG.currentPhase = function currentPhase(now){
  if (CONFIG.START_TIME === null) return { loading: true };
  now = now ?? CONFIG.now();
  if (now < CONFIG.START_TIME) return { notStarted: true, startsInSeconds: (CONFIG.START_TIME - now) / 1000 };
  const elapsed = ((now - CONFIG.START_TIME) / 1000) % CONFIG.cycleLength;
  let acc = 0;
  for (let i = 0; i < TALKS.length; i++) {
    const next = acc + TALKS[i].duration;
    if (elapsed < next) return { index: i, talk: TALKS[i], offset: elapsed - acc };
    acc = next;
  }
  return { index: 0, talk: TALKS[0], offset: 0 };
};
