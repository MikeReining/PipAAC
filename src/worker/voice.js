/**
 * 024 slice 1 — POST /api/v1/voice/speak.
 *
 * Whole-sentence Grok Voice behind the Worker: shared R2 cache for
 * eligible sentences (024 § 5 — Pip words, their forms, common names
 * only), per-license fair-use counters (§ 6a — counts, never
 * sentences), and nothing user-identifying sent upstream (rule 8).
 *
 * Cache key = sha256(voice id + voice settings + model + normalized
 * text). The audio objects carry no ids; the usage ledger lives under
 * usage/<user>/ keys, separate from the anonymous speak/ namespace.
 */
import voiceWords from "../../data/catalog/voice_words.en.json" with { type: "json" };
import { checkLicense } from "./license.mjs";
import { FEELINGS, applyEmotionalProsody } from "./prosody.mjs";

const ELIGIBLE = new Set(voiceWords.words);

// Launch voice (founder, 2026-09-26): Aura only — the catalog clips
// are being re-minted for her; other Grok voices land with later picks.
export const VOICE_IDS = new Set(["ara"]);
export const VOICE_MODEL = "grok-tts-v1";
export const VOICE_SPEED = 1;

// 024 § 6a — silent fair use: fresh synthesis only; cache hits free.
const MAX_SENTENCE_CHARS = 120;
const DAY_CHAR_BUDGET = 8000;
const MINUTE_REQUEST_BURST = 20;

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

const te = new TextEncoder();
const hexSha256 = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

/** Cache-key text: punctuation kept ("?" is the rising tune), case and
 * spaces normalized (024 rule 2). */
export const normalizeText = (text) =>
  String(text).trim().toLowerCase().replace(/\s+/g, " ");

/** 025 § 4: the feeling is part of the recording's identity — the
 *  same sentence neutral, happy, sad and angry are four separate
 *  recordings, each synthesized once. */
export const cacheKeyMaterial = (voiceId, text, feeling = "neutral") =>
  `${voiceId}|${VOICE_SPEED}|${VOICE_MODEL}|${feeling}|${normalizeText(text)}`;

const CONTRACTION = /(?:'s|'m|'re|'ve|'ll|'d|n't)$/i;

/** 024 § 5: every word resolves to the eligible set — catalog words,
 * their forms, sanctioned child surfaces, or a common name. One rare
 * name or typed word keeps the whole sentence on her device. */
export function eligibleSentence(text) {
  for (const raw of normalizeText(text).split(" ")) {
    const tok = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
    if (!tok) continue;
    if (ELIGIBLE.has(tok)) continue;
    const stem = tok.replace(CONTRACTION, "");
    if (stem && stem !== tok && ELIGIBLE.has(stem)) continue;
    return false;
  }
  return true;
}

const counterKey = (ns, uid, ts = Date.now(), per = "day") =>
  per === "day"
    ? `${ns}/${uid}/${new Date(ts).toISOString().slice(0, 10)}`
    : `${ns}-min/${uid}/${Math.floor(ts / 60000)}`;

/** R2-backed fair-use ledger: get → decide → put after a real call.
 * Read-modify-write can drift a few chars under parallel devices —
 * noise against an 8,000-char day. `ns` namespaces the counter
 * (usage/ for voice, usage-tr/ for transforms) so one pipeline's
 * budget can't starve the other's. */
export async function usageCheck(env, { ns, uid, chars, maxChars, dayBudget, minBudget }) {
  if (chars > maxChars) return { allowed: false, over: "sentence" };
  const read = async (key) => {
    const obj = await env.VOICE.get(key).catch(() => null);
    return obj ? JSON.parse(await obj.text()) : {};
  };
  const day = await read(counterKey(ns, uid));
  if ((day.chars ?? 0) + chars > dayBudget) return { allowed: false, over: "day" };
  const min = await read(counterKey(ns, uid, Date.now(), "min"));
  if ((min.reqs ?? 0) + 1 > minBudget) return { allowed: false, over: "minute" };
  return { allowed: true };
}

export async function usageRecord(env, { ns, uid, chars, over = null }) {
  const bump = async (key, patch) => {
    const obj = await env.VOICE.get(key).catch(() => null);
    const cur = obj ? JSON.parse(await obj.text()) : { chars: 0, reqs: 0 };
    await env.VOICE.put(key, JSON.stringify({ ...cur, ...patch(cur) }));
  };
  await bump(counterKey(ns, uid), (c) => ({ chars: c.chars + chars, reqs: c.reqs + 1 }));
  await bump(counterKey(ns, uid, Date.now(), "min"),
    (c) => ({ chars: 0, reqs: c.reqs + 1 }));
  // § 6a.5: every limit hit is logged — if a real child ever hits it,
  // the limit is wrong.
  if (over) {
    await env.VOICE.put(`${ns}-hits/${uid}/${Date.now()}`,
      JSON.stringify({ over, chars }));
  }
}

/** Grok Voice (xAI). env.VOICE_SYNTH is the test seam; without either
 * a stub or XAI_API_KEY the caller gets 503 and falls back to clips. */
async function synthesize(env, text, voiceId) {
  if (typeof env.VOICE_SYNTH === "function") {
    return env.VOICE_SYNTH(text, { voiceId });
  }
  if (!env.XAI_API_KEY) return null;
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    // Sentence text and voice only — no user, device or license id
    // ever leaves this Worker (024 rule 8).
    body: JSON.stringify({
      text, voice_id: voiceId, language: "en", speed: VOICE_SPEED,
    }),
  });
  if (!res.ok) throw new Error(`grok_tts_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function handleSpeak(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
    return json({ error: "bad_user_id" }, { status: 400 });
  }
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_SENTENCE_CHARS) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  const voice = typeof body?.voice === "string" ? body.voice : "ara";
  if (!VOICE_IDS.has(voice)) return json({ error: "bad_voice" }, { status: 400 });
  // 025: feeling shapes the prosody tags here, never on the client.
  const feeling = body?.feeling == null || body.feeling === "neutral"
    ? "neutral" : body.feeling;
  if (!FEELINGS.has(feeling) && feeling !== "neutral") {
    return json({ error: "bad_feeling" }, { status: 400 });
  }
  if (!env.VOICE) return json({ error: "voice_unavailable" }, { status: 503 });

  const eligible = eligibleSentence(text);
  const key = `speak/${await hexSha256(cacheKeyMaterial(voice, text, feeling))}`;

  if (eligible) {
    const obj = await env.VOICE.get(key).catch(() => null);
    if (obj) {
      return new Response(obj.body, {
        headers: { "content-type": "audio/mpeg", "x-voice-cache": "hit" },
      });
    }
  }

  // Fresh synthesis — the only thing the fair-use ledger counts.
  const gate = await usageCheck(env, { ns: "usage", uid, chars: text.length,
    maxChars: MAX_SENTENCE_CHARS, dayBudget: DAY_CHAR_BUDGET,
    minBudget: MINUTE_REQUEST_BURST });
  if (!gate.allowed) {
    await usageRecord(env, { ns: "usage", uid, chars: 0, over: gate.over });
    return json({ error: "fair_use", over: gate.over }, { status: 429 });
  }

  let audio;
  try {
    // Fair use counts the sentence chars, not the prosody tags (§ 4).
    audio = await synthesize(env, applyEmotionalProsody(text, feeling), voice);
  } catch {
    return json({ error: "grok_failed" }, { status: 502 });
  }
  if (!audio) return json({ error: "voice_unavailable" }, { status: 503 });

  const after = (async () => {
    await usageRecord(env, { ns: "usage", uid, chars: text.length });
    if (eligible) {
      await env.VOICE.put(key, audio, {
        customMetadata: { voice, feeling, chars: String(text.length) },
      });
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;

  return new Response(audio, {
    headers: {
      "content-type": "audio/mpeg",
      // private = spoken but device-cache only (024 § 5); never stored
      // where a fast answer would reveal someone said it before.
      "x-voice-cache": eligible ? "miss" : "private",
    },
  });
}
