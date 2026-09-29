import assert from "node:assert/strict";
import { test } from "node:test";

import { listMintRuns, mintRunFileList, reviewUrlQuery } from "./elevenlabs_mint_run.mjs";

test("reviewUrlQuery encodes mint-run filter", () => {
  const q = reviewUrlQuery("gap-launch-food-2026-09-29");
  assert.match(q, /ship=mint-run/);
  assert.match(q, /runId=gap-launch-food-2026-09-29/);
});

test("retroactive gap mint run lists 32 plain takes", () => {
  const runs = listMintRuns("elevenlabs-tiles-core");
  const hit = runs.find((r) => r.runId === "gap-launch-food-2026-09-29");
  assert.ok(hit, "gap-launch-food-2026-09-29 manifest");
  assert.equal(hit.itemCount, 32);
  const files = mintRunFileList("gap-launch-food-2026-09-29", "elevenlabs-tiles-core", "takes");
  assert.equal(files.length, 32);
  assert.equal(files[0].spokenText, "cucumber");
  assert.equal(files[31].spokenText, "milkshake");
});
