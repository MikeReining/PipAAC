/**
 * 018 slice 6 (D10) Works Test — the placement sheet's list and the 📊
 * counts read the same instrument: the child's own taps in the last 30
 * days (learner_event_log). The lie-prone layer is a badge or sort
 * reporting numbers the pick history doesn't hold.
 *
 * Proves: counts group the child's events per word (all logged rows
 * are the child's — modeling taps write no event); the off-board list
 * drops every word with a home cell and orders most-tapped first,
 * falling back to the children table's unigram on day one; a tap places
 * the pick and the old word keeps a cell or its group; Undo restores.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { useCounts, offBoardItems } from "../../public/shared/usecounts.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { coreCells, placeOnBoard } from "../../public/shared/coremove.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const phrases = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/phrase_table.en.json"), "utf8"),
);
// The children table's unigram: total next-item counts across contexts —
// the same day-one order the board's getUni derives.
const uni = {};
for (const row of Object.values(phrases.contexts)) {
  for (const [id, n] of Object.entries(row)) uni[id] = (uni[id] ?? 0) + n;
}

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

const NOW = Date.parse("2026-09-24T12:00:00Z");
function logPicks(db, kind, id, n, at = NOW - 86400000) {
  for (let i = 0; i < n; i++) {
    db.prepare(
      `INSERT INTO learner_event_log (item_kind, item_id, selected_at, source, tz_offset_min)
       VALUES (?, ?, ?, 'grid', 0)`,
    ).run(kind, id, at + i);
  }
}

function senseOf(db, label) {
  return db.prepare(
    `SELECT sense_id FROM label WHERE text = ? AND kind = 'lemma'
       AND status = 'approved' AND locale = 'en'`,
  ).get(label).sense_id;
}

test("the placement list ranks by the child's taps, then the book — never an on-board word", () => {
  const db = openDb();
  const cookie = senseOf(db, "cookie");
  const juice = senseOf(db, "juice");
  const this_ = senseOf(db, "this");
  logPicks(db, "sense", cookie, 14);
  logPicks(db, "sense", juice, 9);
  logPicks(db, "sense", this_, 33); // on-board — its count never lists it
  createEntity(db, { id: "ent_baba", name: "Baba" });
  logPicks(db, "entity", "ent_baba", 5);

  const counts = useCounts(db, { now: NOW });
  assert.equal(counts.get(`sense:${cookie}`), 14);
  assert.equal(counts.get(`entity:ent_baba`), 5);

  const list = offBoardItems(db, "grid60", "en", { counts, uni });
  // cookie and juice lead — the child's taps outrank the book order.
  assert.deepEqual(list.slice(0, 2).map((r) => r.label), ["cookie", "juice"]);
  // this is tapped more than anything but sits on the board — absent.
  assert.ok(!list.some((r) => r.id === this_));
  // The family's person lists with the words, her count beside her.
  const baba = list.find((r) => r.id === "ent_baba");
  assert.equal(baba.count, 5);
  assert.equal(baba.role, "Yellow");
  // 🔍 filters the same list — a typed prefix narrows, never adds.
  const hits = offBoardItems(db, "grid60", "en", { counts, uni, q: "cooki" });
  assert.deepEqual(hits.map((r) => r.label), ["cookie"]);
});

test("day one: with no taps the children table's unigram orders the list", () => {
  const db = openDb();
  const list = offBoardItems(db, "grid60", "en", { counts: new Map(), uni });
  // The most-said off-board word tops the empty list.
  const topUniId = Object.entries(uni)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .find((id) => list.some((r) => r.id === id));
  assert.equal(list[0].id, topUniId);
});

test("a row tap places the pick; Undo puts the board back", () => {
  const db = openDb();
  const cookie = senseOf(db, "cookie");
  const before = coreCells(db, "grid60", "en").find((c) => c.slot_index === 0);

  const mv = placeOnBoard(db, "grid60", "sense", cookie, 0);
  assert.equal(mv.from, null); // cookie had no home cell
  const cell = coreCells(db, "grid60", "en").find((c) => c.slot_index === 0);
  assert.equal(cell.sense_id, cookie);
  // The old word still resolves — a vacated cell or its group.
  const boardIds = new Set(coreCells(db, "grid60", "en").map((c) => c.sense_id));
  if (!boardIds.has(before.sense_id)) {
    const inGroup = db.prepare(
      "SELECT 1 FROM group_cell WHERE item_kind = 'sense' AND item_id = ?",
    ).get(before.sense_id);
    assert.ok(inGroup, `${before.label} left the board and has no group`);
  }

  // Undo: the pick leaves, the catalog word returns.
  placeOnBoard(db, "grid60", "sense", cookie, null);
  const restored = coreCells(db, "grid60", "en").find((c) => c.slot_index === 0);
  assert.equal(restored.sense_id, before.sense_id);
});
