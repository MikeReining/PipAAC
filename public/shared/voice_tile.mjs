/**
 * 028 slice 2 — the client side of the tile voice library.
 *
 * Tier 1 is Cache Storage: every clip the Worker returns lands under
 * `https://voice.local/tile/<voice>/<sha256(normalizeV1(text))>` — the
 * exact key the ledger dedupes on. A tap is a cache lookup plus, on a
 * miss, one ledger hit (~100 ms); anything worse is silence — tiles
 * never fall back to device TTS (028 § 5.1).
 *
 * Minting belongs to the supporter flows: add, rename, bulk, setup, and
 * the keyboard commit call `ensure`, which waits without a deadline and
 * queues the request when the failure is transient (offline, mint_failed,
 * budget, fair_use) so it retries on reconnect or after the UTC roll.
 * A child tap shares the same `request` path but with a deadline — it
 * never waits on a mint; the fill lands for the next tap.
 */
import { normalizeV1 } from "./normalize.mjs";

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** sha256(normalizeV1(text)) — same string the ledger hashes, and the
 *  `replaced` sweep's eviction id. */
export async function tileTextHash(text) {
  return hex(await crypto.subtle.digest("SHA-256", te.encode(normalizeV1(text))));
}

export const tileCacheUrl = async (voice, text) =>
  `https://voice.local/tile/${voice}/${await tileTextHash(text)}`;

/** "Eve" → "Eve's voice"; "Pip's voice" stays itself — `voiceName`
 *  answers "Pip's voice" for the default voice. */
const possessiveVoice = (name) =>
  /voice/i.test(name ?? "") ? name : `${name ?? "Pip"}'s voice`;

/** § 5.2 supporter-facing copy for the tile badge and the word card —
 *  `name` comes from the voice row (`voiceName` in voices.mjs) — the
 *  client never hardcodes a voice id or name. */
export const tileStateMessage = (state, name, text) => {
  const v = possessiveVoice(name);
  return ({
    minting: `Making ${v}${text ? ` for '${text}'` : ""}…`,
    held: `A voice for this word isn't available yet.`,
    withheld: `A voice for this word isn't available yet.`,
    budget: `${v} for this word will be ready tomorrow.`,
    failed: `Couldn't make ${v}. Try again.`,
    offline: `Couldn't make ${v}. Try again.`,
    unavailable: `Couldn't make ${v}. Try again.`,
    denied: `Couldn't make ${v}. Try again.`,
  })[state] ?? null;
};

/** Short badge text for the tile itself (the word card shows the full
 *  message above). */
export const tileStateBadge = (state) => ({
  minting: "making voice…",
  budget: "voice tomorrow",
  offline: "voice pending",
  unavailable: "voice pending",
  failed: "voice pending",
})[state] ?? "no voice yet";

/** Server statuses → the reason a UI reports. */
const reasonFor = (status, body) => {
  if (status === 422) return "held";
  if (status === 409) return "withheld";
  if (status === 429) return "budget"; // per-license fair_use
  if (status === 502) return "failed";
  if (status === 503) return body?.error === "budget" ? "budget" : "unavailable";
  if (status === 400 || status === 403) return "denied"; // never heals
  return "unavailable";
};

/** Transient reasons retry from the queue; everything else is final —
 *  a `denied` entry must not park the whole drain behind it. */
const TRANSIENT = new Set(["offline", "failed", "budget", "unavailable"]);

export function voiceTile({
  cacheName = "pip-tile-voice",
  queueName = "pip-tile-queue",
  endpoint = "/api/v1/voice/tile",
  flagEndpoint = "/api/v1/voice/tile/flag",
  replacedEndpoint = "/api/v1/voice/tile/replaced",
  deadlineMs = 900,
} = {}) {
  let cacheP = null;
  let queueP = null;
  const store = () => (cacheP ??= caches.open(cacheName));
  const qstore = () => (queueP ??= caches.open(queueName));

  const urlFor = (voice, text) => tileCacheUrl(voice, text);

  async function cached(voice, text) {
    if (typeof caches === "undefined") return null;
    const res = await (await store()).match(await urlFor(voice, text)).catch(() => null);
    return res ? res.blob() : null;
  }

  async function remember(voice, text, blob) {
    if (typeof caches === "undefined") return;
    await (await store()).put(await urlFor(voice, text),
      new Response(blob, { headers: { "content-type": "audio/mpeg" } }))
      .catch(() => {});
  }

  /** Drop a cached clip — the `replaced` sweep evicts rejected audio (§ 5.3). */
  async function evict(voice, textHash) {
    if (typeof caches === "undefined") return;
    await (await store()).delete(`https://voice.local/tile/${voice}/${textHash}`)
      .catch(() => {});
  }

  /* One network call per (voice, locale, text): concurrent callers share
   * the fetch — ten taps on a brand-new word make one POST, matching the
   * ledger's own single flight. */
  const inflight = new Map();
  const fetchOnce = (key, body) => {
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          return { ok: false, reason: reasonFor(res.status, await res.json().catch(() => null)) };
        }
        const blob = await res.blob();
        await remember(body.voice, body.text, blob);
        return { ok: true, blob, cache: res.headers.get("x-tile-cache") ?? "mint" };
      })().catch(() => ({ ok: false, reason: "offline" }))
        .finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  };

  /** Supporter-visible state per (voice|normalized text): minting →
   *  ready | held | withheld | budget | failed | unavailable. The word
   *  card and the tile badge read this; it lives only as long as the
   *  page (a queue entry is the durable part). */
  const states = new Map();
  const listeners = new Set();
  const onStatus = (cb) => (listeners.add(cb), () => listeners.delete(cb));
  const setState = async (voice, text, state) => {
    const key = `${voice}|${normalizeV1(text)}`;
    if (state === states.get(key) && state !== "minting") return;
    states.set(key, state);
    for (const cb of listeners) cb(key, state);
  };
  const status = (voice, text) => states.get(`${voice}|${normalizeV1(text)}`) ?? null;

  /** Queue entry: {voice, locale, text, source} — no user id or license;
   *  those are supplied at drain time (they may have rotated). */
  const queueKey = async (voice, locale, text, source) =>
    `https://voice.local/tile-queue/${voice}|${locale}|${await tileTextHash(text)}|${source}`;

  async function enqueue(entry) {
    if (typeof caches === "undefined") return;
    await (await qstore()).put(
      await queueKey(entry.voice, entry.locale, entry.text, entry.source),
      new Response(JSON.stringify(entry),
        { headers: { "content-type": "application/json" } }),
    ).catch(() => {});
  }

  /** One mint/fetch attempt. `deadlineMs: null` waits forever (editor
   *  ensure); a number races the fetch so a tap never blocks. A late
   *  answer still caches — the next tap is instant. */
  async function request({ userId, license, voice, locale, text, source = "user_typed", deadlineMs: deadline = deadlineMs }) {
    if (!voice || !text) return { ok: false, reason: "unavailable" };
    const hit = await cached(voice, text);
    if (hit) return { ok: true, blob: hit, cache: "hit" };
    if (!userId || !license) return { ok: false, reason: "unavailable" };
    // The dedupe key carries locale+source: two different request bodies
    // must never share one POST, even when their cache URL coincides.
    const key = `${await urlFor(voice, text)}|${locale}|${source}`;
    const work = fetchOnce(key, {
      user_id: userId, license, voice, locale, text, source,
    });
    if (deadline == null) return work;
    const first = await Promise.race([
      work,
      new Promise((r) => setTimeout(() => r("deadline"), deadline)),
    ]);
    return first === "deadline" ? { ok: false, reason: "deadline" } : first;
  }

  /** The supporter mint trigger: full wait, status tracked, transient
   *  failures queued for retry (reconnect or the UTC roll). */
  async function ensure(args) {
    const { voice, text } = args;
    await setState(voice, text, "minting");
    const r = await request({ ...args, deadlineMs: null });
    const state = r.ok ? "ready" : r.reason;
    await setState(voice, text, state);
    if (!r.ok && TRANSIENT.has(r.reason)) {
      await enqueue({ voice, locale: args.locale, text, source: args.source ?? "user_typed" });
    }
    return r;
  }

  /** Replay the offline/budget queue — sequential (§ 5.3: no burst),
   *  stops at the first entry still transient so a 429 pauses the run. */
  async function drainQueue({ userId, license, onProgress } = {}) {
    if (typeof caches === "undefined" || !userId || !license) return { done: 0, pending: 0 };
    const reqs = await (await qstore()).keys().catch(() => []);
    let done = 0, pending = 0;
    for (const req of reqs) {
      const entry = await (await (await qstore()).match(req).catch(() => null))
        ?.json().catch(() => null);
      if (!entry?.text || !entry?.voice) {
        await (await qstore()).delete(req).catch(() => {});
        continue;
      }
      const r = await request({ userId, license, ...entry, deadlineMs: null });
      if (r.ok || !TRANSIENT.has(r.reason)) {
        await (await qstore()).delete(req).catch(() => {});
        if (r.ok) {
          done++;
          await setState(entry.voice, entry.text, "ready");
        } else {
          await setState(entry.voice, entry.text, r.reason);
        }
        onProgress?.(entry, r);
      } else {
        await setState(entry.voice, entry.text, r.reason);
        break; // still offline/over budget — leave the rest queued
      }
    }
    pending = (await (await qstore()).keys().catch(() => [])).length;
    return { done, pending };
  }

  /** § 5.3 prefetch: sequential ensures for texts without a local clip.
   *  Hits are free; misses mint the family's own words within caps. */
  async function prefetch({ userId, license, voice, locale, texts, onProgress } = {}) {
    let done = 0, skipped = 0, failed = 0;
    for (const text of [...new Set(texts)].filter(Boolean)) {
      if (await cached(voice, text)) { skipped++; continue; }
      const r = await ensure({ userId, license, voice, locale, text });
      r.ok ? done++ : failed++;
      onProgress?.({ text, done, skipped, failed, total: texts.length });
      if (!r.ok && r.reason === "budget") break; // § 5.3: 429/503 pauses the run
    }
    return { done, skipped, failed };
  }

  /** § 5.5 — "Sounds wrong": a review signal, never a takedown. */
  async function flag({ userId, license, voice, locale, text }) {
    if (!userId || !license) return false;
    const res = await fetch(flagEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, license, voice, locale, text }),
    }).catch(() => null);
    return res?.status === 204;
  }

  /** § 5.3 — daily sweep: text hashes of clips replaced or withheld
   *  since `since`; the caller evicts them from Cache Storage. */
  async function replacedSince({ userId, license, voice, since }) {
    if (!userId || !license) return null;
    const res = await fetch(
      `${replacedEndpoint}?since=${Number(since) || 0}&voice=${encodeURIComponent(voice)}`, {
        headers: { "x-pip-user": userId, "x-pip-license": license },
      }).catch(() => null);
    return res?.ok ? res.json().catch(() => null) : null;
  }

  return {
    request, ensure, cached, remember, evict,
    prefetch, drainQueue, flag, replacedSince,
    status, onStatus,
  };
}
