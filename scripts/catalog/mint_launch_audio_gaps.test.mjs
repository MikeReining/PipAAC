import assert from "node:assert/strict";
import { test } from "node:test";

import { listLaunchClipGaps } from "./mint_launch_audio_gaps.mjs";

test("listLaunchClipGaps returns sorted launch rows missing clips", () => {
  const gaps = listLaunchClipGaps();
  assert.ok(Array.isArray(gaps));
  assert.ok(gaps.every((g) => g.slot && g.spokenText && g.slug));
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(gaps[i].slot >= gaps[i - 1].slot);
  }
});
