/* =====================================================================
   Shared config + shared clock logic for both screens.
   Both big.html and small.html load this one file and
   independently compute "what should be showing right now" from
   Date.now() against the same TALKS list below — no server, no
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

   START_TIME is NOT hardcoded here — it's read from config.json
   ("startAt", e.g. '2026-12-07T08:30:00+08:00') and re-checked every
   POLL_INTERVAL_MS. Editing config.json and pushing a new deploy is
   the remote-restart mechanism: change "startAt" to right now (or any
   new value) and every screen that polls picks it up and restarts the
   loop from talk #1 within one poll interval — no direct access to
   the TVs needed. */
const POLL_INTERVAL_MS = 30000;

const CONFIG = { TALKS, START_TIME: null };
CONFIG.cycleLength = TALKS.reduce((s, t) => s + t.duration, 0);

let lastStartAtRaw = null;

async function fetchStartAt(){
  const res = await fetch('config.json?t=' + Date.now(), { cache: 'no-store' });
  const data = await res.json();
  return data.startAt;
}

/* Called on boot, and again every poll: applies config.json's startAt.
   Returns true if it actually changed (i.e. a restart should happen). */
CONFIG.refreshStartAt = async function refreshStartAt(){
  let raw;
  try { raw = await fetchStartAt(); } catch(e){ return false; }
  if (raw === lastStartAtRaw) return false;
  lastStartAtRaw = raw;
  CONFIG.START_TIME = new Date(raw).getTime();
  return true;
};

/* Call once on page load before using currentPhase(), then call
   CONFIG.refreshStartAt() on an interval (both screens do this) and
   react to a true return value by resetting whatever "currently
   showing" tracking variable the page keeps, so the next tick
   re-renders/reloads even if the resolved index happens to be the same. */
CONFIG.startPolling = function startPolling(onChange){
  setInterval(async () => {
    const changed = await CONFIG.refreshStartAt();
    if (changed && onChange) onChange();
  }, POLL_INTERVAL_MS);
};

/* ---- shared phase computation: identical on both screens ----
   Returns which talk is "playing" right now and how far into it we
   are, purely from wall-clock time. Both pages call this every tick. */
CONFIG.currentPhase = function currentPhase(now){
  if (CONFIG.START_TIME === null) return { loading: true };
  now = now ?? Date.now();
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
