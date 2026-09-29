/**
 * 028 § 4.2/4.4 — the tile mint recipe, shared by the Worker, the v4 lab,
 * and the IPA tooling. Pure module: no Node APIs, safe everywhere.
 *
 * tileMintText produces exactly the text the lab proved for v4_plain:
 * a lexical guard for labels that name a body sound, a US-citation IPA
 * override for laugh/laughing, plain text otherwise.
 */

/** Dedupe-key ingredient (028 § 4.5). Bump only when the recipe or model
 *  changes and every clip should re-mint. */
export const TILE_PROFILE = "v4-plain-1";

/** § 4.2 text rules — the Worker enforces, the client mirrors. */
export const TILE_TEXT_MAX = 60;
export const TILE_TEXT_ALLOW_RE = /^[\p{Script=Latin}\p{N}\s'’\-.,!?&]+$/u;

/** IPA alone still performs the sound — use the lexical v4 line instead. */
const LEXICAL_GUARD_LABEL_RE =
  /^(coughing|coughs?|sneezing|sneezes?|burps?|burping|hiccups?|hiccuping)$/i;

/** @param {string} word */
export function ipaOverrideForSoundEffectLabel(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (w === "laughs" || w === "laugh") return "/lævz/";
  if (w === "laughing") return "/ˈlæfɪŋ/";
  return "";
}

/** @param {string} word */
export function lexicalV4GuardText(word) {
  const w = String(word ?? "").trim();
  const line = w.endsWith(".") ? w : `${w}.`;
  return `[isolated dictionary word, do not make the sound] ${line}`;
}

/** @param {string} word */
export function needsLexicalV4Guard(word) {
  return LEXICAL_GUARD_LABEL_RE.test(String(word ?? "").trim());
}

export function needsSoundEffectIpaOverride(word) {
  const w = String(word ?? "").trim().toLowerCase();
  return w === "laughs" || w === "laugh" || w === "laughing";
}

/**
 * Trim + slash-wrap an IPA field; throws on unexpected characters.
 * @param {string} ipa
 */
export function normalizeIpaField(ipa) {
  const raw = String(ipa ?? "").trim();
  if (!raw) return "";
  const inner = raw.replace(/^\/+|\/+$/g, "").trim();
  if (!inner) return "";
  if (!/^[\p{L}\p{M}\p{Nd}\sˈˌːʰʷʼ˞\-.,]+$/u.test(inner)) {
    throw new Error("ipa contains unexpected characters");
  }
  return `/${inner}/`;
}

/**
 * Eleven v4: grapheme plus IPA in slashes (see ElevenLabs best practices).
 * @param {string} spoken
 * @param {string} ipa e.g. /æn/
 */
export function formatElevenV4IpaLine(spoken, ipa) {
  const word = String(spoken ?? "").trim();
  const wrapped = normalizeIpaField(ipa);
  if (!word) return wrapped;
  // Single-word tiles: grapheme + IPA makes Eleven say both (e.g. "an /æn/" → "an" + "Anne").
  if (!/\s/.test(word)) return wrapped;
  return `${word} ${wrapped}`;
}

/**
 * The exact text sent to ElevenLabs for a normalized tile label
 * (v4_plain recipe — § 4.4). `ipa` forces the IPA line (admin remint).
 * @param {string} normalizedText already normalizeV1'd
 * @param {{ ipa?: string }} [opts]
 */
export function tileMintText(normalizedText, { ipa } = {}) {
  const w = String(normalizedText ?? "").trim();
  const forced = normalizeIpaField(ipa ?? "");
  if (forced) return formatElevenV4IpaLine(w, forced);
  if (needsLexicalV4Guard(w)) return lexicalV4GuardText(w);
  const override = ipaOverrideForSoundEffectLabel(w);
  if (override) return formatElevenV4IpaLine(w, override);
  return w;
}
