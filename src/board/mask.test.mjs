/**
 * 009 slice 9 Works Test — hide a word (Masking § 2, schema § 14.4).
 * The lie-prone layer is a renderer that consults the mask only at draw
 * time while the funnel still offers the word — so this measures the
 * surfaces themselves: the coordinate map (byte-identical), the strip
 * shortlist, and the keyboard continuations. `stop` covers the core-cell
 * leg; `juice` (primary_fringe) covers the funnel legs — core words are
 * never strip candidates regardless. "No speech on tap" is the browser
 * leg (`scripts/probes/mask_probe.mjs`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { maskedSenseIds, setMask } from "../../public/shared/groups.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import {
  keyboardContinuations, logSelection, stripScored,
} from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const MODEL = { weights: catalog.prediction.weights.local_only, tau: catalog.prediction.tau };

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;
const coreMap = (db) =>
  JSON.stringify(db.prepare(
    "SELECT layout, slot_index, sense_id FROM core_cell ORDER BY layout, slot_index").all());
const groupMap = (db) =>
  JSON.stringify(db.prepare(
    "SELECT group_id, page, slot_index, item_kind, item_id FROM group_cell ORDER BY group_id, page, slot_index").all());

test("hide stop (core): maps byte-identical; hide juice (fringe): out of strip + continuations", () => {
  const db = openDb();
  const stop = senseOf(db, "stop");
  const want = senseOf(db, "want");
  const juice = senseOf(db, "juice");
  const coreBefore = coreMap(db);
  const groupsBefore = groupMap(db);

  // Real evidence so `juice` would surface after "want" (verb tail
  // invites nouns): want, juice picked before — freq + recency.
  for (const [i, id] of [want, juice].entries()) {
    logSelection(db, "sense", id, Date.now() + i * 1500, { position: i });
  }
  const before = stripScored(db, [{ kind: "sense", id: want }], Date.now(), "en", MODEL);
  assert.ok(before.candidates.some((c) => c.id === juice), "juice is eligible unmasked");
  const kbBefore = keyboardContinuations(db, [{ kind: "sense", id: want }], "en", Date.now(), MODEL);
  assert.ok(kbBefore.some((c) => c.id === juice), "juice continues 'want' unmasked");

  setMask(db, stop, true);
  setMask(db, juice, true);
  assert.deepEqual([...maskedSenseIds(db)].sort(), [juice, stop].sort());
  assert.equal(coreMap(db), coreBefore, "core map byte-identical while hidden");
  assert.equal(groupMap(db), groupsBefore, "group placements untouched");

  const after = stripScored(db, [{ kind: "sense", id: want }], Date.now(), "en", MODEL);
  assert.ok(!after.candidates.some((c) => c.id === juice), "hidden: out of the strip shortlist");
  const kbAfter = keyboardContinuations(db, [{ kind: "sense", id: want }], "en", Date.now(), MODEL);
  assert.ok(!kbAfter.some((c) => c.id === juice), "hidden: out of continuations");

  setMask(db, stop, false);
  setMask(db, juice, false);
  assert.equal(maskedSenseIds(db).size, 0);
  const restored = stripScored(db, [{ kind: "sense", id: want }], Date.now(), "en", MODEL);
  assert.ok(restored.candidates.some((c) => c.id === juice), "show restores the shortlist");
  const kbRestored = keyboardContinuations(db, [{ kind: "sense", id: want }], "en", Date.now(), MODEL);
  assert.ok(kbRestored.some((c) => c.id === juice), "show restores continuations");
});

test("the set_mask op replays — a hidden word stays hidden after sync", () => {
  const db = openDb();
  const stop = senseOf(db, "stop");
  setMask(db, stop, true);
  const ops = listOps(db).filter((o) => o.kind === "set_mask");
  assert.equal(ops.length, 1);

  const db2 = openDb();
  replayOps(db2, ops.map((o) => ({ ...o, args: JSON.parse(o.args) })));
  assert.ok(maskedSenseIds(db2).has(stop), "the mask survives the op log");
});
