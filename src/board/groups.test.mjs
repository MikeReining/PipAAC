/**
 * Groups Works Test (phase 003 slice 2) — one container, fixed
 * positions, paging. Every assertion is measured against the DB, not the
 * functions' return values.
 *
 * Proves: the 027 seed — index order, one page on 60/90, shared cells for
 * repeated occasion words, reserved cells kept clear, authored grid15
 * first pages, every launch word reachable on every size — and each
 * compiler gate rejecting once; caregiver edits survive re-import;
 * removal rules hold; the core map is untouched.
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
  moveGroup,
  moveItem,
  pageCount,
  placeItem,
  removeItem,
  swapGroups,
  swapItems,
} from "../../public/shared/groups.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";
import { buildGroups, validateGroups } from "../../scripts/catalog/build_groups.mjs";

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

const seedTopics = JSON.parse(readFileSync(join(repoRoot, "data/group_seed.topics.json"), "utf8"));
const seedOccasions = JSON.parse(readFileSync(join(repoRoot, "data/group_seed.occasions.json"), "utf8"));
const compile = (topics = seedTopics, occasions = seedOccasions) =>
  buildGroups(lexicon, topics, occasions, { layouts: catalog.layouts, coreCells: catalog.coreCells });
const OCCASION_GROUPS = ["grp_breakfast", "grp_lunch", "grp_dinner", "grp_snack", "grp_fruit", "grp_drinks"];
const lemma = (id) => catalog.labels.find((l) => l.sense_id === id && l.kind === "lemma" && l.locale === "en").text;
const cellsOf = (gid, layout) => catalog.groupCells.filter((c) => c.group_id === gid && c.layout === layout);

test("027 A1 seed: occasions lead the index, then My Words; every seeded group is one page on 60/90", () => {
  const ids = catalog.groups.map((g) => g.id);
  assert.deepEqual(ids.slice(0, 5), ["grp_breakfast", "grp_lunch", "grp_dinner", "grp_snack", "grp_my_words"]);
  catalog.groups.forEach((g, i) => assert.equal(g.index_slot, 10 + i));
  assert.deepEqual(catalog.groups.filter((g) => g.occasion).map((g) => g.id), ids.slice(0, 4));
  assert.ok(!ids.includes("grp_food"), "no Food mega-group");
  for (const c of catalog.groupCells) {
    if (c.layout !== "grid15") assert.equal(c.page, 0, `${c.group_id} ${lemma(c.item_id)} on ${c.layout}`);
  }
  // the DB the board reads carries the same seed
  const db = openDb();
  assert.deepEqual(groupIndex(db).map((g) => g.id), ids);
  assert.deepEqual(groupPage(db, "grp_my_words", 0, "en"), []);
});

test("027 B2: a word repeated across meal, Fruit and Drinks groups has one cell per size", () => {
  for (const layout of Object.keys(catalog.layouts)) {
    const at = new Map();
    for (const gid of OCCASION_GROUPS) {
      for (const c of cellsOf(gid, layout)) {
        const k = `${c.page}:${c.slot_index}`;
        if (at.has(c.item_id)) assert.equal(at.get(c.item_id), k, `${lemma(c.item_id)} on ${layout}`);
        at.set(c.item_id, k);
      }
    }
  }
  // membership stays independent: yogurt on Breakfast, cup on Snack, no popcorn on Breakfast
  const inGroup = (gid, w) => catalog.groupMembers.some((m) => m.group_id === gid && lemma(m.item_id) === w);
  assert.ok(inGroup("grp_breakfast", "yogurt"));
  assert.ok(inGroup("grp_snack", "cup"));
  assert.ok(!inGroup("grp_breakfast", "popcorn"));
});

test("027 § 3.2: no seeded position sits on the top row, the frame, or Next", () => {
  for (const [layout, l] of Object.entries(catalog.layouts)) {
    const home = new Map(catalog.coreCells.filter((c) => c.layout === layout)
      .map((c) => [lemma(c.sense_id), c.slot_index]));
    const frame = ["yes", "no", "stop", "help"].map((w) => home.get(w));
    const reserved = new Set([...Array(l.cols).keys(), ...frame, l.cols * l.rows - 1]);
    for (const c of catalog.groupCells.filter((x) => x.layout === layout)) {
      assert.ok(!reserved.has(c.slot_index), `${c.group_id} ${lemma(c.item_id)} on reserved ${layout}:${c.slot_index}`);
    }
    // eat, drink, all done sit at their home cells in every meal group where free
    for (const w of ["eat", "drink", "all done"]) {
      const slot = home.get(w);
      if (slot === undefined || reserved.has(slot)) continue;
      for (const gid of OCCASION_GROUPS.slice(0, 4)) {
        const c = cellsOf(gid, layout).find((x) => lemma(x.item_id) === w);
        assert.deepEqual([c.page, c.slot_index], [0, slot], `${w} in ${gid} on ${layout}`);
      }
    }
  }
});

test("027 § 3.2: grid15 authors every meal group's first page; Dinner has its own", () => {
  for (const gid of ["grp_breakfast", "grp_lunch", "grp_dinner", "grp_snack"]) {
    const first = cellsOf(gid, "grid15").filter((c) => c.page === 0).map((c) => lemma(c.item_id));
    for (const w of ["milk", "water", "cup", "eat", "all done"]) assert.ok(first.includes(w), `${w} on ${gid} page 1`);
    assert.equal(first.length, 7, `${gid} fills its 7 content cells`);
  }
  assert.ok(cellsOf("grp_breakfast", "grid15").some((c) => c.page === 0 && lemma(c.item_id) === "banana"));
  assert.ok(cellsOf("grp_dinner", "grid60").some((c) => lemma(c.item_id) === "dinner"));
});

test("026 D6: every launch word is reachable on every size — home board or a group shown there", () => {
  for (const layout of Object.keys(catalog.layouts)) {
    const shown = new Set(catalog.groups.filter((g) => !g.layouts || g.layouts.includes(layout)).map((g) => g.id));
    const reach = new Set([
      ...catalog.coreCells.filter((c) => c.layout === layout).map((c) => c.sense_id),
      ...catalog.groupCells.filter((c) => c.layout === layout && shown.has(c.group_id)).map((c) => c.item_id),
    ]);
    const missing = catalog.senses.filter((s) => !reach.has(s.id)).map((s) => lemma(s.id));
    assert.deepEqual(missing, [], layout);
  }
});

test("027 A1 gates: each rejection is seen once", () => {
  const clone = () => structuredClone(compile());
  const ctx = { lexicon, coreCells: catalog.coreCells, coordinated: OCCASION_GROUPS };
  const expectReject = (mutate, re) => {
    const out = clone();
    mutate(out);
    assert.throws(() => validateGroups(out, ctx), re);
  };
  const lunch60 = (out) => out.groupCells.filter((c) => c.group_id === "grp_lunch" && c.layout === "grid60");
  expectReject((o) => { const [a, b] = lunch60(o); b.page = a.page; b.slot_index = a.slot_index; }, /overlap/);
  expectReject((o) => { lunch60(o)[0].slot_index = 0; }, /reserved cell/);
  expectReject((o) => { lunch60(o)[0].slot_index = 999; }, /out of bounds/);
  expectReject((o) => { lunch60(o)[0].page = 1; }, /more than one page/);
  expectReject((o) => {
    const milk = o.groupCells.find((c) => c.group_id === "grp_drinks" && c.layout === "grid60" && lemma(c.item_id) === "milk");
    const free = [13, 14, 15, 16, 17, 18].find((s) =>
      !o.groupCells.some((c) => c.group_id === "grp_drinks" && c.layout === "grid60" && c.slot_index === s));
    milk.slot_index = free;
  }, /repeated word mismatch/);
  expectReject((o) => { o.groupCells.splice(o.groupCells.indexOf(lunch60(o)[0]), 1); }, /member without a position/);
  expectReject((o) => {
    const zoo = catalog.labels.find((l) => l.text === "zoo" && l.kind === "lemma").sense_id;
    o.groupMembers = o.groupMembers.filter((m) => m.item_id !== zoo);
    o.groupCells = o.groupCells.filter((c) => c.item_id !== zoo);
  }, /missing route — "zoo"/);
  expectReject((o) => {
    o.groupMembers = o.groupMembers.filter((m) => !(m.group_id === "grp_lunch" && m.item_id === lunch60(o)[0].item_id));
  }, /position without membership/);
  // resolve-time rejections
  const dupTopics = structuredClone(seedTopics);
  dupTopics.groups.find((g) => g.key === "numbers").words.push("one");
  assert.throws(() => compile(dupTopics), /duplicate meaning/);
  const ambiguous = structuredClone(seedOccasions);
  ambiguous.groups.find((g) => g.key === "fruit").words.push("orange");
  assert.throws(() => compile(seedTopics, ambiguous), /resolves to 2 lexicon senses/);
  const orphan = structuredClone(seedOccasions);
  orphan.groups.push({ key: "brunch", names: { en: "Brunch" }, words: ["toast"] });
  assert.throws(() => compile(seedTopics, orphan), /no index position/);
});

test("caregiver edits survive re-import: swapped cells and swapped groups hold", () => {
  const db = openDb();
  const [a, b] = groupPage(db, "grp_breakfast", 0, "en");
  swapItems(
    db,
    "grp_breakfast",
    { item_kind: a.item_kind, item_id: a.item_id },
    { item_kind: b.item_kind, item_id: b.item_id },
  );
  const foodWas = groupIndex(db).find((g) => g.id === "grp_breakfast").index_slot;
  const animalsWas = groupIndex(db).find((g) => g.id === "grp_animals").index_slot;
  swapGroups(db, "grp_breakfast", "grp_animals");

  importCatalog(db, catalog); // reconcile re-run

  const after = groupPage(db, "grp_breakfast", 0, "en");
  assert.equal(after.find((r) => r.item_id === a.item_id).slot_index, b.slot_index);
  assert.equal(after.find((r) => r.item_id === b.item_id).slot_index, a.slot_index);
  const idx = groupIndex(db);
  assert.equal(idx.find((g) => g.id === "grp_breakfast").index_slot, animalsWas);
  assert.equal(idx.find((g) => g.id === "grp_animals").index_slot, foodWas);
});

test("removal rules: built-in senses stay, orphaned entities land in My Words, built-ins can't delete", () => {
  const db = openDb();
  const food = groupPage(db, "grp_breakfast", 0, "en")[0];
  assert.throws(() => removeItem(db, "grp_breakfast", "sense", food.item_id), /built-in/);
  assert.throws(() => deleteGroup(db, "grp_breakfast"), /custom/);
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

  // lift the meal word, tap another occupied cell → swapItems
  const [a, b] = groupPage(db, "grp_breakfast", 0, "en");
  assert.equal(a.label, "breakfast");
  swapItems(db, "grp_breakfast", a, b);
  const food = groupPage(db, "grp_breakfast", 0, "en");
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
  // banana is seeded in Fruit; My Words lacks it → offered
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
  const row = () => db.prepare("SELECT id, name FROM board_group WHERE id = 'grp_breakfast'").all()[0];
  assert.equal(row().name, null);
  assert.equal(groupDisplayName(db, row(), "en"), "Breakfast");
  // a test-only second locale
  db.prepare("INSERT INTO group_label (group_id, locale, text) VALUES ('grp_breakfast', 'de', 'Frühstück')").run();
  assert.equal(groupDisplayName(db, row(), "de"), "Frühstück");
  // no de → empty (glyph-only), never the English fallback
  assert.equal(groupDisplayName(db, row(), "fr"), "");
  // a caregiver rename wins in every locale
  db.prepare("UPDATE board_group SET name = 'Snacks' WHERE id = 'grp_breakfast'").run();
  assert.equal(groupDisplayName(db, row(), "en"), "Snacks");
  assert.equal(groupDisplayName(db, row(), "de"), "Snacks");
});

test("slice 1: seed-name migration NULLs stored seed names, keeps renames, idempotent", () => {
  const db = openDb();
  // simulate a device persisted under the pre-003b schema, which stored
  // the English seed name in board_group.name
  db.prepare("UPDATE board_group SET name = 'Breakfast' WHERE id = 'grp_breakfast'").run();
  db.prepare("UPDATE board_group SET name = 'Yummy' WHERE id = 'grp_drinks'").run();
  migrateBuiltinGroupNames(db, catalog);
  const nameOf = (id) => db.prepare("SELECT name FROM board_group WHERE id = ?").all(id)[0].name;
  assert.equal(nameOf("grp_breakfast"), null);
  assert.equal(nameOf("grp_drinks"), "Yummy"); // a caregiver rename, not the seed
  migrateBuiltinGroupNames(db, catalog); // second run changes nothing
  assert.equal(nameOf("grp_breakfast"), null);
  assert.equal(nameOf("grp_drinks"), "Yummy");
  // and the nulled groups still display via group_label
  const food = db.prepare("SELECT id, name FROM board_group WHERE id = 'grp_breakfast'").all()[0];
  assert.equal(groupDisplayName(db, food, "en"), "Breakfast");
});

test("slice 1: the build rejects a group with no name for a shipped locale", () => {
  const withGroup = (g) => ({ ...seedTopics, groups: [...seedTopics.groups, g] });
  assert.throws(() => compile(withGroup({ key: "x", names: { de: "X" }, words: [] })), /no name for shipped locale "en"/);
  assert.throws(() => compile(withGroup({ key: "x", words: [] })), /per-locale map/);
});

test("the core coordinate map is untouched by every group operation", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  const assertCore = () => assert.deepEqual(snapshotCoreCells(db), before);

  const food = groupPage(db, "grp_breakfast", 0, "en")[0];
  moveItem(db, "grp_breakfast", "sense", food.item_id, 0, 13); // an empty Breakfast cell
  assertCore();
  const [a, b] = groupPage(db, "grp_breakfast", 0, "en");
  swapItems(db, "grp_breakfast", a, b);
  assertCore();
  swapGroups(db, "grp_breakfast", "grp_animals");
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
  moveGroup(db, "grp_breakfast", nextFreeIndexSlot(db));
  assertCore();
  importCatalog(db, catalog); // reconcile re-run
  assertCore();
});

function nextFreeIndexSlot(db) {
  const used = new Set(groupIndex(db).map((g) => g.index_slot));
  for (let s = 10; s < 60; s++) if (!used.has(s)) return s;
  throw new Error("no free index slot");
}

test("018 D5: a mixed group lays out in band order — fresh column per kind, filled top to bottom", () => {
  const db = openDb();
  const gid = createGroup(db, { name: "Breakfast" }).id;
  const [cookie, milk, bread, eat, no, more] =
    ["cookie", "milk", "bread", "eat", "no", "more"].map((w) => senseIdByText(db, w));

  placeItem(db, gid, "sense", cookie); // Yellow claims the first column
  placeItem(db, gid, "sense", milk);   // Yellow fills it top to bottom
  placeItem(db, gid, "sense", eat);    // Green starts a fresh column
  placeItem(db, gid, "sense", no);     // Red starts its own column
  placeItem(db, gid, "sense", bread);  // Yellow goes to ITS area's next
                                       // free spot — nothing else moves
  placeItem(db, gid, "sense", more);   // Blue lands between Green and Red

  const page = groupPage(db, gid, 0, "en");
  const at = (id) => page.find((r) => r.item_id === id)?.slot_index;
  assert.deepEqual(
    [cookie, milk, eat, no, bread, more].map(at),
    // Yellow · Green · Red · Blue — Red claimed col 4 before Blue
    // arrived, and stored cells never move (D5: stability over order).
    [2, 12, 3, 4, 22, 5],
    "each kind columnar in band order; late kinds don't shift earlier claims",
  );
});
