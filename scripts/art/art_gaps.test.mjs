import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  indexSymbolFiles,
  resolveCoreSymbol,
  computeCoreGaps,
  computeExtendedGaps,
  computeGroupWalkQueue,
} from "./art_gaps.mjs";

test("indexSymbolFiles prefers png over jpg and skips _roll alternates", () => {
  const dir = join(tmpdir(), `art-gaps-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "wet_wipe_roll2.png"), "");
  writeFileSync(join(dir, "wet_wipe.jpg"), "");
  writeFileSync(join(dir, "wet_wipe.png"), "");
  const map = indexSymbolFiles(dir);
  assert.equal(map.get("wet wipe"), "wet_wipe.png");
});

test("computeCoreGaps lists missing slots and respects existing symbols", () => {
  const dir = join(tmpdir(), `art-gaps-core-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "apple.png"), "");
  const lexicon = {
    entries: [
      { slot: 1, spokenText: "apple", partOfSpeech: "Noun" },
      { slot: 2, spokenText: "narrow", partOfSpeech: "Adjective", visualStyle: "Diagrammatic" },
    ],
  };
  const report = computeCoreGaps(lexicon, dir, new Set());
  assert.equal(report.haveSymbol, 1);
  assert.equal(report.missingCount, 1);
  assert.equal(report.missing[0].spokenText, "narrow");
  assert.equal(report.nextBatchOfTen[0].slot, 2);
});

test("computeGroupWalkQueue orders by group index and dedupes", () => {
  const coreGaps = {
    missing: [
      { slot: 2, spokenText: "b" },
      { slot: 1, spokenText: "a" },
    ],
  };
  const catalog = {
    groups: [
      { id: "grp_one", index_slot: 10 },
      { id: "grp_two", index_slot: 20 },
    ],
    groupMembers: [
      { group_id: "grp_one", item_kind: "sense", item_id: "sns_0002" },
      { group_id: "grp_two", item_kind: "sense", item_id: "sns_0001" },
      { group_id: "grp_two", item_kind: "sense", item_id: "sns_0001" },
    ],
  };
  const report = computeGroupWalkQueue(coreGaps, catalog, 10);
  assert.equal(report.queue.length, 2);
  assert.equal(report.queue[0].spokenText, "b");
  assert.equal(report.queue[1].spokenText, "a");
});

test("computeExtendedGaps classifies missing vs needs review", () => {
  const artRoot = join(tmpdir(), `art-gaps-ext-${Date.now()}`);
  mkdirSync(artRoot, { recursive: true });
  writeFileSync(join(artRoot, "clap.png"), "");
  const extended = {
    entries: [
      { id: "clap", text: "clap", spokenText: "clap", category: "Actions", art: "draw" },
      { id: "wave", text: "wave", spokenText: "wave", category: "Actions", art: "draw" },
      { id: "amazon", text: "Amazon", spokenText: "amazon", category: "Brand", art: "none" },
    ],
  };
  const report = computeExtendedGaps(extended, artRoot, { clap: "approve" });
  assert.equal(report.totalDrawRows, 2);
  assert.equal(report.counts.approved, 1);
  assert.equal(report.counts.missing, 1);
  assert.equal(report.missing[0].id, "wave");
});
