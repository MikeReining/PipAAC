/**
 * 024 slice 2 — the client side of whole-sentence voice.
 *
 * Tier 1 is Cache Storage on her device: every audio the endpoint
 * returns (shared-cache or private) lands here, so a repeat plays
 * instantly and offline. Tier 2/3 live in the Worker.
 *
 * Rule 1 (revised 2026-09-30, founder): the whole-sentence recording is
 * the speech — a speak waits for it, even across a fresh mint (~1–2 s).
 * `request` only returns null when the endpoint truly can't answer —
 * offline, unlicensed, over budget, or past the caller's deadline cap —
 * and the caller speaks the word clips as the last resort. A fetch that
 * resolves late still fills the cache, so the next tap is instant.
 */

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Same normalization the Worker's cache key uses (024 rule 2):
 *  punctuation kept, case and spaces normalized. */
export const normalizeSpeakText = (text) =>
  String(text).trim().toLowerCase().replace(/\s+/g, " ");

/** The sentence text as the bar shows it — displayed forms included
 *  ("wants", "mine", "Leo's"), terminated unless it already ends in
 *  sentence punctuation (the transform buttons supply their own). */
export function sentenceSpeakText(items) {
  const text = items.map((it) => it.text).join(" ").replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function voiceSentence({ cacheName = "pip-voice", deadlineMs = 300 } = {}) {
  let cacheP = null;
  const store = () => (cacheP ??= (async () => {
    const c = await caches.open(cacheName);
    // One-time sweep: the key hash once received the digest Promise
    // un-awaited, so every sentence stored under a URL ending in "/".
    // Those entries are poison — the first blob ever cached replays for
    // every sentence while they stand.
    if (typeof c.keys === "function" && typeof c.delete === "function") {
      for (const req of await c.keys().catch(() => [])) {
        if (req.url.endsWith("/")) await c.delete(req).catch(() => {});
      }
    }
    return c;
  })());
  // 025: the feeling keys the recording — same sentence, four voices.
  const urlFor = async (voice, text, feeling = "neutral") =>
    `https://voice.local/${voice}/${feeling}/${hex(
      await crypto.subtle.digest("SHA-256", te.encode(normalizeSpeakText(text))))}`;

  async function cached(voice, text, feeling = "neutral") {
    if (typeof caches === "undefined") return null;
    const res = await (await store()).match(await urlFor(voice, text, feeling))
      .catch(() => null);
    return res ? res.blob() : null;
  }

  async function remember(voice, text, blob, feeling = "neutral") {
    if (typeof caches === "undefined") return;
    await (await store()).put(await urlFor(voice, text, feeling),
      new Response(blob, { headers: { "content-type": "audio/mpeg" } }))
      .catch(() => {});
  }

  /* One network call per recording, ever: callers asking for the same
   *  (voice, feeling, text) while a fetch is in flight share it — the
   *  deadline race stays per-caller so a slow face tap never holds a
   *  normal speak. */
  const inflight = new Map();
  const fetchOnce = async (key, endpoint, body) => {
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        await remember(body.voice, body.text, blob, body.feeling);
        return blob;
      })().catch(() => null).finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  };

  /** One speak attempt. Returns an audio Blob, or null to mean
   *  "speak the word clips" — offline, unlicensed, over budget,
   *  or a request still unanswered past the deadline cap. A late
   *  answer still lands in the cache for the next tap. `feeling`
   *  rides to the Worker, which applies Eleven expressive text
   *  (025 § 4); `deadlineMs` is per call. 039: `tasteText` is the
   *  transform's masked output echoed back so a spent taste tap's
   *  one-shot speak grant can serve this exact sentence — it is the
   *  only way an unlicensed request reaches the network. */
  async function request({ userId, license, voice, text,
    feeling = "neutral", endpoint = "/api/v1/voice/speak",
    deadlineMs: deadline = deadlineMs, tasteText = null }) {
    if (!userId || !(license || tasteText) || !voice || !text) return null;
    const hit = await cached(voice, text, feeling);
    if (hit) return hit;
    const key = await urlFor(voice, text, feeling);
    const first = await Promise.race([
      fetchOnce(key, endpoint, { user_id: userId, license, voice, text, feeling,
        ...(tasteText ? { taste_text: tasteText } : {}) }),
      new Promise((r) => setTimeout(() => r("deadline"), deadline)),
    ]);
    return first === "deadline" ? null : first;
  }

  return { request, cached, remember };
}
