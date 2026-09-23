/**
 * 014 slice 1 Works Test — a renderer that draws any grid shape. The
 * lie-prone layer is a render that quietly assumes 60 cells: this
 * measures the stored→visual map itself — identity at 60, re-wrap at
 * 15 (12 items per page, Next on the last slot) — then walks a real
 * group's cells through groupPage at both sizes. The browser leg
 * (scripts/probes/layout_probe.mjs) measures rendered pixels.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  canonCell, canonPos, groupPage, indexSlotAt, indexVisual,
  pageCount, pageGeom, placeItem, posAtVisual, visualCell,
} from "../../public/shared/groups.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

test("geometry: 60 is the identity, 15 re-wraps into pages of 12", () => {
  // Every canonical item slot round-trips through the map at 60 cells.
  for (let pos = 0; pos < 57 * 3; pos++) {
    const v = visualCell(pos, 60);
    assert.equal(posAtVisual(v.page, v.slot, 60), pos);
    assert.equal(v.page, Math.floor(pos / 57));
    assert.equal(v.slot, 2 + (pos % 57));
  }
  // At 15 cells a page is back + edit + 12 items + Next (§3).
  const g = pageGeom(15);
  assert.deepEqual(g, { first: 2, last: 13, next: 14, per: 12 });
  assert.deepEqual(visualCell(0, 15), { page: 0, slot: 2 });
  assert.deepEqual(visualCell(11, 15), { page: 0, slot: 13 });
  assert.deepEqual(visualCell(12, 15), { page: 1, slot: 2 }); // 13th item pages
  // Round-trip through the write path: drop at visual → canonical cell.
  assert.deepEqual(canonCell(posAtVisual(1, 5, 15)), canonCell(15));
  // Index: slot 10 lands where it always did at 60; at 15 the index pages.
  assert.deepEqual(indexVisual(10, 60), { page: 0, slot: 10 });
  assert.deepEqual(indexVisual(10, 15), { page: 0, slot: 10 });
  assert.deepEqual(indexVisual(14, 15), { page: 1, slot: 2 });
  assert.equal(indexSlotAt(0, 10, 15), 10);
  assert.equal(indexSlotAt(1, 2, 15), 14);
});

test("a group re-wraps without a single row moving", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  // 15 items in My Words → canonical page 0 holds them all (slots 2–16).
  for (let i = 0; i < 15; i++) {
    db.prepare(
      "INSERT INTO personal_entity (id, spoken_name) VALUES (?, ?)",
    ).run(`ent_t${i}`, `thing ${i}`);
    placeItem(db, "grp_my_words", "entity", `ent_t${i}`);
  }
  const stored = db.prepare(
    "SELECT item_id, page, slot_index FROM group_cell WHERE group_id = 'grp_my_words' ORDER BY page, slot_index",
  ).all();
  assert.equal(stored.length, 15);
  assert.ok(stored.every((r) => r.page === 0), "canonical storage: one page of 57");

  // At 60 cells one page, items at slots 2–16.
  const p60 = groupPage(db, "grp_my_words", 0, "en", 60);
  assert.equal(p60.length, 15);
  assert.equal(p60[0].vslot, 2);
  assert.equal(p60[14].vslot, 16);
  assert.equal(pageCount(db, "grp_my_words", 60), 1);

  // At 15 cells the same rows render as 12 + 3 across two pages —
  // nothing in group_cell changed.
  const p15a = groupPage(db, "grp_my_words", 0, "en", 15);
  const p15b = groupPage(db, "grp_my_words", 1, "en", 15);
  assert.equal(p15a.length, 12);
  assert.equal(p15b.length, 3);
  assert.equal(p15a[0].item_id, "ent_t0");
  assert.equal(p15b[0].item_id, "ent_t12"); // order preserved across the wrap
  assert.equal(pageCount(db, "grp_my_words", 15), 2);

  // And a visual drop at 15 cells writes the canonical cell: page 1,
  // slot 5 = linear position 15 → stored page 0, slot 17.
  db.prepare("INSERT INTO personal_entity (id, spoken_name) VALUES ('ent_new', 'new thing')").run();
  const c = canonCell(posAtVisual(1, 5, 15));
  assert.deepEqual(c, { page: 0, slot_index: 17 });
  placeItem(db, "grp_my_words", "entity", "ent_new", c);
  const back = groupPage(db, "grp_my_words", 1, "en", 15).find((r) => r.item_id === "ent_new");
  assert.equal(back.vslot, 5, "the item lands exactly where the adult dropped it");
});

test("grid90 renders its anchors — Groups cell + six reserved", () => {
  const layout = catalog.layouts.grid90;
  assert.equal(layout.cols * layout.rows, 90);
  const anchors = new Map(layout.anchors.map((a) => [a.slot, a.kind]));
  assert.equal(anchors.get(89), "groups");
  assert.equal([...anchors.values()].filter((k) => k === "reserved").length, 6);
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cells = db.prepare("SELECT COUNT(*) AS n FROM core_cell WHERE layout = 'grid90'").all()[0].n;
  assert.equal(cells, 83); // 83 words + 7 anchors = all 90 slots
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
  assert.deepEqual(anchors.get(13),
    { slot: 13, kind: "family", family: "bf_q" },
    "slot 13 is the ? family tile (014 slice 7)");

  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cells = db.prepare(
    `SELECT cc.slot_index, l.text FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE cc.layout = 'grid15' ORDER BY cc.slot_index`,
  ).all();
  // § 5.1, row by row — slot 13 skipped (reserved).
  const spec = [
    ["I", "want", "more", "yes", "stop"],
    ["you", "like", "not", "no", "help"],
    ["what", "go", "all done", null, "hurt"],
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
