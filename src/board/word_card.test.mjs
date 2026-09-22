/**
 * 009 slice 2 Works Test (card half) — the word card is the one edit
 * surface: rename, group chips, retire. All assertions measure rows.
 *
 * Proves: a rename updates spoken_name and supersedes the ready override
 * and enrichment (the old name must not keep playing); group chips add
 * and remove placements while never leaving the entity in no group;
 * Remove retires — the entity renders nowhere yet stays restorable; the
 * core map is never touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import {
  createGroup,
  entityGroups,
  groupPage,
  placeItem,
  removeItem,
  renameEntity,
  retireEntity,
  restoreEntity,
  entityMatches,
} from "../../public/shared/groups.mjs";
import { stripCandidates, keyboardContinuations, logSelection } from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const saveEntity = (db, id, name, groupId) => {
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, NULL, NULL, NULL)",
  ).run(id, name);
  placeItem(db, groupId, "entity", id);
};

const cellsOf = (db, id) =>
  db
    .prepare("SELECT group_id, page, slot_index FROM group_cell WHERE item_kind='entity' AND item_id=? ORDER BY group_id")
    .all(id);

test("rename supersedes the ready override and enrichment; placements hold", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");
  // A ready override + ready enrichment, as if the family recorded and
  // the classifier ran.
  db.prepare(
    "INSERT INTO clip_override (id, entity_id, recorded_text, key, status) VALUES ('ovr_1', 'ent_cooper', 'Cooper', 'aud_x', 'ready')",
  ).run();
  db.prepare(
    "INSERT INTO entity_enrichment (id, entity_id, category_suggestion, model, prompt_version, status) VALUES ('enr_1', 'ent_cooper', 'Animals & Nature', 'm', 'p1', 'ready')",
  ).run();
  const cellsBefore = cellsOf(db, "ent_cooper");

  renameEntity(db, "ent_cooper", "Coop");

  assert.equal(
    db.prepare("SELECT spoken_name FROM personal_entity WHERE id='ent_cooper'").all()[0].spoken_name,
    "Coop",
  );
  assert.equal(
    db.prepare("SELECT status FROM clip_override WHERE id='ovr_1'").all()[0].status,
    "superseded",
  );
  assert.equal(
    db.prepare("SELECT status FROM entity_enrichment WHERE id='enr_1'").all()[0].status,
    "superseded",
  );
  // the bytes stay — the row is superseded, not deleted
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM clip_override").all()[0].n, 1);
  assert.deepEqual(cellsOf(db, "ent_cooper"), cellsBefore);
});

test("group chips: add to Home, remove from others, last group lands in My Words", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");
  placeItem(db, "grp_people", "entity", "ent_cooper");
  const { id: home } = createGroup(db, { name: "Home" });

  // + Add to group → a chip for Home
  placeItem(db, home, "entity", "ent_cooper");
  assert.ok(entityGroups(db, "ent_cooper", "en").some((g) => g.name === "Home"));

  // × on Animals and People chips → Home only
  removeItem(db, "grp_animals", "entity", "ent_cooper");
  removeItem(db, "grp_people", "entity", "ent_cooper");
  assert.deepEqual(cellsOf(db, "ent_cooper").map((r) => r.group_id), [home]);

  // × on the last chip → My Words, never nowhere
  removeItem(db, home, "entity", "ent_cooper");
  assert.deepEqual(cellsOf(db, "ent_cooper").map((r) => r.group_id), ["grp_my_words"]);
});

test("retired entities render nowhere and restore cleanly", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");
  logSelection(db, "entity", "ent_cooper");
  const wantId = db
    .prepare(
      `SELECT sense_id FROM label WHERE normalized_text='want' AND kind='lemma' AND status='approved' AND locale='en'`,
    )
    .all()[0].sense_id;
  const sentence = [{ kind: "sense", id: wantId }]; // a verb tail invites entities

  assert.ok(groupPage(db, "grp_animals", 0, "en").some((r) => r.item_id === "ent_cooper"));
  assert.ok(stripCandidates(db, sentence, Date.now(), "en").some((c) => c.id === "ent_cooper"));
  assert.ok(keyboardContinuations(db, sentence, "en").some((c) => c.id === "ent_cooper"));
  assert.ok(entityMatches(db, "Coo", "grp_people", "en").some((h) => h.id === "ent_cooper"));

  retireEntity(db, "ent_cooper");
  assert.ok(!groupPage(db, "grp_animals", 0, "en").some((r) => r.item_id === "ent_cooper"));
  assert.ok(!stripCandidates(db, sentence, Date.now(), "en").some((c) => c.id === "ent_cooper"));
  assert.ok(!keyboardContinuations(db, sentence, "en").some((c) => c.id === "ent_cooper"));
  assert.ok(!entityMatches(db, "Coo", "grp_people", "en").some((h) => h.id === "ent_cooper"));
  // the row, photo and placements stay — restorable
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE id='ent_cooper'").all()[0].n, 1);
  assert.equal(cellsOf(db, "ent_cooper").length, 1);

  restoreEntity(db, "ent_cooper");
  assert.ok(groupPage(db, "grp_animals", 0, "en").some((r) => r.item_id === "ent_cooper"));
});

test("the card never writes the core map", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");
  renameEntity(db, "ent_cooper", "Coop");
  retireEntity(db, "ent_cooper");
  restoreEntity(db, "ent_cooper");
  assert.deepEqual(snapshotCoreCells(db), before);
});
