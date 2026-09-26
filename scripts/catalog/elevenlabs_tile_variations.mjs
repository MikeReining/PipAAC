/**
 * ElevenLabs v3 variation matrix for single-word tile gap-fill.
 * See https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices (Prompting Eleven v3).
 *
 * Grok explore uses XML tags (<emphasis>, <loud>); v3 uses punctuation, capitalization, and [audio tags].
 * Tiles default to plain + period; emphasis is ALL CAPS (v3 capitalization guidance).
 */

export const TILE_REVIEW_BATCH = "elevenlabs-tiles-core";

/** @typedef {"plain" | "period" | "emphasis"} TileVariationId */

export const TILE_VARIATION_IDS = ["plain", "period", "emphasis"];

export function catalogSlug(spokenText) {
  return spokenText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} word spoken catalog text (may be multi-word, e.g. "all done")
 * @param {TileVariationId} variationId
 */
export function tileVariationText(word, variationId) {
  const w = String(word ?? "").trim();
  if (!w) throw new Error("word is required");
  switch (variationId) {
    case "plain":
      return w;
    case "period":
      return w.endsWith(".") ? w : `${w}.`;
    case "emphasis":
      return w.toUpperCase();
    default:
      throw new Error(`unknown tile variation: ${variationId}`);
  }
}

export function tileTakeFilename(slug, variationId) {
  return `${slug}_${variationId}.mp3`;
}

export function isTileReviewBatch(batch) {
  return batch === TILE_REVIEW_BATCH;
}
