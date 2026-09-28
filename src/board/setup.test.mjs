/**
 * 009 slice 11 Works Test — "Tell us about their world" (Word_Library
 * § 5.6). The lie-prone layer is the wizard filing into whatever group
 * it is pointed at, so this measures SETUP_STEPS plus the real write
 * owners: People seats mom/dad and joins People; Pets lands in Animals;
 * Favorite foods lands in Snack (026/027 retired the Food door); Places
 * lands in Going out. A skipped step writes nothing, and no list step
 * ever touches the core map.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyPasteRows, resolvePasteRows } from "../../public/shared/bulk.mjs";
import { applySetupPeople, SETUP_STEPS, stepGroup } from "../../public/shared/setup.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const categoryOf = (gid) => catalog.groups.find((g) => g.id === gid)?.category ?? null;

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const coreMap = (db) =>
  JSON.stringify(db.prepare(
    "SELECT layout, slot_index, sense_id FROM core_cell ORDER BY layout, slot_index").all());
const groupItems = (db, gid) => db.prepare(
  `SELECT gc.item_kind AS kind, gc.item_id AS id,
          COALESCE(e.spoken_name, l.text) AS label
   FROM group_cell gc
   LEFT JOIN personal_entity e ON e.id = gc.item_id AND gc.item_kind = 'entity'
   LEFT JOIN label l ON l.sense_id = gc.item_id AND gc.item_kind = 'sense'
     AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
   WHERE gc.group_id = ? ORDER BY gc.slot_index`).all(gid);

test("setup steps file into their built-in groups", () => {
  assert.equal(stepGroup("people"), "grp_people");
  assert.equal(stepGroup("pets"), "grp_animals");
  assert.equal(stepGroup("places"), "grp_going_out");
  // 026/027 retired the Food door — favorites file into Snack.
  assert.equal(stepGroup("foods"), "grp_snack");
  assert.ok(catalog.groups.every((g) => g.id !== "grp_food"),
    "no Food group exists to file into");
});

test("People: named people seat at mom/dad and join the People group; photo drafts too", () => {
  const db = openDb();
  const res = applySetupPeople(db, {
    names: ["Mom", "Dad", "Nana"],
    drafts: [{ name: "Aunt Jo", photoKey: "blob:auntjo" }, { name: "" }],
    locale: "en",
    category: categoryOf("grp_people"),
  });
  assert.equal(res.people, 3);
  assert.equal(res.photos, 1, "the blank-named draft is skipped");

  // 018 D1: the first two entities sit where mom/dad sat, on every
  // layout that has those cells.
  const momDad = db.prepare(
    `SELECT cc.layout, cc.slot_index FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE l.text IN ('mom', 'dad')`).all();
  for (const s of momDad) {
    const occ = db.prepare(
      "SELECT item_kind FROM core_override WHERE layout = ? AND slot_index = ?",
    ).all(s.layout, s.slot_index);
    assert.equal(occ.length, 1, `an entity sits at ${s.layout}:${s.slot_index}`);
  }

  const people = groupItems(db, "grp_people").map((r) => r.label);
  for (const n of ["Mom", "Dad", "Nana", "Aunt Jo"]) {
    assert.ok(people.includes(n), `${n} filed into People`);
  }
});

test("Pets, foods and places: library words resolve, new names become entities", () => {
  const db = openDb();
  const coreBefore = coreMap(db);

  const pets = resolvePasteRows(db, "Buddy\ndog\nBuddy\n", {
    groupId: stepGroup("pets"), locale: "en",
  });
  assert.equal(pets.length, 2, "the duplicate Buddy collapses");
  applyPasteRows(db, pets, { groupId: stepGroup("pets"), category: categoryOf(stepGroup("pets")) });
  const animals = groupItems(db, "grp_animals").map((r) => r.label);
  assert.ok(animals.includes("Buddy"), "Buddy is a new entity in Animals");
  assert.ok(animals.includes("dog"), "dog is a library sense in Animals");
  assert.equal(animals.filter((l) => l === "Buddy").length, 1);

  const foods = resolvePasteRows(db, "pizza\nmoon cheese", {
    groupId: stepGroup("foods"), locale: "en",
  });
  applyPasteRows(db, foods, { groupId: stepGroup("foods"), category: categoryOf(stepGroup("foods")) });
  const snack = groupItems(db, "grp_snack").map((r) => r.label);
  assert.ok(snack.includes("pizza"), "pizza filed into Snack");
  assert.ok(snack.includes("moon cheese"), "the undrawn favorite filed into Snack");

  const places = resolvePasteRows(db, "school\nGrandma's", {
    groupId: stepGroup("places"), locale: "en",
  });
  applyPasteRows(db, places, { groupId: stepGroup("places"), category: categoryOf(stepGroup("places")) });
  const going = groupItems(db, "grp_going_out").map((r) => r.label);
  assert.ok(going.includes("school"), "school filed into Going out");
  assert.ok(going.includes("Grandma's"), "Grandma's filed into Going out");

  // No list step touches the core map.
  assert.equal(coreMap(db), coreBefore);
});

test("a skipped step writes nothing", () => {
  const db = openDb();
  const counts = () => db.prepare(
    "SELECT COUNT(*) AS n FROM group_membership").all()[0].n
    + db.prepare("SELECT COUNT(*) AS n FROM personal_entity").all()[0].n;
  const before = counts();
  // Skip = no apply call at all; an empty box applies nothing either.
  const empty = resolvePasteRows(db, "  \n\n", { groupId: stepGroup("pets"), locale: "en" });
  assert.equal(empty.length, 0);
  applyPasteRows(db, empty, { groupId: stepGroup("pets") });
  applySetupPeople(db, { names: ["", "  "], drafts: [], locale: "en" });
  assert.equal(counts(), before, "skipped and empty steps write nothing");
});
