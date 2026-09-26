import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { slugFromMp3 } from "./audio_review_dev.mjs";
import {
  enrichFileListForTiles,
  filterFilesByShip,
  lookupCatalogWord,
  normalizeSpokenQuery,
} from "./tile_catalog_lookup.mjs";

test("normalizeSpokenQuery collapses spaces", () => {
  assert.equal(normalizeSpokenQuery("  All   Done "), "all done");
});

test("lookupCatalogWord finds import row", () => {
  const hit = lookupCatalogWord("all done");
  assert.equal(hit.spokenText, "all done");
  assert.equal(hit.slug, "all_done");
  assert.equal(hit.slot, 56);
});

test("shipping log drives file filters", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-ship-"));
  const shippingPath = join(dir, "shipping.json");
  writeFileSync(
    shippingPath,
    JSON.stringify({
      schemaVersion: 1,
      bySlug: {
        bath: {
          slot: 1,
          spokenText: "bath",
          clip: { key: "audio/bath/abc.mp3" },
          publishedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  // recordTileShipping uses fixed path — test filter helpers only
  let files = enrichFileListForTiles(
    "b",
    "takes",
    [{ name: "bath_plain.mp3" }, { name: "soap_plain.mp3" }],
    slugFromMp3,
  );
  files = files.map((f, i) => ({ ...f, shippedViaReview: i === 0 }));
  assert.equal(filterFilesByShip(files, "needs-ship").length, 1);
  assert.equal(filterFilesByShip(files, "shipped").length, 1);
});

test("catalogSlug", () => {
  assert.equal(catalogSlug("all done"), "all_done");
});
