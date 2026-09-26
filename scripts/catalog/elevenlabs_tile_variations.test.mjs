import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogSlug,
  tileTakeFilename,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";

test("tileVariationText plain, period, emphasis", () => {
  assert.equal(tileVariationText("find", "plain"), "find");
  assert.equal(tileVariationText("find", "period"), "find.");
  assert.equal(tileVariationText("find.", "period"), "find.");
  assert.equal(tileVariationText("all done", "emphasis"), "ALL DONE");
});

test("catalogSlug and take filenames", () => {
  assert.equal(catalogSlug("all done"), "all_done");
  assert.equal(tileTakeFilename("all_done", "plain"), "all_done_plain.mp3");
});
