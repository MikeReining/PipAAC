/**
 * 024 slice 2 — the client side of whole-sentence voice.
 *
 * Tier 1 is Cache Storage on her device: every audio the endpoint
 * returns (shared-cache or private) lands here, so a repeat plays
 * instantly and offline. Tier 2/3 live in the Worker.
 *
 * Rule 1: ▶ never waits on the network. `request` returns null after
 * ~deadlineMs and the caller speaks the word clips — but the fetch
 * keeps running and fills the cache, so the next tap of the same
 * sentence is instant. Sentence audio is an upgrade, never a
 * dependency.
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
  const store = () => (cacheP ??= caches.open(cacheName));
  // 025: the feeling keys the recording — same sentence, four voices.
  const urlFor = async (voice, text, feeling = "neutral") =>
    `https://voice.local/${voice}/${feeling}/${await hex(
      crypto.subtle.digest("SHA-256", te.encode(normalizeSpeakText(text))))}`;

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

  /** One speak attempt. Returns an audio Blob, or null to mean
   *  "speak the word clips" — offline, unlicensed, over budget,
   *  slow network, or past the deadline. A late answer still lands
   *  in the cache for the next tap. `feeling` rides to the Worker,
   *  which applies the locked prosody (025 § 4); `deadlineMs` per
   *  call lets a face tap wait ~1 s (§ 2's never-silent rule). */
  async function request({ userId, license, voice = "ara", text,
    feeling = "neutral", endpoint = "/api/v1/voice/speak",
    deadlineMs: deadline = deadlineMs }) {
    if (!userId || !license || !text) return null;
    const hit = await cached(voice, text, feeling);
    if (hit) return hit;
    const fetchP = (async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, license, voice, text, feeling }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      await remember(voice, text, blob, feeling);
      return blob;
    })().catch(() => null);
    const first = await Promise.race([
      fetchP,
      new Promise((r) => setTimeout(() => r("deadline"), deadline)),
    ]);
    return first === "deadline" ? null : first;
  }

  return { request, cached, remember };
}
