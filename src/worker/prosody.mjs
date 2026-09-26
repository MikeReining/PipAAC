/**
 * 025 § 4 — the locked emotional prosody formulas
 * (docs/operations/Grok_Voice_Emotional_Prosody.md § 2, verified
 * 2026-09-25). Applied on the Worker so the formulas live in one
 * place: the client sends the plain sentence and a feeling name, and
 * the tags — never the client — shape the prosody.
 *
 * § 1's core law stands: sound-effect tags ([laugh], [cry]…) are
 * banned. All emotion is pure wrapping tags plus terminal
 * punctuation.
 */
export const FEELINGS = new Set(["happy", "sad", "angry"]);

/** {text} = the sentence without its final . ! ?; {end} keeps a
 *  question a question in every feeling (a ❓-transformed bar stays
 *  rising, happy or angry), otherwise ! for happy/angry and . for
 *  sad/neutral. */
export function applyEmotionalProsody(text, feeling = "neutral") {
  const trimmed = String(text).trim();
  const clean = trimmed.replace(/[.!?]+$/, "").trim();
  const q = /\?$/.test(trimmed) ? "?" : null;
  switch (feeling) {
    case "happy":
      return `<higher-pitch><emphasis>${clean}${q ?? "!"}</emphasis></higher-pitch>`;
    case "sad":
      return `<emphasis>${clean}${q ?? "."}</emphasis>`;
    case "angry":
      return `<loud><emphasis>${clean}${q ?? "!"}</emphasis></loud>`;
    default:
      return `${clean}${q ?? "."}`;
  }
}
