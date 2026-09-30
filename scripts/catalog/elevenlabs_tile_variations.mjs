/**
 * ElevenLabs variation matrix for single-word tile gap-fill (eleven_v4 only —
 * v3 is retired, 028 slice 0).
 *
 * Grok explore uses XML tags (<emphasis>, <loud>); the ElevenLabs takes are
 * plain + period, with ALL CAPS as the optional emphasis take.
 */

export const TILE_REVIEW_BATCH = "elevenlabs-tiles-core";
export const FORMS_REVIEW_BATCH = "elevenlabs-forms-core";
/** Alternate tile voice seed (Leo) — local takes only until 028 slice 6 publish path. */
export const ELEVENLABS_TILES_LEO_BATCH = "elevenlabs-tiles-leo";
/** Leo's word-form takes (028 slice 6). */
export const ELEVENLABS_FORMS_LEO_BATCH = "elevenlabs-forms-leo";

const ELEVENLABS_REVIEW_BATCHES = new Set([
  TILE_REVIEW_BATCH,
  FORMS_REVIEW_BATCH,
  ELEVENLABS_TILES_LEO_BATCH,
  ELEVENLABS_FORMS_LEO_BATCH,
]);

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

export function isElevenlabsReviewBatch(batch) {
  return ELEVENLABS_REVIEW_BATCHES.has(batch);
}

/** @deprecated use isElevenlabsReviewBatch */
export function isTileReviewBatch(batch) {
  return isElevenlabsReviewBatch(batch);
}
