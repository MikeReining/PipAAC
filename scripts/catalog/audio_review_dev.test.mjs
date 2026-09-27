import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  backupPathsForSampleRel,
  emphasisGrokText,
  emphasisTakePathForSampleRel,
  listBatches,
  pruneShortlistForSlug,
  slugFromMp3,
} from "./audio_review_dev.mjs";

test("emphasisTakePathForSampleRel and emphasisGrokText", () => {
  const p = emphasisTakePathForSampleRel("batch-24-core/shortlist/hot_recommended.mp3");
  assert.equal(p.rel, "batch-24-core/takes/hot_emphasis.mp3");
  assert.equal(emphasisGrokText("hot"), "<emphasis>hot</emphasis>");
  assert.equal(slugFromMp3("hot_emphasis.mp3"), "hot");
});

test("backupPathsForSampleRel targets takes even from shortlist", () => {
  const fromShortlist = backupPathsForSampleRel("batch-21-core/shortlist/hurt_recommended.mp3");
  assert.equal(fromShortlist.rel, "batch-21-core/takes/hurt_backup.mp3");
  assert.equal(fromShortlist.slug, "hurt");
});

test("slugFromMp3 strips known take suffixes", () => {
  assert.equal(slugFromMp3("bath_backup.mp3"), "bath");
  assert.equal(slugFromMp3("bathroom_plain.mp3"), "bathroom");
  assert.equal(slugFromMp3("bath_recommended.mp3"), "bath");
});

test("listBatches splits grok explore vs elevenlabs tile pipelines", () => {
  const grok = listBatches("grok");
  const tiles = listBatches("elevenlabs-catalog");
  assert.ok(grok.every((b) => /^batch-\d+-core$/.test(b)));
  assert.ok(!grok.some((b) => b.startsWith("elevenlabs-")));
  if (tiles.length) assert.ok(tiles.includes("elevenlabs-tiles-core"));
});

test("pruneShortlistForSlug removes same-slug variants only", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-shortlist-"));
  const names = [
    "bath_plain.mp3",
    "bath_period.mp3",
    "bath_recommended.mp3",
    "bathroom_recommended.mp3",
    "shower_plain.mp3",
  ];
  for (const n of names) writeFileSync(join(dir, n), "x");

  const removed = pruneShortlistForSlug(dir, "bath", "bath_recommended.mp3");
  assert.deepEqual(removed.sort(), ["bath_period.mp3", "bath_plain.mp3"]);
  const left = readdirSync(dir).sort();
  assert.deepEqual(left, ["bath_recommended.mp3", "bathroom_recommended.mp3", "shower_plain.mp3"]);
});
