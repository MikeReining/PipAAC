import assert from "node:assert/strict";
import { test } from "node:test";

import { inferSpokenFromFilename } from "./scan_local_audio.mjs";

test("inferSpokenFromFilename strips ara_ prefix and accepts plain words", () => {
  assert.equal(inferSpokenFromFilename("/tmp/ara_the.mp3"), "the");
  assert.equal(inferSpokenFromFilename("/tmp/the.mp3"), "the");
  assert.equal(inferSpokenFromFilename("/tmp/happy_emphasis_pitch.mp3"), null);
});
