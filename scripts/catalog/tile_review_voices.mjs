/**
 * Founder-facing tile review: map tile_voices.json → sample batches.
 */

import {
  ELEVENLABS_FORMS_LEO_BATCH,
  ELEVENLABS_TILES_LEO_BATCH,
  FORMS_REVIEW_BATCH,
  TILE_REVIEW_BATCH,
} from "./elevenlabs_tile_variations.mjs";
import { loadTileVoices } from "./tile_voices.mjs";

/** @typedef {{ surfaceId: string, label: string, batch: string, canPublishCatalog: boolean }} TileReviewSurface */

/** @type {Record<string, TileReviewSurface[]>} */
export const REVIEW_SURFACES_BY_VOICE = {
  voi_default_en: [
    {
      surfaceId: "tiles",
      label: "Launch tiles",
      batch: TILE_REVIEW_BATCH,
      canPublishCatalog: true,
    },
    {
      surfaceId: "forms",
      label: "Word forms",
      batch: FORMS_REVIEW_BATCH,
      canPublishCatalog: true,
    },
  ],
  voi_leo_en: [
    {
      surfaceId: "tiles",
      label: "Launch tiles",
      batch: ELEVENLABS_TILES_LEO_BATCH,
      canPublishCatalog: false,
    },
    {
      surfaceId: "forms",
      label: "Word forms",
      batch: ELEVENLABS_FORMS_LEO_BATCH,
      canPublishCatalog: false,
    },
  ],
};

export function listTileReviewVoices() {
  const doc = loadTileVoices();
  return (doc.voices ?? [])
    .filter((v) => REVIEW_SURFACES_BY_VOICE[v.voice_key])
    .map((v) => ({
      voice_key: v.voice_key,
      display_name: v.display_name,
      status: v.status,
      surfaces: REVIEW_SURFACES_BY_VOICE[v.voice_key],
    }));
}

/**
 * @param {string} voiceKey
 * @param {string} [surfaceId]
 */
export function resolveTileReviewLane(voiceKey, surfaceId = "tiles") {
  const surfaces = REVIEW_SURFACES_BY_VOICE[voiceKey];
  if (!surfaces?.length) throw new Error(`no review lane for voice: ${voiceKey}`);
  const surface = surfaces.find((s) => s.surfaceId === surfaceId) ?? surfaces[0];
  return { voice_key: voiceKey, ...surface };
}

/** @param {string} batch */
export function voiceLaneForBatch(batch) {
  for (const [voice_key, surfaces] of Object.entries(REVIEW_SURFACES_BY_VOICE)) {
    for (const s of surfaces) {
      if (s.batch === batch) return { voice_key, surfaceId: s.surfaceId, ...s };
    }
  }
  return null;
}

export function canPublishCatalogBatch(batch) {
  const lane = voiceLaneForBatch(batch);
  return lane?.canPublishCatalog ?? false;
}

/** Review page path + query for a mint run. */
export function tileReviewUrlForRun(runId, batch) {
  const lane = voiceLaneForBatch(batch);
  const q = new URLSearchParams({
    folder: "takes",
    ship: "mint-run",
    runId,
  });
  if (lane) {
    q.set("voice", lane.voice_key);
    q.set("surface", lane.surfaceId);
  } else {
    q.set("batch", batch);
  }
  return `/audio-review/elevenlabs-tiles?${q.toString()}`;
}
