/**
 * Zone map Works Test — zones are a second coordinate map, not a modal.
 *
 * Proves: import seeds a zone_slot row per fringe category plus My Words;
 * a custom group claims a zone slot and holds entities in stable order;
 * an arrange move persists; the seed never overwrites a caregiver's move.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("import seeds zone_slot: my_words at 10, all 16 categories after", () => {
  const db = openDb();
  const rows = db.prepare("SELECT zone_key, slot_index FROM zone_slot ORDER BY slot_index").all();
  assert.equal(rows.length, 17);
  assert.equal(rows[0].zone_key, "my_words");
  assert.equal(rows[0].slot_index, 10);
  const cats = new Set(catalog.senses.filter((s) => s.category).map((s) => s.category));
  assert.equal(cats.size, 16);
  for (const c of cats) {
    assert.ok(rows.some((r) => r.zone_key === c), `zone_slot missing ${c}`);
  }
  for (const r of rows) {
    assert.ok(r.slot_index >= 10 && r.slot_index < 60);
  }
});

test("zone views list cross-listed core senses beside their fringe", () => {
  const db = openDb();
  const zone = (key) =>
    db
      .prepare(
        `SELECT l.text AS label FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
         WHERE s.category = ?`,
      )
      .all(key)
      .map((r) => r.label);

  // Rule-0 words must be reachable inside their zones, not only on the board.
  const feelings = zone("Feelings, Emotions & Sensory States");
  for (const w of ["happy", "sad"]) assert.ok(feelings.includes(w), `Feelings missing ${w}`);
  assert.ok(zone("Body, Health & Hygiene").includes("hurt"));
  const social = zone("Social Etiquette, Pragmatic Interjections & Urgent/Safety");
  for (const w of ["yes", "no", "stop", "help", "please"]) {
    assert.ok(social.includes(w), `Social missing ${w}`);
  }
  const actions = zone("Daily Actions & Activity Verbs");
  for (const w of ["eat", "drink", "play", "open", "turn"]) {
    assert.ok(actions.includes(w), `Daily Actions missing ${w}`);
  }
  const descriptors = zone("Descriptors, Adjectives & Opposites");
  for (const w of ["big", "little", "good", "bad"]) {
    assert.ok(descriptors.includes(w), `Descriptors missing ${w}`);
  }
  const grammar = zone("Function Words & Grammar");
  for (const w of ["not", "and"]) assert.ok(grammar.includes(w), `Function Words missing ${w}`);

  // New fringe words land in their zones.
  for (const w of ["hit", "bite", "break", "scratch", "close", "shut", "tickle"]) {
    assert.ok(actions.includes(w), `Daily Actions missing new fringe ${w}`);
  }
  const food = zone("Food & Drink");
  for (const w of ["breakfast", "lunch", "dinner", "food", "ketchup", "fries"]) {
    assert.ok(food.includes(w), `Food missing new fringe ${w}`);
  }
});

test("custom group claims a free zone slot and holds entities in order", () => {
  const db = openDb();
  db.prepare("INSERT INTO custom_group (id, name, photo_key) VALUES (?, ?, NULL)").run(
    "grp_test", "Sofia's snacks",
  );
  db.prepare("INSERT INTO zone_slot (zone_key, slot_index) VALUES (?, ?)").run("grp_test", 27);
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, NULL, NULL, NULL)",
  ).run("ent_a", "Pirate Booty");
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, NULL, NULL, NULL)",
  ).run("ent_b", "Goldfish");
  db.prepare("INSERT INTO group_item (group_id, entity_id, slot_index) VALUES (?, ?, ?)")
    .run("grp_test", "ent_a", 0);
  db.prepare("INSERT INTO group_item (group_id, entity_id, slot_index) VALUES (?, ?, ?)")
    .run("grp_test", "ent_b", 1);

  const zone = db.prepare("SELECT slot_index FROM zone_slot WHERE zone_key = 'grp_test'").get();
  assert.equal(zone.slot_index, 27);
  const items = db.prepare(
    "SELECT e.spoken_name FROM group_item gi JOIN personal_entity e ON e.id = gi.entity_id WHERE gi.group_id = 'grp_test' ORDER BY gi.slot_index",
  ).all();
  assert.deepEqual(items.map((i) => i.spoken_name), ["Pirate Booty", "Goldfish"]);
});

test("arrange move persists and a later import never overwrites it", () => {
  const db = openDb();
  const food = db.prepare("SELECT slot_index FROM zone_slot WHERE zone_key = 'Food & Drink'").get();
  const animals = db.prepare("SELECT slot_index FROM zone_slot WHERE zone_key = 'Animals & Nature'").get();

  // swap, the way arrange mode writes it
  db.prepare("UPDATE zone_slot SET slot_index = ? WHERE zone_key = 'Food & Drink'").run(animals.slot_index);
  db.prepare("UPDATE zone_slot SET slot_index = ? WHERE zone_key = 'Animals & Nature'").run(food.slot_index);

  importCatalog(db, catalog); // reconcile re-run — OR IGNORE must not reset positions
  assert.equal(
    db.prepare("SELECT slot_index FROM zone_slot WHERE zone_key = 'Food & Drink'").get().slot_index,
    animals.slot_index,
  );
});

test("core_cell is untouched by zone rows — the maps are independent", () => {
  const db = openDb();
  const before = db.prepare("SELECT COUNT(*) AS n FROM core_cell").get().n;
  db.prepare("UPDATE zone_slot SET slot_index = 59 WHERE zone_key = 'my_words'").run();
  db.prepare("INSERT INTO custom_group (id, name, photo_key) VALUES ('grp_x', 'X', NULL)").run();
  db.prepare("INSERT INTO zone_slot (zone_key, slot_index) VALUES ('grp_x', 58)").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM core_cell").get().n, before);
});
