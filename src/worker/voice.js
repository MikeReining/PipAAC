/**
 * 024 slice 1 — POST /api/v1/voice/speak.
 *
 * Whole-sentence Eleven v4 behind the Worker (2026-09-29): same voice_key
 * as tile playback (tile_voices.json). Shared R2 cache for eligible
 * sentences (024 § 5), per-license fair-use (§ 6a), no user ids upstream.
 *
 * Cache key = sha256(voice_key + model + feeling + normalized text).
 */
import tileVoices from "../../data/catalog/tile_voices.json" with { type: "json" };
import { checkLicense } from "./license.mjs";
import { consumeSpeakGrant, peekSpeakGrant } from "./taste.mjs";
import { FEELINGS } from "./prosody.mjs";
import { elevenExpressiveMintText } from "../shared/expressive_eleven.mjs";

import voiceWords from "../../data/catalog/voice_words.en.json" with { type: "json" };

const TILE_VOICES = new Map(tileVoices.voices.map((v) => [v.voice_key, v]));

const ELIGIBLE = new Set(voiceWords.words);

/** Bumps cache namespace when the TTS provider or recipe changes. */
export const VOICE_MODEL = "eleven_v4-expressive-1";

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

/** 025 § 4: the feeling is part of the recording's identity. */
export const cacheKeyMaterial = (voiceKey, text, feeling = "neutral") =>
  `${voiceKey}|${VOICE_MODEL}|${feeling}|${normalizeText(text)}`;

const CONTRACTION = /(?:'s|'m|'re|'ve|'ll|'d|n't)$/i;

/** 024 § 5: every word resolves to the eligible set. */
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

export function resolveSentenceVoice(voiceKey) {
  const row = TILE_VOICES.get(String(voiceKey ?? ""));
  if (!row || row.status !== "active" || row.provider !== "elevenlabs") return null;
  return row;
}

/** @deprecated use resolveSentenceVoice — tests and imports may still say VOICE_IDS */
export const VOICE_IDS = new Set(
  tileVoices.voices.filter((v) => v.status === "active").map((v) => v.voice_key),
);

const counterKey = (ns, uid, ts = Date.now(), per = "day") =>
  per === "day"
    ? `${ns}/${uid}/${new Date(ts).toISOString().slice(0, 10)}`
    : `${ns}-min/${uid}/${Math.floor(ts / 60000)}`;

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
  if (over) {
    await env.VOICE.put(`${ns}-hits/${uid}/${Date.now()}`,
      JSON.stringify({ over, chars }));
  }
}

/** Eleven v4 expressive sentence. env.VOICE_SYNTH is the test seam. */
async function synthesize(env, mintText, voiceRow) {
  if (typeof env.VOICE_SYNTH === "function") {
    return env.VOICE_SYNTH(mintText, { voice: voiceRow.voice_key });
  }
  if (!env.ELEVENLABS_API_KEY) return null;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceRow.voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: mintText,
        model_id: voiceRow.model,
        voice_settings: voiceRow.voice_settings,
      }),
    });
  if (!res.ok) throw new Error(`elevenlabs_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function handleSpeak(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
    return json({ error: "bad_user_id" }, { status: 400 });
  }
  const licensed = await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license);
  /* 039 § 4.2 — a taste-spent transform leaves a one-shot speak grant
   * keyed by the transform's output text. The client echoes that text
   * back as taste_text (it is still name-masked — the spoken text may
   * carry her real names, the grant never does). Neutral feeling only,
   * consumed once audio is served, never covers other text. */
  let grantedText = null;
  if (!licensed) {
    const echo = typeof body?.taste_text === "string" && body.taste_text
      ? body.taste_text
      : (typeof body?.text === "string" ? body.text : "");
    const feelingAsked = body?.feeling == null ? "neutral" : body.feeling;
    if (env.VOICE && feelingAsked === "neutral"
        && await peekSpeakGrant(env, uid, echo)) {
      grantedText = echo;
    } else {
      return json({ error: "bad_license" }, { status: 403 });
    }
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_SENTENCE_CHARS) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  const voiceKey = typeof body?.voice === "string" ? body.voice : "voi_default_en";
  const voiceRow = resolveSentenceVoice(voiceKey);
  if (!voiceRow) return json({ error: "bad_voice" }, { status: 400 });
  const feeling = body?.feeling == null || body.feeling === "neutral"
    ? "neutral" : body.feeling;
  if (!FEELINGS.has(feeling) && feeling !== "neutral") {
    return json({ error: "bad_feeling" }, { status: 400 });
  }
  if (!env.VOICE) return json({ error: "voice_unavailable" }, { status: 503 });

  const eligible = eligibleSentence(text);
  const key = `speak/${await hexSha256(cacheKeyMaterial(voiceKey, text, feeling))}`;

  if (eligible) {
    const obj = await env.VOICE.get(key).catch(() => null);
    if (obj) {
      if (grantedText) await consumeSpeakGrant(env, uid, grantedText);
      return new Response(obj.body, {
        headers: { "content-type": "audio/mpeg", "x-voice-cache": "hit" },
      });
    }
  }

  const gate = await usageCheck(env, { ns: "usage", uid, chars: text.length,
    maxChars: MAX_SENTENCE_CHARS, dayBudget: DAY_CHAR_BUDGET,
    minBudget: MINUTE_REQUEST_BURST });
  if (!gate.allowed) {
    await usageRecord(env, { ns: "usage", uid, chars: 0, over: gate.over });
    return json({ error: "fair_use", over: gate.over }, { status: 429 });
  }

  const mintText = elevenExpressiveMintText(text, feeling);
  let audio;
  try {
    audio = await synthesize(env, mintText, voiceRow);
  } catch {
    return json({ error: "tts_failed" }, { status: 502 });
  }
  if (!audio) return json({ error: "voice_unavailable" }, { status: 503 });

  const after = (async () => {
    await usageRecord(env, { ns: "usage", uid, chars: text.length });
    if (eligible) {
      await env.VOICE.put(key, audio, {
        customMetadata: { voice: voiceKey, feeling, chars: String(text.length) },
      });
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  if (grantedText) await consumeSpeakGrant(env, uid, grantedText);

  return new Response(audio, {
    headers: {
      "content-type": "audio/mpeg",
      "x-voice-cache": eligible ? "miss" : "private",
    },
  });
}
