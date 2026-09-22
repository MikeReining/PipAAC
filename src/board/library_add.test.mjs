/**
 * 009 slice 1 Works Test — `+ Add` offers every meaning, as pictures.
 * One meaning, one record; the spelling may repeat. Assertions measure
 * the database, not the matcher's report of itself.
 *
 * Proves: a typed prefix offers the family's own entities first (with the
 * groups they already sit in), then catalog senses; the current group
 * ranks but never hides; picking an existing meaning places the same
 * record, never a new row; "New" stays offered even when a name matches;
 * the core map is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import {
  catalogMatches,
  createGroup,
  entityMatches,
  placeItem,
} from "../../public/shared/groups.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

/** The target group's seed category — the same lookup the sheet does. */
const seedCategory = (groupId) =>
  catalog.groups.find((g) => g.id === groupId)?.category ?? null;

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

/** Same calls the add sheet makes for New, minus the DOM. */
function saveEntity(db, id, name, groupId) {
  const category = catalog.groups.find((g) => g.id === groupId)?.category ?? null;
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, NULL, ?, NULL)",
  ).run(id, name, category);
  placeItem(db, groupId, "entity", id);
}

const groupCellCount = (db, groupId, kind, id) =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    )
    .all(groupId, kind, id)[0].n;

test("the family's own words are offered first and placing one adds no record", () => {
  const db = openDb();
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");

  // "Coo" in People offers Cooper first, subtitled with where he is.
  const hits = entityMatches(db, "Coo", "grp_people", "en", seedCategory("grp_people"));
  assert.equal(hits[0].id, "ent_cooper");
  assert.deepEqual(hits[0].groups, ["Animals"]);

  // Picking the row places the same record: still one entity, now in two groups.
  placeItem(db, "grp_people", "entity", "ent_cooper");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_entity").all()[0].n, 1);
  assert.equal(groupCellCount(db, "grp_animals", "entity", "ent_cooper"), 1);
  assert.equal(groupCellCount(db, "grp_people", "entity", "ent_cooper"), 1);

  // Already in People → not offered there again; still offered elsewhere.
  assert.ok(!entityMatches(db, "Coo", "grp_people", "en", seedCategory("grp_people")).some((h) => h.id === "ent_cooper"));
  assert.ok(entityMatches(db, "Coo", "grp_food", "en", seedCategory("grp_food")).some((h) => h.id === "ent_cooper"));

  // Empty input offers nothing.
  assert.deepEqual(entityMatches(db, "", "grp_people", "en"), []);
});

test("the group ranks catalog meanings but never hides one (the two bats)", () => {
  const db = openDb();
  // Fixture catalog: two approved 'bat' senses — the animal and the sport —
  // sharing one utterance (homographs share a recording, schema § 5.3).
  const bats = {
    ...catalog,
    senses: [
      ...catalog.senses,
      { id: "sns_9001", fitzgerald_role: "Yellow", art_archetype: "Illustrated Object",
        tier: "primary_fringe", category: "Animals & Nature" },
      { id: "sns_9002", fitzgerald_role: "Yellow", art_archetype: "Illustrated Object",
        tier: "primary_fringe", category: "Toys, Play, Media & Leisure" },
    ],
    utterances: [
      ...catalog.utterances,
      { id: "utt_9001", locale: "en", spoken_text: "bat",
        normalized_spoken_text: "bat", normalizer_version: "v1" },
    ],
    labels: [
      ...catalog.labels,
      { id: "lbl_9001", sense_id: "sns_9001", utterance_id: "utt_9001", locale: "en",
        text: "bat", normalized_text: "bat", normalizer_version: "v1", kind: "lemma",
        part_of_speech: "Noun", default_for_text: 1, status: "approved" },
      { id: "lbl_9002", sense_id: "sns_9002", utterance_id: "utt_9001", locale: "en",
        text: "bat", normalized_text: "bat", normalizer_version: "v1", kind: "lemma",
        part_of_speech: "Noun", default_for_text: 0, status: "approved" },
    ],
  };
  importCatalog(db, bats);

  // In Animals the animal sorts first; in Play (the sport category's
  // built-in) the sport sorts first. Both stay offered.
  const inAnimals = catalogMatches(db, "bat", "grp_animals", "en", seedCategory("grp_animals"));
  assert.deepEqual(inAnimals.map((m) => m.id).slice(0, 2), ["sns_9001", "sns_9002"]);
  const inPlay = catalogMatches(db, "bat", "grp_play", "en", seedCategory("grp_play"));
  assert.deepEqual(inPlay.map((m) => m.id).slice(0, 2), ["sns_9002", "sns_9001"]);
  // A group with no seed category falls back to the standing order:
  // exact matches first, then default_for_text (the animal carries it).
  const inMyWords = catalogMatches(db, "bat", "grp_my_words", "en", seedCategory("grp_my_words"));
  assert.deepEqual(inMyWords.map((m) => m.id).slice(0, 2), ["sns_9001", "sns_9002"]);

  // Both meanings may sit in one custom group — the PK forbids the same
  // record twice, not the same spelling.
  const { id: gid } = createGroup(db, { name: "At the park" });
  placeItem(db, gid, "sense", "sns_9001");
  placeItem(db, gid, "sense", "sns_9002");
  assert.equal(groupCellCount(db, gid, "sense", "sns_9001"), 1);
  assert.equal(groupCellCount(db, gid, "sense", "sns_9002"), 1);
  // Neither is offered into that group again (other "bat*" words may be).
  const remaining = catalogMatches(db, "bat", gid, "en", seedCategory(gid));
  assert.ok(!remaining.some((m) => m.id === "sns_9001" || m.id === "sns_9002"));
});

test('"New" is always offered — a repeated spelling is a second meaning, allowed', () => {
  const db = openDb();
  saveEntity(db, "ent_max_dog", "Max", "grp_animals");
  // The entity still matches the prefix in another group…
  assert.ok(entityMatches(db, "Max", "grp_people", "en", seedCategory("grp_people")).some((h) => h.id === "ent_max_dog"));
  // …and saving a New "Max" creates a second record — the add sheet keeps
  // the New row regardless of matches (UI constant, asserted in board.js).
  saveEntity(db, "ent_max_cousin", "Max", "grp_people");
  const names = db
    .prepare("SELECT id, spoken_name FROM personal_entity WHERE spoken_name = 'Max' ORDER BY id")
    .all();
  assert.deepEqual(names.map((r) => r.id), ["ent_max_cousin", "ent_max_dog"]);
  assert.equal(groupCellCount(db, "grp_people", "entity", "ent_max_cousin"), 1);
});

test("the add path never touches the core map", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  saveEntity(db, "ent_cooper", "Cooper", "grp_animals");
  entityMatches(db, "Coo", "grp_people", "en", seedCategory("grp_people"));
  catalogMatches(db, "Coo", "grp_people", "en", seedCategory("grp_people"));
  placeItem(db, "grp_people", "entity", "ent_cooper");
  assert.deepEqual(snapshotCoreCells(db), before);
});
