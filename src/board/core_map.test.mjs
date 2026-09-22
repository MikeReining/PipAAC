/**
 * Phase 002 slice 1 Works Test — the coordinate table.
 *
 * Proves: grid90 carries each of the 83 root-core senses exactly once;
 * grid60 carries the 60 senses the map doc lists and obeys the membership
 * rule (docs/product/Core_Grid_Membership.md §2 — UC36 + rule-0 gates);
 * sub-zone open and an empty suggestion do not move the table (deep
 * compare); the schema rejects what the bans forbid.
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
  "mine", "we", "they", "see", "have", "read", "feel", "tell", "think",
  "find", "work", "wait", "away", "under", "over", "same", "different",
  "but", "or", "because", "why", "how", "when",
];

/** Project Core Universal Core 36; `finished` is our `all done` cell. */
const UC36 = [
  "all", "can", "different", "do", "all done", "get", "go", "good", "he",
  "help", "here", "I", "in", "it", "like", "look", "make", "more", "not",
  "on", "open", "put", "same", "she", "some", "stop", "that", "turn", "up",
  "want", "what", "when", "where", "who", "why", "you",
];
/** Named rule-1 waivers — Core_Grid_Membership.md §6. */
const UC36_WAIVERS = ["same", "different", "when", "why"];
/** Rule 0: the board can report that something is wrong without navigating. */
const SELF_REPORT = ["hurt", "sad", "help", "stop", "no"];

/** grid60 vertical sectors: column index -> the word set it must hold. */
const SECTORS = {
  pronouns: {
    cols: [0, 1],
    words: ["I", "you", "me", "my", "he", "she", "this", "that", "it", "who", "what", "where"],
  },
  verbs: {
    cols: [2, 3, 4],
    words: ["want", "like", "go", "need", "look", "come", "get", "make", "do",
      "put", "take", "give", "open", "turn", "play", "eat", "drink", "can"],
  },
  spatial: {
    cols: [5, 6],
    words: ["in", "out", "on", "off", "up", "down", "here", "there", "to", "for", "with", "at"],
  },
  descriptors: {
    cols: [7, 8],
    words: ["more", "all done", "not", "and", "big", "little", "good", "bad",
      "happy", "sad", "all", "some"],
  },
  edge: {
    cols: [9],
    words: ["yes", "no", "stop", "help", "hurt", "please"],
  },
};

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("catalog generation: grid60 = 60 cells, grid90 = 83 cells + anchors", () => {
  const g60 = catalog.coreCells.filter((c) => c.layout === "grid60");
  const g90 = catalog.coreCells.filter((c) => c.layout === "grid90");
  assert.equal(g60.length, 60);
  assert.equal(g90.length, 83);
  assert.deepEqual(catalog.layouts.grid90.anchors, [
    { slot: 83, kind: "reserved" },
    { slot: 84, kind: "reserved" },
    { slot: 85, kind: "reserved" },
    { slot: 86, kind: "reserved" },
    { slot: 87, kind: "reserved" },
    { slot: 88, kind: "reserved" },
    { slot: 89, kind: "groups" },
  ]);
  // Every cell maps to a root-core sense; grid60 holds none of the 23 off-grid words.
  const senseById = new Map(catalog.senses.map((s) => [s.id, s]));
  const wordOf = (cell) =>
    catalog.labels.find((l) => l.sense_id === cell.sense_id && l.kind === "lemma").text;
  for (const c of [...g60, ...g90]) {
    assert.equal(senseById.get(c.sense_id).tier, "root_core");
  }
  const g60Words = new Set(g60.map(wordOf));
  for (const w of OFF_GRID60) assert.ok(!g60Words.has(w), `${w} must not be in grid60`);
  const g90Words = new Set(g90.map(wordOf));
  for (const w of OFF_GRID60) assert.ok(g90Words.has(w), `${w} must be in grid90`);
});

test("grid60 membership obeys the selection rule: UC36 and self-report gates", () => {
  const wordOf = (cell) =>
    catalog.labels.find((l) => l.sense_id === cell.sense_id && l.kind === "lemma").text;
  const g60Words = new Set(catalog.coreCells.filter((c) => c.layout === "grid60").map(wordOf));
  for (const w of UC36) {
    if (UC36_WAIVERS.includes(w)) {
      assert.ok(!g60Words.has(w), `${w} is waived — drop the waiver if it earns a cell`);
    } else {
      assert.ok(g60Words.has(w), `UC36 word ${w} needs a grid60 cell or a named waiver`);
    }
  }
  for (const w of SELF_REPORT) assert.ok(g60Words.has(w), `rule 0: ${w} must be a grid60 cell`);
});

test("imported coordinate table matches the generated rows exactly", () => {
  const db = openDb();
  const rows = snapshotCoreCells(db);
  const expected = [...catalog.coreCells].sort(
    (a, b) => a.layout.localeCompare(b.layout) || a.slot_index - a.slot_index,
  );
  assert.deepEqual(rows, expected);
  assert.equal(rows.filter((r) => r.layout === "grid90").length, 83);
  assert.equal(rows.filter((r) => r.layout === "grid60").length, 60);
  // each root-core sense appears exactly once in grid90
  const g90SenseIds = rows.filter((r) => r.layout === "grid90").map((r) => r.sense_id);
  assert.equal(new Set(g90SenseIds).size, 83);
  const rootCoreIds = catalog.senses.filter((s) => s.tier === "root_core").map((s) => s.id);
  assert.deepEqual(new Set(g90SenseIds), new Set(rootCoreIds));
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

test("grid60 lays out vertical syntactic sectors, left to right", () => {
  const db = openDb();
  const board = loadBoard(db, "grid60");
  for (const [name, s] of Object.entries(SECTORS)) {
    const cells = s.cols.flatMap((col) =>
      [0, 1, 2, 3, 4, 5].map((row) => board[row * 10 + col].label),
    );
    assert.deepEqual(
      [...cells].sort(),
      [...s.words].sort(),
      `${name} sector (cols ${s.cols.map((c) => c + 1).join("–")}) holds the wrong words`,
    );
  }
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

test("device import carries the full 677-sense lexicon (labels only — no art gate)", () => {
  const db = openDb();
  assert.equal(catalog.senses.length, 677);
  const onDevice = db.prepare("SELECT COUNT(*) AS n FROM sense").get().n;
  assert.equal(onDevice, 677);
});
