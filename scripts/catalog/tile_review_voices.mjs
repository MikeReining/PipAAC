/**
 * Founder-facing tile review: map tile_voices.json → sample batches.
 */

import {
  FORMS_REVIEW_BATCH,
  TILE_REVIEW_BATCH,
  formsSeedBatchForVoice,
  tileSeedBatchForVoice,
} from "./elevenlabs_tile_variations.mjs";
import { loadTileVoices } from "./tile_voices.mjs";

/** @typedef {{ surfaceId: string, label: string, batch: string, canPublishCatalog: boolean }} TileReviewSurface */

const PIP_SURFACES = [
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
];

/**
 * Review surfaces for a tile voice. Extra voices get their derived seed
 * lanes (elevenlabs-{tiles,forms}-<name>); null when a voice has no lanes.
 * @param {string} voiceKey
 * @returns {TileReviewSurface[] | null}
 */
export function reviewSurfacesForVoice(voiceKey) {
  if (voiceKey === "voi_default_en") return PIP_SURFACES;
  const tiles = tileSeedBatchForVoice(voiceKey);
  if (!tiles) return null;
  return [
    {
      surfaceId: "tiles",
      label: "Launch tiles",
      batch: tiles,
      canPublishCatalog: false,
    },
    {
      surfaceId: "forms",
      label: "Word forms",
      batch: formsSeedBatchForVoice(voiceKey),
      canPublishCatalog: false,
    },
  ];
}

export function listTileReviewVoices() {
  const doc = loadTileVoices();
  return (doc.voices ?? [])
    .map((v) => ({
      voice_key: v.voice_key,
      display_name: v.display_name,
      status: v.status,
      surfaces: reviewSurfacesForVoice(v.voice_key),
    }))
    .filter((v) => v.surfaces);
}

/**
 * @param {string} voiceKey
 * @param {string} [surfaceId]
 */
export function resolveTileReviewLane(voiceKey, surfaceId = "tiles") {
  const surfaces = reviewSurfacesForVoice(voiceKey);
  if (!surfaces?.length) throw new Error(`no review lane for voice: ${voiceKey}`);
  const surface = surfaces.find((s) => s.surfaceId === surfaceId) ?? surfaces[0];
  return { voice_key: voiceKey, ...surface };
}

/** @param {string} batch */
export function voiceLaneForBatch(batch) {
  for (const v of loadTileVoices().voices ?? []) {
    for (const s of reviewSurfacesForVoice(v.voice_key) ?? []) {
      if (s.batch === batch) return { voice_key: v.voice_key, surfaceId: s.surfaceId, ...s };
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
