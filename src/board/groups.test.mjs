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
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import {
  addToGroups,
  catalogMatches,
  createEntity,
  createGroup,
  deleteGroup,
  geometryOf,
  groupDisplayName,
  groupIndex,
  groupPage,
  moveGroup,
  moveItem,
  pageCount,
  placeItem,
  removeItem,
  setGroupHidden,
  swapGroups,
  swapItems,
} from "../../public/shared/groups.mjs";
import { applyOp, drainOps, listOps, replayOps } from "../../public/shared/ops.mjs";
import { CLEAN_BREAK_VERSION, beforeCleanBreak } from "../../public/shared/migrate.mjs";
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
  assert.deepEqual(ids.slice(0, 6), ["grp_breakfast", "grp_lunch", "grp_dinner", "grp_snack", "grp_treats", "grp_my_words"]);
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

test("removal rules: any group loses a word to a hole, no My Words re-filing, built-ins hide rather than delete", () => {
  const db = openDb();
  const first = groupPage(db, "grp_breakfast", 0, "en")[0];
  removeItem(db, "grp_breakfast", "sense", first.item_id); // built-in: allowed now (027 § 3.4)
  assert.ok(!groupPage(db, "grp_breakfast", 0, "en").some((r) => r.item_id === first.item_id));
  assert.throws(() => deleteGroup(db, "grp_breakfast"), /custom/);
  assert.throws(() => deleteGroup(db, "grp_my_words"), /custom/);

  const { id: gid } = createGroup(db, { name: "Snack time" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_x', 'Rex', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_x");
  removeItem(db, gid, "entity", "ent_x"); // its only group
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_membership WHERE item_id = 'ent_x'").all()[0].n,
    0,
    "the last placement's removal files nothing anywhere",
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

test("027 § 3.4 placement: target, then seed cell, then another group's cell, then lowest free", () => {
  const db = openDb();
  const geom = geometryOf(db, "grid60");
  const milk = senseIdByText(db, "milk");
  const seedCell = catalog.groupCells.find((c) => c.group_id === "grp_breakfast" && c.layout === "grid60" && c.item_id === milk);
  // Re-added to its own group: its authored seed cell.
  removeItem(db, "grp_breakfast", "sense", milk);
  assert.deepEqual(placeItem(db, "grp_breakfast", "sense", milk), { page: seedCell.page, slot_index: seedCell.slot_index });
  // Added to a group that never held it: its cell in another group at this size.
  const { id: gid } = createGroup(db, { name: "Picnic" });
  assert.deepEqual(placeItem(db, gid, "sense", milk), { page: seedCell.page, slot_index: seedCell.slot_index });
  // A word whose preferred cell is taken: the lowest free cell, column by column.
  const water = senseIdByText(db, "water");
  const waterCell = catalog.groupCells.find((c) => c.group_id === "grp_drinks" && c.layout === "grid60" && c.item_id === water);
  const bob = placeItem(db, gid, "sense", senseIdByText(db, "zoo"), { page: waterCell.page, slot_index: waterCell.slot_index });
  assert.deepEqual(bob, { page: waterCell.page, slot_index: waterCell.slot_index });
  assert.deepEqual(placeItem(db, gid, "sense", water), { page: 0, slot_index: geom.content[0] });
  // An explicit target on a reserved cell or an occupied one refuses; nothing moved.
  const before = groupPage(db, gid, 0, "en").map((r) => [r.item_id, r.slot_index]);
  assert.throws(() => placeItem(db, gid, "sense", senseIdByText(db, "cup"), { page: 0, slot_index: 0 }), /reserved/);
  assert.throws(() => placeItem(db, gid, "sense", senseIdByText(db, "cup"), { page: 0, slot_index: geom.content[0] }), /occupied/);
  assert.deepEqual(groupPage(db, gid, 0, "en").map((r) => [r.item_id, r.slot_index]), before);
  // Filling a page adds the next page — never a reserved cell.
  const { id: full } = createGroup(db, { name: "Full" });
  const ids = db.prepare("SELECT id FROM sense ORDER BY id LIMIT ?").all(geom.content.length + 1).map((r) => r.id);
  for (const id of ids) placeItem(db, full, "sense", id);
  assert.equal(pageCount(db, full), 2);
  assert.deepEqual(groupPage(db, full, 1, "en").map((r) => r.slot_index), [geom.content[0]]);
});

test("027 A2: remove → reimport stays removed; a hidden group stays hidden; install markers hold", () => {
  const db = openDb();
  const choc = senseIdByText(db, "chocolate milk");
  removeItem(db, "grp_breakfast", "sense", choc);
  setGroupHidden(db, "grp_lunch", true);
  importCatalog(db, catalog); // an app restart / catalog reimport
  assert.ok(!groupPage(db, "grp_breakfast", 0, "en").some((r) => r.item_id === choc), "removal survives reimport");
  assert.ok(groupPage(db, "grp_drinks", 0, "en").some((r) => r.item_id === choc), "Drinks unchanged");
  assert.equal(groupIndex(db).find((g) => g.id === "grp_lunch").hidden, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_seed_install").all()[0].n,
    catalog.groups.length,
  );
  // Even an emptied group never re-seeds: every word out, reimport, still empty.
  for (const r of groupPage(db, "grp_fruit", 0, "en")) removeItem(db, "grp_fruit", r.item_kind, r.item_id);
  importCatalog(db, catalog);
  assert.deepEqual(groupPage(db, "grp_fruit", 0, "en"), []);
  assert.equal(listOps(db).filter((o) => o.kind === "seed_install").length, 1, "one install op, ever");
});

test("027 A2: a deleted custom group stays deleted through reimport and replay", () => {
  const db = openDb();
  const { id: gid } = createGroup(db, { name: "Park" });
  placeItem(db, gid, "sense", senseIdByText(db, "swing"));
  deleteGroup(db, gid);
  importCatalog(db, catalog);
  assert.ok(!groupIndex(db).some((g) => g.id === gid));
  const replica = openDb();
  replayOps(replica, listOps(db));
  assert.ok(!groupIndex(replica).some((g) => g.id === gid));
  assert.equal(replica.prepare("SELECT COUNT(*) AS n FROM group_membership WHERE group_id = ?").all(gid)[0].n, 0);
});

test("027 § 4: two devices install the seed offline — the first install the relay confirms wins", () => {
  const a = openDb();
  // b runs a newer catalog whose Treats seed has no cake.
  const cake = catalog.labels.find((l) => l.text === "cake" && l.kind === "lemma").sense_id;
  const newer = {
    ...catalog,
    groupMembers: catalog.groupMembers.filter((m) => !(m.group_id === "grp_treats" && m.item_id === cake)),
    groupCells: catalog.groupCells.filter((c) => !(c.group_id === "grp_treats" && c.item_id === cake)),
  };
  const b = createDatabase(":memory:");
  importCatalog(b, newer);
  assert.ok(!groupPage(b, "grp_treats", 0, "en").some((r) => r.item_id === cake));
  removeItem(a, "grp_snack", "sense", senseIdByText(a, "cup"));
  const opsA = listOps(a).map((o) => ({ ...o, device_id: "dev_a" }));
  const opsB = listOps(b).map((o) => ({ ...o, device_id: "dev_b" }));
  const relay = [...opsA, ...opsB].map((o, k) => ({ ...o, relay_seq: k + 1 }));
  drainOps(a, relay);
  drainOps(b, relay);
  const dump = (db, t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map((r) => JSON.stringify(r));
  for (const t of ["board_group", "group_membership", "group_cell", "group_seed_install"]) {
    assert.deepEqual(dump(b, t), dump(a, t), `${t} diverged`);
  }
  assert.ok(!groupPage(b, "grp_snack", 0, "en").some((r) => r.item_id === senseIdByText(b, "cup")));
  assert.ok(groupPage(b, "grp_treats", 0, "en").some((r) => r.item_id === cake), "a's install won on b");
});

test("027 A2: a fresh device restores from the relay and matches the original", () => {
  const a = openDb();
  const { id } = createEntity(a, { name: "Oat milk" });
  placeItem(a, "grp_breakfast", "entity", id);
  removeItem(a, "grp_breakfast", "sense", senseIdByText(a, "jam"));
  swapItems(a, "grp_lunch",
    { item_kind: "sense", item_id: senseIdByText(a, "pizza") },
    { item_kind: "sense", item_id: senseIdByText(a, "soup") });
  const relay = listOps(a).map((o, k) => ({ ...o, device_id: "dev_a", relay_seq: k + 1 }));
  const c = openDb(); // a new device: its own seed install is pending
  drainOps(c, relay);
  const dump = (db, t) => db.prepare(`SELECT * FROM ${t} ORDER BY group_id, item_kind, item_id${t === "group_cell" ? ", layout" : ""}`)
    .all().map((r) => JSON.stringify(r));
  for (const t of ["group_membership", "group_cell"]) assert.deepEqual(dump(c, t), dump(a, t), `${t} diverged`);
});

test("027 B9: Add to other boards is one op — skips existing, rolls back on failure, Undo removes only its adds", () => {
  const db = openDb();
  const { id } = createEntity(db, { name: "Oat milk" });
  placeItem(db, "grp_breakfast", "entity", id);
  const opsBefore = listOps(db).length;
  const { added, undo } = addToGroups(db, "entity", id, ["grp_lunch", "grp_snack", "grp_breakfast"]);
  assert.deepEqual(added, ["grp_lunch", "grp_snack"], "Breakfast already held it — skipped, never moved");
  assert.equal(listOps(db).length, opsBefore + 1);
  assert.equal(listOps(db).at(-1).kind, "add_to_groups");
  const where = () => db.prepare("SELECT group_id FROM group_membership WHERE item_id = ? ORDER BY group_id").all(id).map((r) => r.group_id);
  assert.deepEqual(where(), ["grp_breakfast", "grp_lunch", "grp_snack"]);
  // replay lands the same places
  const replica = openDb();
  replayOps(replica, listOps(db));
  const cellsOf = (x) => x.prepare("SELECT * FROM group_cell WHERE item_id = ? ORDER BY group_id").all(id).map((r) => JSON.stringify(r));
  assert.deepEqual(cellsOf(replica), cellsOf(db));
  undo();
  assert.deepEqual(where(), ["grp_breakfast"]);
  // a missing destination rolls the whole add back
  assert.throws(() => addToGroups(db, "entity", id, ["grp_lunch", "grp_nope"]), /no group/);
  assert.deepEqual(where(), ["grp_breakfast"]);
});

test("027 § 3.2: the index grows past slot 59 — nothing compacts", () => {
  const db = openDb();
  const made = [];
  for (let i = 0; i < 40; i++) made.push(createGroup(db, { name: `G${i}` }).index_slot);
  assert.ok(Math.max(...made) > 59);
  assert.equal(new Set(groupIndex(db).map((g) => g.index_slot)).size, groupIndex(db).length);
});

test("027 § 4: a group op recorded before 027 is skipped on every replica", () => {
  const db = openDb();
  const { id } = createEntity(db, { name: "Rex" });
  const before = db.prepare("SELECT COUNT(*) AS n FROM group_cell").all()[0].n;
  applyOp(db, { kind: "place_item", args: { groupId: "grp_people", kind: "entity", id, page: 0, slot_index: 2, added_at: 1 } });
  applyOp(db, { kind: "remove_item", args: { groupId: "grp_breakfast", kind: "sense", id: senseIdByText(db, "milk"), allowOrphan: false } });
  applyOp(db, { kind: "move_item", args: { groupId: "grp_breakfast", kind: "sense", id: senseIdByText(db, "milk"), page: 0, slot_index: 13 } });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_cell").all()[0].n, before);
  assert.ok(groupPage(db, "grp_breakfast", 0, "en").some((r) => r.item_id === senseIdByText(db, "milk")));
});

test("027 § 4: a saved database from before the clean break is discarded; a current one is kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-break-"));
  const bytesAt = (version) => {
    const path = join(dir, `v${version}.sqlite`);
    const d = new DatabaseSync(path);
    d.exec(`CREATE TABLE t (x); PRAGMA user_version = ${version};`);
    d.close();
    return readFileSync(path);
  };
  assert.equal(beforeCleanBreak(bytesAt(19)), true);
  assert.equal(beforeCleanBreak(bytesAt(CLEAN_BREAK_VERSION)), false);
  assert.equal(beforeCleanBreak(new Uint8Array(10)), true, "not a database — start fresh");
  // the shipped schema is at the break or later
  const fresh = join(dir, "fresh.sqlite");
  createDatabase(fresh).close();
  assert.equal(beforeCleanBreak(readFileSync(fresh)), false);
});
