/**
 * 028 § 4.2/4.4 — the tile mint recipe, shared by the Worker, the v4 lab,
 * and the IPA tooling. Pure module: no Node APIs, safe everywhere.
 *
 * tileMintText produces exactly the text the lab proved for v4_plain:
 * a lexical guard for labels that name a body sound, a US-citation IPA
 * override for laugh/laughing, homograph IPA for labels like I, plain otherwise.
 *
 * ## Inflection rule (do not skip)
 * Mint text is keyed to the **exact catalog label**, not the lemma family.
 * Never reuse plural / -ing IPA on a different surface form — e.g. `/lævz/` is
 * for the label **laughs** only; the lemma **laugh** must use **`/læf/`** or
 * Eleven says “laughs”. See `ipaOverrideForSoundEffectLabel` and
 * `docs/operations/ElevenLabs_Tile_Minting.md` § Tile mint recipe.
 */

import { normalizeV1 } from "../../public/shared/normalize.mjs";

/** Dedupe-key ingredient (028 § 4.5). Bump only when the recipe or model
 *  changes and every clip should re-mint. */
export const TILE_PROFILE = "v4-plain-1";

/** § 4.2 text rules — the Worker enforces, the client mirrors. */
export const TILE_TEXT_MAX = 60;
export const TILE_TEXT_ALLOW_RE = /^[\p{Script=Latin}\p{N}\s'’\-.,!?&]+$/u;

/** IPA alone still performs the sound — use the lexical v4 line instead. */
const LEXICAL_GUARD_LABEL_RE =
  /^(coughing|coughs?|sneezing|sneezes?|burps?|burping|hiccups?|hiccuping)$/i;

/** US citation IPA for single-word labels where v4 plain misreads (Roman numerals, etc.). */
const HOMOGRAPH_IPA_OVERRIDES = {
  i: "/aɪ/", // "I" → "one" if sent as plain grapheme
  a: "/æ/", // indefinite article, not letter name
  an: "/æn/", // not "Anne"
};

/** @param {string} word normalized (normalizeV1) or raw label */
export function ipaOverrideForHomographLabel(word) {
  const w = String(word ?? "").trim().toLowerCase();
  return HOMOGRAPH_IPA_OVERRIDES[w] ?? "";
}

/** @param {string} word */
export function ipaOverrideForSoundEffectLabel(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (w === "laughs") return "/lævz/"; // plain → "logs"; /lævz/ is the laughs form
  if (w === "laugh") return "/læf/"; // not /lævz/ — Eleven reads that as "laughs"
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

export function needsHomographIpaOverride(word) {
  return Boolean(ipaOverrideForHomographLabel(word));
}

/**
 * Plain + period Eleven text for catalog tile variations (028 § 4.4).
 * @param {string} spokenText display label from lexicon
 * @param {"plain" | "period"} variationId
 */
export function tileMintTextForVariation(spokenText, variationId) {
  const w = String(spokenText ?? "").trim();
  const norm = normalizeV1(w.replace(/\.+$/, ""));
  const mint = tileMintText(norm);
  if (variationId === "plain") return mint;
  if (variationId === "period") {
    if (mint !== norm) return mint;
    return `${norm}.`;
  }
  throw new Error(`unsupported variation: ${variationId}`);
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
  const homograph = ipaOverrideForHomographLabel(w);
  if (homograph) return formatElevenV4IpaLine(w, homograph);
  return w;
}
