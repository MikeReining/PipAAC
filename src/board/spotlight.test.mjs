/**
 * 013 slice 1 Works Test — the attention layer. The lie-prone layer is
 *  a spotlight that claims to honor the § 2.1 laws while mutating state:
 *  this measures that startSpotlight skips masked words (never unmask),
 *  that the route walk finds the containing groups, and that nothing
 *  touches the coordinate tables. The DOM leg (tap-through, chip, walk)
 *  is `scripts/probes/spotlight_probe.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { setMask } from "../../public/shared/groups.mjs";
import {
  endSpotlight, needsRouteWalk, spotlight, spotlightGroups, startSpotlight,
} from "../../public/shared/spotlight.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;
const mapDump = (db) => JSON.stringify({
  core: db.prepare("SELECT * FROM core_cell ORDER BY layout, slot_index").all(),
  groups: db.prepare("SELECT * FROM group_cell ORDER BY group_id, page, slot_index").all(),
  index: db.prepare("SELECT id, index_slot FROM board_group ORDER BY index_slot").all(),
});

test("the layer: targets set, masked skipped, map untouched", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const stop = senseOf(db, "stop");
  const juice = senseOf(db, "juice"); // fringe — lives in a group, not on grid60
  const want = senseOf(db, "want");

  const before = mapDump(db);
  setMask(db, want, true);

  const { skipped } = startSpotlight(db,
    [`sense:${stop}`, `sense:${juice}`, `sense:${want}`], "test");
  assert.deepEqual(skipped, [`sense:${want}`], "never unmask — the masked word is reported skipped");
  assert.deepEqual([...spotlight().targets].sort(), [`sense:${juice}`, `sense:${stop}`].sort());
  assert.equal(spotlight().name, "test");
  assert.equal(mapDump(db), before, "coordinate maps byte-identical");

  // Route walk: juice is in a group but not on the board → anchor glows.
  const groups = spotlightGroups(db, spotlight().targets);
  assert.ok(groups.size >= 1, "the containing group is found");
  const onBoard = new Set(
    db.prepare("SELECT sense_id FROM core_cell WHERE layout = 'grid60'").all().map((r) => r.sense_id),
  );
  assert.ok(onBoard.has(stop));
  assert.ok(needsRouteWalk(spotlight().targets, onBoard), "juice needs the walk");

  endSpotlight();
  assert.equal(spotlight(), null);

  // An all-masked spotlight never turns on.
  startSpotlight(db, [`sense:${want}`]);
  assert.equal(spotlight(), null);
});
