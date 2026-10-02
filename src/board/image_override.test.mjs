/**
 * 009 slice 6 Works Test — use my own picture (Language_And_Voice_Schema
 * § 14.1). What each surface's query resolves is measured — the group
 * page row, the add-flow match, the library row, and the shared art
 * expression the board cell, strip tile, and word card all embed — not
 * what the write owner claims it stored.
 *
 * Set an override for cup → every surface resolves its key. A library
 * picture override resolves that image's key. "Use our picture" → the
 * default image again. The core map is byte-identical throughout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import { groupPage, catalogMatches } from "../../public/shared/groups.mjs";
import { libraryAll } from "../../public/shared/library.mjs";
import {
  SENSE_ART_SQL, clearImageOverride, imageOverrideFor,
  libraryImagesFor, setImageOverride,
} from "../../public/shared/images.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const one = (db, sql, p = []) => db.prepare(sql).all(...p)[0];
const senseOf = (db, text) =>
  one(db, "SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'",
    [text])?.sense_id;
/** What the board cell, strip tile, and card picture resolve — the exact
 *  expression metaFor embeds. */
const artFor = (db, senseId) =>
  one(db, `SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`, [senseId])?.art;

const addImage = (db, id, senseId, key) =>
  db.prepare("INSERT INTO image (id, sense_id, key, status, sha256) VALUES (?, ?, ?, 'approved', '00')")
    .run(id, senseId, key);
const coreMap = (db) =>
  db.prepare("SELECT * FROM core_cell ORDER BY layout, slot_index").all();

test("a photo override wins on every surface; revert restores the art", () => {
  const db = openDb();
  const cup = senseOf(db, "cup");
  assert.ok(cup, "lexicon has cup");
  const before = coreMap(db);

  // Ship two approved pictures for cup; the first is the default.
  addImage(db, "img_cup_a", cup, "art/cup_a.png");
  addImage(db, "img_cup_b", cup, "art/cup_b.png");
  db.prepare("UPDATE sense SET default_image_id = 'img_cup_a' WHERE id = ?").run(cup);

  // Every surface resolves the default picture.
  assert.equal(artFor(db, cup), "art/cup_a.png");
  const homeRow = () =>
    groupPage(db, "grp_drinks", 0, "en").find((r) => r.item_id === cup);
  assert.equal(homeRow()?.art, "art/cup_a.png");
  assert.equal(
    libraryAll(db, "en").find((r) => r.kind === "sense" && r.id === cup)?.art,
    "art/cup_a.png");

  // The family's own cup → a blob: key everywhere.
  setImageOverride(db, { senseId: cup, photoKey: "blob:" + "a".repeat(64) });
  const k = "blob:" + "a".repeat(64);
  assert.equal(artFor(db, cup), k);
  assert.equal(homeRow()?.art, k);
  assert.equal(
    libraryAll(db, "en").find((r) => r.kind === "sense" && r.id === cup)?.art, k);
  // The group's add-flow row resolves it too (the word is already placed,
  // so check through a custom group query — same expression either way).
  assert.equal(catalogMatches(db, "cu", "grp_fruit", "en").find((m) => m.id === cup)?.art, k);

  // The other library picture → its key everywhere.
  setImageOverride(db, { senseId: cup, imageId: "img_cup_b" });
  assert.equal(artFor(db, cup), "art/cup_b.png");
  assert.equal(homeRow()?.art, "art/cup_b.png");
  assert.equal(imageOverrideFor(db, cup).image_id, "img_cup_b");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM image_override WHERE sense_id = ? AND status = 'ready'")
      .all(cup)[0].n, 1);

  // Use our picture → the default image is back; the rows stay superseded.
  clearImageOverride(db, cup);
  assert.equal(artFor(db, cup), "art/cup_a.png");
  assert.equal(homeRow()?.art, "art/cup_a.png");
  assert.equal(imageOverrideFor(db, cup), null);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM image_override WHERE sense_id = ?").all(cup)[0].n, 2);

  // The coordinate map never moved.
  assert.deepEqual(coreMap(db), before);
});

test("an override image must belong to the sense; ops replay byte-identical", () => {
  const db = openDb();
  const cup = senseOf(db, "cup");
  const apple = senseOf(db, "apple");
  addImage(db, "img_apple", apple, "art/apple.png");

  // Another sense's picture cannot be filed under cup — the trigger
  // enforces § 14.1's same-sense rule.
  assert.throws(
    () => setImageOverride(db, { senseId: cup, imageId: "img_apple" }),
    /another sense/);
  assert.equal(imageOverrideFor(db, cup), null);
  // And neither column may be absent or both present.
  assert.throws(() => setImageOverride(db, { senseId: cup }), /exactly one/);

  // A mixed history replays into a replica byte-identically.
  setImageOverride(db, { id: "imo_1", senseId: cup, photoKey: "blob:" + "c".repeat(64) });
  clearImageOverride(db, cup);
  setImageOverride(db, { id: "imo_2", senseId: cup, photoKey: "blob:" + "d".repeat(64) });
  const rows = db.prepare("SELECT * FROM image_override ORDER BY rowid").all();

  const db2 = openDb();
  replayOps(db2, listOps(db));
  assert.deepEqual(
    db2.prepare("SELECT * FROM image_override ORDER BY rowid").all(), rows);

  // A library-image override referencing an image the replica does not
  // carry degrades to nothing instead of writing a broken row.
  const db3 = openDb();
  replayOps(db3, [{
    kind: "set_image_override",
    args: { id: "imo_9", senseId: cup, photoKey: null, imageId: "img_absent" },
  }]);
  assert.equal(imageOverrideFor(db3, cup), null);
});

test("the card's library strip lists only approved images of the sense", () => {
  const db = openDb();
  const cup = senseOf(db, "cup");
  const apple = senseOf(db, "apple");
  // The shipped catalog may already carry approved pictures of cup.
  const shipped = db.prepare("SELECT id FROM image WHERE sense_id = ? AND status = 'approved'")
    .all(cup).map((r) => r.id);
  addImage(db, "img_cup_a", cup, "art/cup_a.png");
  addImage(db, "img_cup_b", cup, "art/cup_b.png");
  addImage(db, "img_apple", apple, "art/apple.png");
  db.prepare("INSERT INTO image (id, sense_id, key, status, sha256) VALUES ('img_cup_x', ?, 'art/cup_x.png', 'pending', '00')")
    .run(cup);
  assert.deepEqual(
    libraryImagesFor(db, cup).map((i) => i.id).sort(),
    [...shipped, "img_cup_a", "img_cup_b"].sort());
});
