import assert from "node:assert/strict";
import test from "node:test";

import { ELEVENLABS_TILES_LEO_BATCH, TILE_REVIEW_BATCH } from "./elevenlabs_tile_variations.mjs";
import {
  listTileReviewVoices,
  resolveTileReviewLane,
  tileReviewUrlForRun,
  voiceLaneForBatch,
} from "./tile_review_voices.mjs";

test("listTileReviewVoices includes Pip and Leo", () => {
  const voices = listTileReviewVoices();
  const keys = voices.map((v) => v.voice_key);
  assert.ok(keys.includes("voi_default_en"));
  assert.ok(keys.includes("voi_leo_en"));
});

test("resolveTileReviewLane maps Leo to leo batch", () => {
  const lane = resolveTileReviewLane("voi_leo_en", "tiles");
  assert.equal(lane.batch, ELEVENLABS_TILES_LEO_BATCH);
  assert.equal(lane.canPublishCatalog, false);
});

test("voiceLaneForBatch round-trips Pip tiles", () => {
  const lane = voiceLaneForBatch(TILE_REVIEW_BATCH);
  assert.equal(lane?.voice_key, "voi_default_en");
  assert.equal(lane?.surfaceId, "tiles");
});

test("tileReviewUrlForRun uses voice query params", () => {
  const url = tileReviewUrlForRun("leo-pilot-10-1", ELEVENLABS_TILES_LEO_BATCH);
  assert.match(url, /voice=voi_leo_en/);
  assert.match(url, /runId=leo-pilot-10-1/);
});
