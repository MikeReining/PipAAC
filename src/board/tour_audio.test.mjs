/**
 * Tour sentence-audio law: the demo's scripted sentences ("You want an
 * apple.") must play through the app's shared audio element (board.say →
 * playClip), which is unlocked by the tap's gesture. A fresh Audio() or
 * an awaited fetch before play() loses iOS user activation and the
 * sentence stays silent — reported twice on iPad (2026-10-01), once for
 * ✨ fix and once for ⏪ past. The clip keys must also exist in
 * ONRAMP_CLIPS, or sayBar falls into the license-gated live pipeline a
 * first-run user can't satisfy.
 * DEBUGLOG 2026-10-01 tour-sentence-audio-silent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tour = readFileSync(new URL("../../public/board/tour-ui.js", import.meta.url), "utf8");
const audio = readFileSync(new URL("../../public/shared/onramp_audio.mjs", import.meta.url), "utf8");

test("sayBar plays through the shared element and falls back to the live pipeline", () => {
  const i = tour.indexOf("function sayBar");
  assert.ok(i > 0, "sayBar must exist");
  const body = tour.slice(i, tour.indexOf("\n  }", i));
  assert.match(body, /board\.say\(name\)/, "the clip must ride the shared audio element");
  assert.match(body, /board\.speakBar\(\)/, "a missing clip still speaks the bar");
  // The bug's shape: a separate element or a fetch gate before play().
  assert.doesNotMatch(body, /new Audio|fetch\(/);
});

test("every sentence the tour speaks has a shipped clip key", () => {
  for (const key of ["you-want-an-apple", "do-you-want-an-apple"]) {
    assert.ok(tour.includes(`"${key}"`), `tour must call sayBar("${key}")`);
    assert.ok(audio.includes(`"${key}":`), `ONRAMP_CLIPS must mint "${key}"`);
  }
});
