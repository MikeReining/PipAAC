/**
 * Phase 002 slice 1 Works Test — the coordinate table.
 *
 * Proves: grid80 carries each of the 75 root-core senses exactly once;
 * grid60 carries the 60 senses the map doc lists; sub-zone open and an
 * empty suggestion do not move the table (deep compare); the schema
 * rejects what the bans forbid.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applySuggestion,
  createDatabase,
  importCatalog,
  loadBoard,
  openSubZone,
  snapshotCoreCells,
} from "./catalog.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const OFF_GRID60 = [
  "under", "over", "away", "with", "same", "different", "some", "all",
  "why", "how", "when", "work", "turn", "tell", "think",
];

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("catalog generation: grid60 = 60 cells, grid80 = 75 cells + anchors", () => {
  const g60 = catalog.coreCells.filter((c) => c.layout === "grid60");
  const g80 = catalog.coreCells.filter((c) => c.layout === "grid80");
  assert.equal(g60.length, 60);
  assert.equal(g80.length, 75);
  assert.deepEqual(catalog.layouts.grid80.anchors, [
    { slot: 75, kind: "reserved" },
    { slot: 76, kind: "reserved" },
    { slot: 77, kind: "reserved" },
    { slot: 78, kind: "reserved" },
    { slot: 79, kind: "groups" },
  ]);
  // Every cell maps to a root-core sense; grid60 holds none of the 15 off-grid words.
  const senseById = new Map(catalog.senses.map((s) => [s.id, s]));
  const wordOf = (cell) =>
    catalog.labels.find((l) => l.sense_id === cell.sense_id && l.kind === "lemma").text;
  for (const c of [...g60, ...g80]) {
    assert.equal(senseById.get(c.sense_id).tier, "root_core");
  }
  const g60Words = new Set(g60.map(wordOf));
  for (const w of OFF_GRID60) assert.ok(!g60Words.has(w), `${w} must not be in grid60`);
  const g80Words = new Set(g80.map(wordOf));
  for (const w of OFF_GRID60) assert.ok(g80Words.has(w), `${w} must be in grid80`);
});

test("imported coordinate table matches the generated rows exactly", () => {
  const db = openDb();
  const rows = snapshotCoreCells(db);
  const expected = [...catalog.coreCells].sort(
    (a, b) => a.layout.localeCompare(b.layout) || a.slot_index - b.slot_index,
  );
  assert.deepEqual(rows, expected);
  assert.equal(rows.filter((r) => r.layout === "grid80").length, 75);
  assert.equal(rows.filter((r) => r.layout === "grid60").length, 60);
  // each root-core sense appears exactly once in grid80
  const g80SenseIds = rows.filter((r) => r.layout === "grid80").map((r) => r.sense_id);
  assert.equal(new Set(g80SenseIds).size, 75);
  const rootCoreIds = catalog.senses.filter((s) => s.tier === "root_core").map((s) => s.id);
  assert.deepEqual(new Set(g80SenseIds), new Set(rootCoreIds));
});

test("sub-zone open and empty suggestion leave the coordinate table untouched", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);

  openSubZone(db, "Animals & Nature"); // placeholder op — returns rows, writes nothing
  applySuggestion(db); // placeholder op — returns [], writes nothing
  loadBoard(db, "grid60"); // the render path itself is read-only

  assert.deepEqual(snapshotCoreCells(db), before);
});

test("board read returns all 60 grid60 cells with label and color", () => {
  const db = openDb();
  const board = loadBoard(db, "grid60");
  assert.equal(board.length, 60);
  for (const cell of board) {
    assert.ok(cell.label.length > 0);
    assert.ok(["Yellow", "Green", "Blue", "Pink", "Red"].includes(cell.fitzgerald_role));
    assert.ok(cell.slot_index >= 0 && cell.slot_index < 60);
  }
  assert.equal(board[0].label, "I");
  assert.equal(board[59].label, "please");
});

test("bans: fringe sense and duplicate slot cannot enter core_cell", () => {
  const db = openDb();
  const fringe = catalog.senses.find((s) => s.tier === "primary_fringe");
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)")
        .run("cel_bad_fringe", "grid60", fringe.id, 200),
    /core cell requires a root_core sense/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)")
        .run("cel_bad_slot", "grid60", "sns_0001", 0),
  );
});

test("device import carries the full 599-sense lexicon (labels only — no art gate)", () => {
  const db = openDb();
  assert.equal(catalog.senses.length, 599);
  const onDevice = db.prepare("SELECT COUNT(*) AS n FROM sense").get().n;
  assert.equal(onDevice, 599);
});
