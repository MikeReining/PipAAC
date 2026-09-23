/**
 * 013 slice 5 Works Test — the Smart bar gives a running session's
 * target words a gentle Predict lift, never a takeover (§ 4).
 *
 * Proves against the scored shortlist itself: a never-picked fringe
 * target is ineligible without a session, becomes a candidate with one,
 * ranks below real evidence (the boost is a nudge, not a crown), at most
 * half the strip's slots can be target tiles, and the synced spot_boost
 * setting turns the whole thing off. The DOM leg — the rendered bar —
 * is scripts/probes/spot_boost_probe.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  logSelection, spotGate, stripCandidates, stripScored, STRIP_CAP,
} from "../../public/shared/funnel.mjs";
import {
  endSession, startSession,
} from "../../public/shared/spotlight.mjs";
import { setSetting } from "../../public/shared/groups.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";
import { TEST_MODEL } from "./test_model.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const senseId = (word) =>
  catalog.senses.find(
    (s) => catalog.labels.find((l) => l.sense_id === s.id && l.kind === "lemma")?.text === word,
  ).id;
const S = (word) => ({ kind: "sense", id: senseId(word) });
const NOW = Date.parse("2026-09-22T08:20:00");

const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

test("a never-picked fringe target is ineligible without a session, eligible with one", () => {
  const db = fresh();
  const juice = S("juice");
  const sentence = [S("want")]; // a verb tail invites noun-ish words
  const before = stripScored(db, sentence, NOW, "en", TEST_MODEL);
  assert.ok(!before.candidates.some((c) => c.id === juice.id),
    "no evidence, no session: juice stays out");

  startSession(db, { name: "Drinks", targets: [`sense:${juice.id}`], minutes: 15 });
  const during = stripScored(db, sentence, NOW, "en", TEST_MODEL);
  const tile = during.candidates.find((c) => c.id === juice.id);
  assert.ok(tile, "a running session makes the target a candidate");
  assert.equal(tile.x.spot, 1, "the instrument records the spotlight flag");

  endSession(db);
  const after = stripScored(db, sentence, NOW, "en", TEST_MODEL);
  assert.ok(!after.candidates.some((c) => c.id === juice.id),
    "ending the session restores baseline eligibility");
});

test("the boost is a nudge, not a crown: evidence still outranks it", () => {
  const db = fresh();
  const juice = S("juice"), milk = S("milk");
  // milk has real evidence: three recent picks.
  for (let i = 0; i < 3; i++) {
    logSelection(db, "sense", milk.id, NOW - i * 3600_000);
  }
  startSession(db, { name: "Drinks", targets: [`sense:${juice.id}`], minutes: 15 });
  const { candidates } = stripScored(db, [S("want")], NOW, "en", TEST_MODEL);
  const at = (id) => candidates.findIndex((c) => c.id === id);
  assert.ok(at(juice.id) >= 0 && at(milk.id) >= 0);
  assert.ok(at(milk.id) < at(juice.id),
    "an evidenced word still outranks a boosted zero-evidence target");
});

test("never taking over: at most half the slots go to target tiles", () => {
  const db = fresh();
  const targets = ["water", "milk", "juice", "tea"].map((w) => `sense:${senseId(w)}`);
  startSession(db, { name: "Drinks", targets, minutes: 15 });
  // Nothing else is eligible — targets are the only candidates, and the
  // gate still refuses to hand them the whole bar.
  const shown = stripCandidates(db, [S("want")], NOW, "en", TEST_MODEL);
  assert.ok(shown.length <= Math.floor(STRIP_CAP / 2),
    `target-only offer capped at ${Math.floor(STRIP_CAP / 2)}, got ${shown.length}`);
  assert.ok(shown.every((c) => targets.includes(`${c.kind}:${c.id}`)));
});

test("the synced spot_boost setting turns the lift off", () => {
  const db = fresh();
  const juice = S("juice");
  startSession(db, { name: "Drinks", targets: [`sense:${juice.id}`], minutes: 15 });
  setSetting(db, "spot_boost", 0);
  const { candidates } = stripScored(db, [S("want")], NOW, "en", TEST_MODEL);
  assert.ok(!candidates.some((c) => c.id === juice.id),
    "boost off: a zero-evidence target stays ineligible");
});

test("spotGate bounds target tiles inside a mixed offer", () => {
  // Rank order: three boosted targets, then plain candidates — the gate
  // keeps two target slots and fills the rest with prediction.
  const mk = (id, p, spot) => ({ kind: "sense", id, p, x: { spot } });
  const cands = [
    mk("s1", 0.9, 1), mk("s2", 0.8, 1), mk("s3", 0.7, 1),
    mk("n1", 0.6, 0), mk("n2", 0.5, 0), mk("n3", 0.4, 0),
  ];
  const shown = spotGate(cands, 0.1, { tile: 0, none: 0.7 }, STRIP_CAP);
  assert.deepEqual(shown.map((c) => c.id), ["s1", "s2", "n1", "n2"]);
  // No targets in the offer → identical to the plain show gate.
  const plain = spotGate(cands.slice(3), 0.1, { tile: 0, none: 0.7 }, STRIP_CAP);
  assert.deepEqual(plain.map((c) => c.id), ["n1", "n2", "n3"]);
  // pNone at τ_none suppresses everything, targets included.
  assert.deepEqual(spotGate(cands, 0.9, { tile: 0, none: 0.7 }), []);
});
