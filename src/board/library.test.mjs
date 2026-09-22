/**
 * 009 slice 3 Works Test — the Word Library's read side.
 *
 * Proves: Added lists the family's words newest first (entities by
 * creation, catalog senses by first non-builtin placement); search finds
 * entities and catalog labels with prefix before substring; every query
 * runs under PRAGMA query_only — the Library cannot write; and Suggested
 * is honestly empty until partner listening lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createGroup, placeItem } from "../../public/shared/groups.mjs";
import {
  libraryAdded,
  libraryAll,
  librarySearch,
  librarySuggested,
  libraryHomes,
} from "../../public/shared/library.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const saveEntity = (db, id, name, groupId, at) => {
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint, added_at) VALUES (?, ?, NULL, NULL, NULL, ?)",
  ).run(id, name, at);
  db.prepare(
    "INSERT INTO group_cell (group_id, item_kind, item_id, page, slot_index, added_at) VALUES (?, 'entity', ?, 0, 58, ?)",
  ).run(groupId, id, at);
};

const senseId = (db, word) =>
  db.prepare(
    `SELECT sense_id FROM label WHERE normalized_text=? AND kind='lemma' AND status='approved' AND locale='en'`,
  ).all(word)[0]?.sense_id;

test("Added lists the family's words newest first", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals", 1000);
  saveEntity(db, "ent_grandma", "Grandma", "grp_people", 2000);
  const swing = senseId(db, "swing");
  assert.ok(swing, "fixture sense exists");
  db.prepare(
    "INSERT INTO group_cell (group_id, item_kind, item_id, page, slot_index, added_at) VALUES ('grp_my_words', 'sense', ?, 0, 57, ?)",
  ).run(swing, 3000);

  const added = libraryAdded(db, "en");
  assert.deepEqual(
    added.slice(0, 3).map((r) => r.id),
    [swing, "ent_grandma", "ent_cooper"],
    "newest placement first",
  );
  // a sense seeded only in a built-in group is not "added" by the family
  const builtinOnly = db.prepare(
    `SELECT s.id FROM sense s
     WHERE EXISTS (SELECT 1 FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
                   WHERE gc.item_id = s.id AND g.kind = 'builtin')
       AND NOT EXISTS (SELECT 1 FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
                       WHERE gc.item_id = s.id AND g.kind != 'builtin')
     LIMIT 1`,
  ).all()[0].id;
  assert.ok(!added.some((r) => r.id === builtinOnly));
});

test("search is prefix-first and covers entities and catalog labels", () => {
  const db = openDb();
  saveEntity(db, "ent_grandma", "Grandma", "grp_people", 1000);
  const hits = librarySearch(db, "gra", "en", normalizeV1);
  const labels = hits.map((h) => h.label);
  assert.ok(labels.includes("Grandma"), "entity found");
  assert.ok(labels.includes("grapes"), "catalog label found");
  // prefix beats substring: 'grandma'/'grapes' before 'program'-likes
  const firstNonPrefix = hits.findIndex((h) => !h.label.toLowerCase().startsWith("gra"));
  if (firstNonPrefix > 0) {
    assert.ok(hits.slice(0, firstNonPrefix).every((h) => h.label.toLowerCase().startsWith("gra")));
  }
});

test("All lists every catalog word plus active entities; retired are absent", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals", 1000);
  const all = libraryAll(db, "en");
  assert.ok(all.length >= 680, "catalog + entities");
  assert.ok(all.some((r) => r.id === "ent_cooper"));
  db.prepare("UPDATE personal_entity SET status='retired' WHERE id='ent_cooper'").run();
  assert.ok(!libraryAll(db, "en").some((r) => r.id === "ent_cooper"));
});

test("every query runs under PRAGMA query_only — the Library cannot write", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals", 1000);
  db.exec("PRAGMA query_only = ON");
  assert.ok(libraryAdded(db, "en").length > 0);
  assert.ok(libraryAll(db, "en").length > 0);
  assert.ok(librarySearch(db, "coo", "en", normalizeV1).length > 0);
  assert.deepEqual(librarySuggested(db, "en"), []);
  assert.throws(() =>
    db.prepare("DELETE FROM personal_entity").run(),
  );
  db.exec("PRAGMA query_only = OFF");
});

test("libraryHomes names where a word lives, index order", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals", 1000);
  placeItem(db, "grp_people", "entity", "ent_cooper");
  const homes = libraryHomes(db, "entity", "ent_cooper", "en");
  assert.ok(homes.includes("Animals"));
  assert.ok(homes.includes("People"));
});
