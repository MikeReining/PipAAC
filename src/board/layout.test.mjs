/**
 * 014 slice 1 / 027 § 3.3 Works Test — any grid shape. Groups store a
 * position per board size: this measures the reserved-cell geometry each
 * size leaves for content, and a Cells change writing the new size's
 * missing positions in one op — switching back exact, replay identical.
 * The browser leg (scripts/probes/layout_probe.mjs) measures pixels.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  createEntity, geometryOf, groupPage, indexSlotAt, indexVisual, placeItem,
} from "../../public/shared/groups.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import { setBoardLayout } from "../../public/shared/movecost.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

test("027 § 3.2: reserved cells per size — top row, frame, Next — leave 46 / 76 / 7 content cells", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const counts = Object.fromEntries(["grid60", "grid90", "grid15"].map((l) => [l, geometryOf(db, l).content.length]));
  assert.deepEqual(counts, { grid60: 46, grid90: 76, grid15: 7 });
  const g15 = geometryOf(db, "grid15");
  assert.deepEqual([...g15.reserved].sort((x, y) => x - y), [0, 1, 2, 3, 4, 8, 9, 14]);
  // the index keeps its canonical mapping
  assert.deepEqual(indexVisual(10, 60), { page: 0, slot: 10 });
  assert.deepEqual(indexVisual(14, 15), { page: 1, slot: 2 });
  assert.equal(indexSlotAt(1, 2, 15), 14);
});

test("027 § 3.3: a Cells change writes the new size's missing positions in one op; switching back is exact", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const { id } = createEntity(db, { name: "Oat milk" });
  const at60 = placeItem(db, "grp_breakfast", "entity", id); // written at grid60 only
  const positions = () => db.prepare("SELECT * FROM group_cell ORDER BY group_id, layout, item_kind, item_id").all()
    .map((r) => JSON.stringify(r));
  const where = (layout) => db.prepare(
    "SELECT page, slot_index FROM group_cell WHERE item_id = ? AND layout = ?").all(id, layout)[0];
  assert.equal(where("grid15"), undefined);
  const seeded60 = positions().filter((r) => r.includes('"grid60"'));

  const opsBefore = listOps(db).length;
  const r = setBoardLayout(db, "grid15");
  assert.equal(r.groupCells, 1, "only the family's word lacked a grid15 position — the seed ships all sizes");
  assert.equal(listOps(db).length, opsBefore + 1);
  const op = listOps(db).at(-1);
  assert.equal(op.kind, "set_layout");
  assert.equal(JSON.parse(op.args).groupCells.length, 1);
  const g15 = where("grid15");
  assert.ok(geometryOf(db, "grid15").content.includes(g15.slot_index));
  assert.equal(groupPage(db, "grp_breakfast", g15.page, "en").some((x) => x.item_id === id), true);

  setBoardLayout(db, "grid60");
  assert.deepEqual({ ...where("grid60") }, at60, "switching back is exact");
  assert.deepEqual(positions().filter((x) => x.includes('"grid60"')), seeded60);

  // A replica replays the carried positions — never recomputes them.
  const replica = createDatabase(":memory:");
  importCatalog(replica, catalog);
  replayOps(replica, listOps(db));
  const replicaPositions = replica.prepare("SELECT * FROM group_cell ORDER BY group_id, layout, item_kind, item_id").all()
    .map((x) => JSON.stringify(x));
  assert.deepEqual(replicaPositions, positions());
});

test("grid90 renders its anchors — Groups cell + eleven reserved", () => {
  const layout = catalog.layouts.grid90;
  assert.equal(layout.cols * layout.rows, 90);
  const anchors = new Map(layout.anchors.map((a) => [a.slot, a.kind]));
  assert.equal(anchors.get(89), "groups");
  assert.equal([...anchors.values()].filter((k) => k === "reserved").length, 11);
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cells = db.prepare("SELECT COUNT(*) AS n FROM core_cell WHERE layout = 'grid90'").all()[0].n;
  assert.equal(cells, 78); // 78 words + 12 anchors = all 90 slots
});

/**
 * 014 slice 2 Works Test — the Core 15 starter. The spec's own test:
 * "each starter renders on a fresh profile with § 5's words in § 5's
 * cells." Measured against the generated `core_cell` rows joined back
 * to their labels — the same rows the renderer draws.
 */
test("grid15 is § 5.1's board: 14 words + the ? family slot, in place", () => {
  const layout = catalog.layouts.grid15;
  assert.deepEqual({ cols: layout.cols, rows: layout.rows }, { cols: 5, rows: 3 });
  const anchors = new Map(layout.anchors.map((a) => [a.slot, a]));
  assert.deepEqual(anchors.get(12),
    { slot: 12, kind: "family", family: "bf_q" },
    "slot 12 (row 3 col 3) is the ? family tile (014 slice 7)");

  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cells = db.prepare(
    `SELECT cc.slot_index, l.text FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE cc.layout = 'grid15' ORDER BY cc.slot_index`,
  ).all();
  // § 5.1 as amended 2026-09-24 (018 slice 2, v2 bands), row by row —
  // slot 13 skipped (reserved).
  const spec = [
    ["I", "want", "more", "yes", "stop"],
    ["you", "like", "all done", "no", "help"],
    ["what", "go", null, "not", "hurt"],
  ].flat();
  for (const [i, word] of spec.entries()) {
    if (word === null) continue;
    assert.equal(cells.find((c) => c.slot_index === i)?.text, word,
      `grid15 slot ${i} should be "${word}"`);
  }
  assert.equal(cells.length, 14);
  // Every word is the same sense the word has on grid60 — a starter
  // changes the map, never the vocabulary.
  for (const c of cells) {
    const s60 = db.prepare(
      `SELECT l.text FROM core_cell cc
       JOIN label l ON l.sense_id = cc.sense_id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       WHERE cc.layout = 'grid60' AND cc.sense_id =
         (SELECT sense_id FROM core_cell WHERE layout='grid15' AND slot_index=?)`,
    ).all(c.slot_index)[0];
    assert.equal(s60?.text, c.text);
  }
});
