/**
 * 025 expressive sentences on Eleven v4 — same voice as tile playback (Eve/Leo per
 * tile_voices.json). Founder decision 2026-09-29: migrate off Grok Ara for feelings
 * so tiles and sentences share one Eleven clone.
 *
 * Grok XML formulas remain in src/worker/prosody.mjs (legacy / compare only).
 */

/** Ear-approved v4 audio-tag prefixes (probe compare-v1, founder 2026-09-29). */
export const ELEVEN_EXPRESSIVE_WINNERS = {
  happy: { prefix: "[cheerful, bright voice] ", lineFeeling: "happy" },
  sad: { prefix: "[sad] ", lineFeeling: "sad" },
  angry: { prefix: "[frustrated] ", lineFeeling: "angry" },
};

export const ELEVEN_EXPRESSIVE_FEELINGS = ["happy", "sad", "angry"];

/** Terminal punctuation aligned with 025 / prosody.mjs (no Grok XML). */
export function elevenSentenceLine(sentence, feeling = "neutral") {
  const trimmed = String(sentence ?? "").trim();
  const clean = trimmed.replace(/[.!?]+$/, "").trim();
  const q = /\?$/.test(trimmed) ? "?" : null;
  if (q) return `${clean}?`;
  if (feeling === "happy" || feeling === "angry") return `${clean}!`;
  return `${clean}.`;
}

/**
 * Exact string for Eleven TTS for a face tap (feeling) or neutral ▶.
 * @param {string} sentence bar text
 * @param {"neutral"|"happy"|"sad"|"angry"} feeling
 */
export function elevenExpressiveMintText(sentence, feeling = "neutral") {
  if (feeling === "neutral") return elevenSentenceLine(sentence, "neutral");
  const w = ELEVEN_EXPRESSIVE_WINNERS[feeling];
  if (!w) throw new Error(`unsupported feeling: ${feeling}`);
  const line = elevenSentenceLine(sentence, w.lineFeeling);
  return `${w.prefix}${line}`.trim();
}
