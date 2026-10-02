/**
 * 011 slice 7 Works Test (automated half) — the web editor's write side.
 *
 * Bulk paste (Word_Library § 5.4) and photo-drop drafts (Sync § 7) write
 * through the same owners as a single add, so a pasted board syncs like
 * any other edit. The test proves: exact-only resolution (a fuzzy
 * near-miss is a new word, never a misplaced one), duplicate collapse,
 * already-placed rows skip, and — the spec's automated half — the same
 * paste replayed through the op log on a second replica yields
 * byte-identical group_cell rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import {
  applyPasteRows,
  nameFromFile,
  resolvePasteRows,
} from "../../public/shared/bulk.mjs";
import { createEntity, groupPage, placeItem } from "../../public/shared/groups.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(
  lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const FOOD = "grp_fruit"; // a seeded built-in group without juice or milk

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const cells = (db) =>
  db.prepare(
    "SELECT group_id, page, slot_index, item_kind, item_id FROM group_cell ORDER BY group_id, page, slot_index",
  ).all();

test("nameFromFile turns a photo file name into a draft name", () => {
  assert.equal(nameFromFile("mom at the beach.JPEG"), "mom at the beach");
  assert.equal(nameFromFile("grandma_ruth.png"), "grandma ruth");
  assert.equal(nameFromFile("our-dog 2.heic"), "our dog 2");
  assert.equal(nameFromFile("noext"), "noext");
});

test("paste resolves own words, catalog words, and new — exact only", () => {
  const db = openDb();
  addPersonalEntity(db, { spokenName: "Cooper", category: "Animals & Nature" });
  const rows = resolvePasteRows(
    db,
    "Cooper\njuice\nCooper\n\ncold juice\nAunt Deb",
    { groupId: FOOD, locale: "en" },
  );
  assert.deepEqual(
    rows.map((r) => [r.label, r.kind, r.already, r.needsPicture]),
    [
      ["Cooper", "entity", false, false],
      ["juice", "sense", false, false],
      ["cold juice", "new", false, true], // catalog has 'juice' — a fuzzy miss must not place it
      ["Aunt Deb", "new", false, true],
    ],
  );
});

test("a row already in the group resolves 'already' and skips on apply", () => {
  const db = openDb();
  const juice = catalog.labels.find((l) => l.text === "juice" && l.locale === "en");
  const before = resolvePasteRows(db, "juice", { groupId: FOOD, locale: "en" });
  const first = applyPasteRows(db, before, { groupId: FOOD });
  assert.ok(first.placed + first.skipped === 1);
  const again = resolvePasteRows(db, "juice\nmilk", { groupId: FOOD, locale: "en" });
  assert.equal(again.find((r) => r.label === "juice").already, true);
  const res = applyPasteRows(db, again, { groupId: FOOD });
  const { newIds, ...counts } = res;
  assert.deepEqual(counts, { placed: 1, created: 0, skipped: 1 });
  assert.deepEqual(newIds, []);
  // juice still occupies exactly one cell in that group
  const placed = cells(db).filter(
    (c) => c.group_id === FOOD && c.item_id === juice.sense_id);
  assert.equal(placed.length, 1);
});

test("applyPasteRows writes through the real owners — ops, slots, My Words category", () => {
  const db = openDb();
  const rows = resolvePasteRows(db, "juice\nmilk\nGrandma Ruth\njuice", {
    groupId: FOOD, locale: "en",
  });
  const res = applyPasteRows(db, rows, {
    groupId: FOOD,
    category: catalog.groups.find((g) => g.id === FOOD)?.category ?? null,
  });
  const { newIds, ...counts } = res;
  assert.deepEqual(counts, { placed: 3, created: 1, skipped: 0 });
  assert.equal(newIds.length, 1, "the new word's id comes back for its picture (029 § 5)");
  const page = groupPage(db, FOOD, 0, "en");
  const labels = page.map((r) => r.label);
  for (const w of ["juice", "milk", "Grandma Ruth"]) {
    assert.ok(labels.includes(w), `${w} not placed on ${FOOD}`);
  }
  // every write is an op — create_entity + place_item for the new word,
  // place_item for each catalog word
  const kinds = listOps(db).map((o) => o.kind);
  assert.equal(kinds.filter((k) => k === "place_item").length, 3);
  assert.equal(kinds.filter((k) => k === "create_entity").length, 1);
  const ent = db.prepare("SELECT category FROM personal_entity WHERE spoken_name = 'Grandma Ruth'").all()[0];
  assert.equal(ent.category, catalog.groups.find((g) => g.id === FOOD).category);
});

test("the same paste arrives byte-identical through the op log", () => {
  // The works-test claim: one paste on the laptop lands on the iPad as
  // the same rows. (Two devices pasting independently legitimately
  // mint different entity ids — identity travels through the log.)
  const a = openDb();
  const paste = "juice\nmilk\nGrandma Ruth";
  const seed = { groupId: FOOD, locale: "en", category: catalog.groups.find((g) => g.id === FOOD)?.category ?? null };
  applyPasteRows(a, resolvePasteRows(a, paste, seed), seed);
  const c = openDb();
  replayOps(c, listOps(a));
  assert.deepEqual(cells(a), cells(c));
});

test("photo-drop drafts: three files become three named entities in the group", () => {
  const db = openDb();
  // What the drop handler does per image file (savePhoto is the only
  // browser-side piece; the draft is nameFromFile + the real owners).
  for (const f of ["mom.png", "dad at work.jpg", "grandma_ruth.webp"]) {
    const { id } = createEntity(db, {
      name: nameFromFile(f),
      photoKey: `blob:fakehash_${f}`,
      category: catalog.groups.find((g) => g.id === FOOD)?.category ?? null,
    });
    placeItem(db, FOOD, "entity", id);
  }
  const labels = groupPage(db, FOOD, 0, "en").map((r) => r.label);
  for (const w of ["mom", "dad at work", "grandma ruth"]) {
    assert.ok(labels.includes(w), `${w} missing from ${FOOD}`);
  }
});
