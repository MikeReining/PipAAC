/**
 * Groups Works Test (phase 003 slice 2) — one container, fixed
 * positions, paging. Every assertion is measured against the DB, not the
 * functions' return values.
 *
 * Proves: every categorized sense is reachable in a built-in group on
 * page 0; seeded order is lexicon order; the seed/reconcile never drops
 * an item and never moves a caregiver's; a legacy zone_slot/custom_group
 * DB migrates intact; removal rules hold; the core map is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import {
  catalogMatches,
  createGroup,
  deleteGroup,
  groupDisplayName,
  placeFromEnrichment,
  groupIndex,
  groupPage,
  migrateBuiltinGroupNames,
  migrateLegacyGroups,
  moveGroup,
  moveItem,
  pageCount,
  placeItem,
  removeItem,
  swapGroups,
  swapItems,
} from "../../public/shared/groups.mjs";
import { buildCatalog, buildGroups, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const pad4 = (n) => String(n).padStart(4, "0");
const lexSlot = new Map(lexicon.entries.map((e) => [`sns_${pad4(e.slot)}`, e.slot]));

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

function senseIdByText(db, text) {
  return db
    .prepare(
      `SELECT sense_id FROM label
       WHERE normalized_text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
    )
    .all(text)[0].sense_id;
}

test("reachability: every categorized sense sits in a built-in group, none past page 0", () => {
  const db = openDb();
  const missing = db
    .prepare(
      `SELECT s.id, s.category FROM sense s
       WHERE s.category IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM group_cell gc
         JOIN board_group g ON g.id = gc.group_id AND g.kind = 'builtin'
         WHERE gc.item_kind = 'sense' AND gc.item_id = s.id
       )`,
    )
    .all();
  assert.deepEqual(missing, []);
  const offPage = db
    .prepare(
      `SELECT gc.group_id, gc.item_id, gc.page FROM group_cell gc
       JOIN board_group g ON g.id = gc.group_id
       WHERE g.kind IN ('builtin', 'my_words') AND gc.page >= 1`,
    )
    .all();
  assert.deepEqual(offPage, []);

  const index = groupIndex(db);
  assert.equal(index.length, 23); // 19 seeded + the four grammar groups (014 § 3.1)
  assert.equal(index[0].id, "grp_my_words");
  assert.equal(index[0].index_slot, 10);
  for (const [i, g] of index.entries()) assert.equal(g.index_slot, 10 + i);
  assert.equal(pageCount(db, "grp_my_words"), 1); // empty at seed
  assert.deepEqual(groupPage(db, "grp_my_words", 0, "en"), []);
});

test("stable order: grp_food opens with bread and slot order is lexicon order", () => {
  const db = openDb();
  const rows = groupPage(db, "grp_food", 0, "en");
  assert.equal(rows.length, 54);
  assert.equal(rows[0].label, "bread");
  assert.equal(rows[0].slot_index, 2);
  assert.deepEqual(
    rows.map((r) => r.slot_index),
    rows.map((_, i) => 2 + i),
  );
  const slots = rows.map((r) => lexSlot.get(r.item_id));
  assert.deepEqual(slots, [...slots].sort((a, b) => a - b));
  // every row resolves a label and a Fitzgerald role
  for (const r of rows) {
    assert.ok(r.label.length > 0);
    assert.ok(["Yellow", "Green", "Blue", "Pink", "Red"].includes(r.fitzgerald_role));
  }
});

test("seed never drops: a new catalog word whose seeded slot is taken lands at nextFreeCell", () => {
  const db = openDb();
  const breadId = senseIdByText(db, "bread");
  moveItem(db, "grp_food", "sense", breadId, 0, 58); // caregiver moved it

  const catalog2 = {
    ...catalog,
    senses: [
      ...catalog.senses,
      {
        id: "sns_9000",
        fitzgerald_role: "Yellow",
        art_archetype: "Illustrated Object",
        tier: "primary_fringe",
        category: "Food & Drink",
      },
    ],
    utterances: [
      ...catalog.utterances,
      {
        id: "utt_9000",
        locale: "en",
        spoken_text: "zzxextra",
        normalized_spoken_text: "zzxextra",
        normalizer_version: "v1",
      },
    ],
    labels: [
      ...catalog.labels,
      {
        id: "lbl_9000",
        sense_id: "sns_9000",
        utterance_id: "utt_9000",
        locale: "en",
        text: "zzxextra",
        normalized_text: "zzxextra",
        normalizer_version: "v1",
        kind: "lemma",
        part_of_speech: "Noun",
        default_for_text: 0,
        status: "approved",
      },
    ],
    groupCells: [
      ...catalog.groupCells,
      { group_id: "grp_food", item_kind: "sense", item_id: "sns_9000", page: 0, slot_index: 58 },
    ],
  };
  importCatalog(db, catalog2);

  const cells = db
    .prepare(
      "SELECT item_id, page, slot_index FROM group_cell WHERE group_id = 'grp_food' AND item_id IN (?, ?)",
    )
    .all(breadId, "sns_9000");
  assert.equal(cells.length, 2);
  const bread = cells.find((c) => c.item_id === breadId);
  const extra = cells.find((c) => c.item_id === "sns_9000");
  assert.deepEqual({ page: bread.page, slot_index: bread.slot_index }, { page: 0, slot_index: 58 });
  // slot 58 was taken, so the new sense fell to the lowest free cell —
  // slot 2, the one bread vacated.
  assert.deepEqual({ page: extra.page, slot_index: extra.slot_index }, { page: 0, slot_index: 2 });
});

test("caregiver edits survive re-import: swapped cells and swapped groups hold", () => {
  const db = openDb();
  const [a, b] = groupPage(db, "grp_food", 0, "en");
  swapItems(
    db,
    "grp_food",
    { item_kind: a.item_kind, item_id: a.item_id },
    { item_kind: b.item_kind, item_id: b.item_id },
  );
  const foodWas = groupIndex(db).find((g) => g.id === "grp_food").index_slot;
  const animalsWas = groupIndex(db).find((g) => g.id === "grp_animals").index_slot;
  swapGroups(db, "grp_food", "grp_animals");

  importCatalog(db, catalog); // reconcile re-run

  const after = groupPage(db, "grp_food", 0, "en");
  assert.equal(after.find((r) => r.item_id === a.item_id).slot_index, b.slot_index);
  assert.equal(after.find((r) => r.item_id === b.item_id).slot_index, a.slot_index);
  const idx = groupIndex(db);
  assert.equal(idx.find((g) => g.id === "grp_food").index_slot, animalsWas);
  assert.equal(idx.find((g) => g.id === "grp_animals").index_slot, foodWas);
});

test("legacy migration keeps custom groups, entities, and the caregiver's arrangement", () => {
  const db = openDb(); // board_group/group_cell already seeded by import
  db.exec(`
    CREATE TABLE zone_slot (zone_key TEXT PRIMARY KEY, slot_index INTEGER NOT NULL);
    CREATE TABLE custom_group (id TEXT PRIMARY KEY, name TEXT NOT NULL, photo_key TEXT);
    CREATE TABLE group_item (
      group_id TEXT NOT NULL, entity_id TEXT NOT NULL, slot_index INTEGER NOT NULL,
      PRIMARY KEY (group_id, entity_id)
    );
  `);
  db.exec(`INSERT INTO zone_slot (zone_key, slot_index) VALUES
    ('my_words', 10), ('Food & Drink', 11), ('Animals & Nature', 40), ('grp_custom1', 30)`);
  db.prepare("INSERT INTO custom_group (id, name, photo_key) VALUES ('grp_custom1', 'Sofia''s snacks', NULL)").run();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_a', 'Pirate Booty', NULL, NULL, NULL)",
  ).run();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_b', 'Goldfish', NULL, NULL, NULL)",
  ).run();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_c', 'Rex', NULL, 'Animals & Nature', NULL)",
  ).run();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_d', 'Baba', NULL, NULL, NULL)",
  ).run();
  db.exec("INSERT INTO group_item (group_id, entity_id, slot_index) VALUES ('grp_custom1', 'ent_a', 0), ('grp_custom1', 'ent_b', 1)");

  migrateLegacyGroups(db, catalog);

  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name),
  );
  for (const t of ["zone_slot", "custom_group", "group_item"]) {
    assert.ok(!tables.has(t), `legacy table ${t} survived migration`);
  }

  const idx = groupIndex(db);
  assert.equal(idx.find((g) => g.id === "grp_animals").index_slot, 40);
  const custom = idx.find((g) => g.id === "grp_custom1");
  assert.equal(custom.kind, "custom");
  assert.equal(custom.name, "Sofia's snacks");
  // The legacy slot (30) is now a built-in's — grp_more_doing (014
  // slice 4). Placement law: a taken slot degrades to the lowest free
  // one — 22, which Animals vacated when its zone row moved it to 40.
  assert.equal(custom.index_slot, 22);

  const customCells = groupPage(db, "grp_custom1", 0, "en");
  assert.deepEqual(
    customCells.map((r) => [r.item_id, r.slot_index]),
    [
      ["ent_a", 2],
      ["ent_b", 3],
    ],
  );
  assert.ok(
    db
      .prepare("SELECT 1 AS x FROM group_cell WHERE group_id = 'grp_animals' AND item_id = 'ent_c'")
      .all().length === 1,
  );
  assert.ok(
    db
      .prepare("SELECT 1 AS x FROM group_cell WHERE group_id = 'grp_my_words' AND item_id = 'ent_d'")
      .all().length === 1,
  );
  // entities in a custom group are not duplicated into My Words
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_my_words' AND item_id IN ('ent_a', 'ent_b')")
      .all()[0].n,
    0,
  );
});

test("removal rules: built-in senses stay, orphaned entities land in My Words, built-ins can't delete", () => {
  const db = openDb();
  const food = groupPage(db, "grp_food", 0, "en")[0];
  assert.throws(() => removeItem(db, "grp_food", "sense", food.item_id), /built-in/);
  assert.throws(() => deleteGroup(db, "grp_food"), /custom/);
  assert.throws(() => deleteGroup(db, "grp_my_words"), /custom/);

  const { id: gid } = createGroup(db, { name: "Snack time" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_x', 'Rex', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_x");
  // a sense may sit in (and leave) a custom group
  placeItem(db, gid, "sense", food.item_id);
  removeItem(db, gid, "sense", food.item_id);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ? AND item_id = ?").all(gid, food.item_id)[0].n,
    0,
  );

  removeItem(db, gid, "entity", "ent_x"); // its only group
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_my_words' AND item_id = 'ent_x'").all()[0].n,
    1,
  );

  deleteGroup(db, gid);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM board_group WHERE id = ?").all(gid)[0].n, 0);
});

test("slice 3 edit gestures: move a group, swap two items, remove an entity, delete a group", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  const assertCore = () => assert.deepEqual(snapshotCoreCells(db), before);

  // lift Animals, tap empty slot 59 → moveGroup
  const animalsWas = groupIndex(db).find((g) => g.id === "grp_animals").index_slot;
  moveGroup(db, "grp_animals", 59);
  assert.equal(groupIndex(db).find((g) => g.id === "grp_animals").index_slot, 59);
  assertCore();

  // lift bread, tap another occupied cell → swapItems
  const [a, b] = groupPage(db, "grp_food", 0, "en");
  assert.equal(a.label, "bread");
  swapItems(db, "grp_food", a, b);
  const food = groupPage(db, "grp_food", 0, "en");
  assert.equal(food.find((r) => r.item_id === a.item_id).slot_index, b.slot_index);
  assert.equal(food.find((r) => r.item_id === b.item_id).slot_index, a.slot_index);
  assertCore();

  // custom group holding an entity that also lives in My Words:
  // Remove from the custom group leaves the My Words copy untouched
  const { id: gid } = createGroup(db, { name: "School" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_z', 'Ms. J', NULL, NULL, NULL)",
  ).run();
  placeItem(db, "grp_my_words", "entity", "ent_z");
  placeItem(db, gid, "entity", "ent_z");
  removeItem(db, gid, "entity", "ent_z");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ? AND item_id = 'ent_z'").all(gid)[0].n,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_my_words' AND item_id = 'ent_z'").all()[0].n,
    1,
  );
  assertCore();

  // Delete group → the group row and its cells are gone
  deleteGroup(db, gid);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM board_group WHERE id = ?").all(gid)[0].n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ?").all(gid)[0].n, 0);
  assertCore();
});

test("slice 4 add flow: matches exclude senses already in the target group", () => {
  const db = openDb();
  const banana = senseIdByText(db, "banana");
  // banana is seeded in Food; My Words lacks it → offered
  const hits = catalogMatches(db, "ban", "grp_my_words", "en");
  assert.ok(hits.some((h) => h.id === banana && h.label === "banana"));
  placeItem(db, "grp_my_words", "sense", banana);
  assert.ok(!catalogMatches(db, "ban", "grp_my_words", "en").some((h) => h.id === banana));

  // water is seeded in Drinks → never offered there, but still offered
  // to a group that lacks it
  const water = senseIdByText(db, "water");
  assert.ok(!catalogMatches(db, "wat", "grp_drinks", "en").some((h) => h.id === water));
  assert.ok(catalogMatches(db, "wat", "grp_my_words", "en").some((h) => h.id === water));

  // empty/garbage input returns nothing
  assert.deepEqual(catalogMatches(db, "", "grp_my_words", "en"), []);
});

test("slice 4: an entity placed in a custom group survives catalog re-import at its slot", () => {
  const db = openDb();
  const { id: gid } = createGroup(db, { name: "School" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_s', 'Ms. T', NULL, NULL, NULL)",
  ).run();
  const cell = placeItem(db, gid, "entity", "ent_s");
  importCatalog(db, catalog);
  const after = db
    .prepare("SELECT page, slot_index FROM group_cell WHERE group_id = ? AND item_id = 'ent_s'")
    .all(gid);
  assert.equal(after.length, 1);
  assert.deepEqual(
    { page: after[0].page, slot_index: after[0].slot_index },
    { page: cell.page, slot_index: cell.slot_index },
  );
});

test("slice 4 Cooper proof: a personal entity lands in the group it was added from", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  const senseCount = db.prepare("SELECT COUNT(*) AS n FROM sense").all()[0].n;
  // Edit → Animals → + Add → "Cooper" → New → Save — same calls the
  // sheet makes, minus the DOM. The target's seed category writes to the
  // record (a classifier input, never displayed).
  const category = catalog.groups.find((g) => g.id === "grp_animals").category;
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_cooper', 'Cooper', NULL, ?, NULL)",
  ).run(category);
  placeItem(db, "grp_animals", "entity", "ent_cooper");

  const row = db.prepare("SELECT * FROM personal_entity WHERE id = 'ent_cooper'").all()[0];
  assert.equal(row.spoken_name, "Cooper");
  assert.equal(row.category, "Animals & Nature");
  assert.equal(
    db.prepare(
      "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_animals' AND item_kind = 'entity' AND item_id = 'ent_cooper'",
    ).all()[0].n,
    1,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sense").all()[0].n, senseCount);
  assert.deepEqual(snapshotCoreCells(db), before);
});

test("slice 5 classifier placement: ready suggestion adds a copy, never moves", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_e', 'Rex', NULL, NULL, NULL)",
  ).run();
  const mwCell = placeItem(db, "grp_my_words", "entity", "ent_e");

  // abstained → nothing
  db.prepare(
    "INSERT INTO entity_enrichment (id, entity_id, category_suggestion, model, prompt_version, status) VALUES ('enr_1', 'ent_e', 'Animals & Nature', 'm', 'p1', 'abstained')",
  ).run();
  assert.equal(placeFromEnrichment(db, "ent_e", catalog), null);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE item_id = 'ent_e'").all()[0].n,
    1,
  );

  // ready + suggestion → copy into grp_animals; My Words slot unchanged
  db.prepare(
    "INSERT INTO entity_enrichment (id, entity_id, category_suggestion, model, prompt_version, status) VALUES ('enr_2', 'ent_e', 'Animals & Nature', 'm', 'p1', 'ready')",
  ).run();
  assert.equal(placeFromEnrichment(db, "ent_e", catalog), "grp_animals");
  const mwAfter = db
    .prepare("SELECT page, slot_index FROM group_cell WHERE group_id = 'grp_my_words' AND item_id = 'ent_e'")
    .all()[0];
  assert.deepEqual({ page: mwAfter.page, slot_index: mwAfter.slot_index }, mwCell);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_animals' AND item_id = 'ent_e'").all()[0].n,
    1,
  );

  // second call is a no-op
  assert.equal(placeFromEnrichment(db, "ent_e", catalog), null);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE item_id = 'ent_e'").all()[0].n,
    2,
  );
  assert.deepEqual(snapshotCoreCells(db), before);
});

test("slice 1: group names resolve per locale — override wins, no cross-locale fallback", () => {
  const db = openDb();
  // seeded rows carry no name — it is the caregiver-override column
  const row = () => db.prepare("SELECT id, name FROM board_group WHERE id = 'grp_food'").all()[0];
  assert.equal(row().name, null);
  assert.equal(groupDisplayName(db, row(), "en"), "Food");
  // a test-only second locale
  db.prepare("INSERT INTO group_label (group_id, locale, text) VALUES ('grp_food', 'de', 'Essen')").run();
  assert.equal(groupDisplayName(db, row(), "de"), "Essen");
  // no de → empty (glyph-only), never the English fallback
  assert.equal(groupDisplayName(db, row(), "fr"), "");
  // a caregiver rename wins in every locale
  db.prepare("UPDATE board_group SET name = 'Snacks' WHERE id = 'grp_food'").run();
  assert.equal(groupDisplayName(db, row(), "en"), "Snacks");
  assert.equal(groupDisplayName(db, row(), "de"), "Snacks");
});

test("slice 1: seed-name migration NULLs stored seed names, keeps renames, idempotent", () => {
  const db = openDb();
  // simulate a device persisted under the pre-003b schema, which stored
  // the English seed name in board_group.name
  db.prepare("UPDATE board_group SET name = 'Food' WHERE id = 'grp_food'").run();
  db.prepare("UPDATE board_group SET name = 'Yummy' WHERE id = 'grp_drinks'").run();
  migrateBuiltinGroupNames(db, catalog);
  const nameOf = (id) => db.prepare("SELECT name FROM board_group WHERE id = ?").all(id)[0].name;
  assert.equal(nameOf("grp_food"), null);
  assert.equal(nameOf("grp_drinks"), "Yummy"); // a caregiver rename, not the seed
  migrateBuiltinGroupNames(db, catalog); // second run changes nothing
  assert.equal(nameOf("grp_food"), null);
  assert.equal(nameOf("grp_drinks"), "Yummy");
  // and the nulled groups still display via group_label
  const food = db.prepare("SELECT id, name FROM board_group WHERE id = 'grp_food'").all()[0];
  assert.equal(groupDisplayName(db, food, "en"), "Food");
});

test("slice 1: the build rejects a group with no name for a shipped locale", () => {
  assert.throws(
    () => buildGroups(lexicon, { groups: [{ key: "x", names: { de: "X" }, words: [] }] }, ["en"]),
    /no name for shipped locale "en"/,
  );
  assert.throws(
    () => buildGroups(lexicon, { groups: [{ key: "x", words: [] }] }, ["en"]),
    /per-locale map/,
  );
});

test("the core coordinate map is untouched by every group operation", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  const assertCore = () => assert.deepEqual(snapshotCoreCells(db), before);

  const food = groupPage(db, "grp_food", 0, "en")[0];
  moveItem(db, "grp_food", "sense", food.item_id, 0, 58);
  assertCore();
  const [a, b] = groupPage(db, "grp_food", 0, "en");
  swapItems(db, "grp_food", a, b);
  assertCore();
  swapGroups(db, "grp_food", "grp_animals");
  assertCore();
  const { id: gid } = createGroup(db, { name: "School" });
  assertCore();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_y', 'Ms. K', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_y");
  removeItem(db, gid, "entity", "ent_y"); // lands in My Words
  assertCore();
  deleteGroup(db, gid);
  assertCore();
  moveGroup(db, "grp_food", nextFreeIndexSlot(db));
  assertCore();
  importCatalog(db, catalog); // reconcile re-run
  assertCore();
});

function nextFreeIndexSlot(db) {
  const used = new Set(groupIndex(db).map((g) => g.index_slot));
  for (let s = 10; s < 60; s++) if (!used.has(s)) return s;
  throw new Error("no free index slot");
}
