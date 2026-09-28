/**
 * 009 slice 2 Works Test (board half) — home-screen Edit mode.
 * Removal never reflows: the slot stays empty, nothing else moves.
 * Assertions measure group_cell rows, not the UI's report.
 *
 * Proves: × removal leaves every other row byte-identical and Undo
 * restores the exact slot (including reverting the never-orphan landing
 * in My Words); an add into a tapped empty slot lands there and nowhere
 * else; a swap touches exactly two rows; the core map never moves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import {
  createGroup,
  placeItem,
  removeItemUndoable,
  swapItems,
} from "../../public/shared/groups.mjs";
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

const cells = (db, groupId) =>
  db
    .prepare(
      "SELECT item_kind, item_id, page, slot_index FROM group_cell WHERE group_id = ? ORDER BY page, slot_index",
    )
    .all(groupId);

test("× removal reflows nothing; Undo restores the exact slot", () => {
  const db = openDb();
  const { id: gid } = createGroup(db, { name: "Park" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_a', 'Rex', NULL, NULL, NULL), ('ent_b', 'Nana', NULL, NULL, NULL), ('ent_c', 'Coop', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_a"); // slot 2
  placeItem(db, gid, "entity", "ent_b"); // slot 3
  placeItem(db, gid, "entity", "ent_c"); // slot 4

  const before = cells(db, gid);
  const { undo } = removeItemUndoable(db, gid, "entity", "ent_b");
  const after = cells(db, gid);
  // slot 3 is empty; every other row byte-identical
  assert.equal(after.length, before.length - 1);
  assert.deepEqual(after, before.filter((r) => r.item_id !== "ent_b"));

  undo();
  assert.deepEqual(cells(db, gid), before);
});

test("undo reverts the never-orphan landing in My Words", () => {
  const db = openDb();
  const { id: gid } = createGroup(db, { name: "Park" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_solo', 'Rex', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_solo"); // its only group

  const { undo } = removeItemUndoable(db, gid, "entity", "ent_solo");
  // never-orphan fired: he is in My Words now
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id='grp_my_words' AND item_id='ent_solo'").all()[0].n,
    1,
  );
  undo();
  // restored to the original group, and the auto-landing is gone
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id=? AND item_id='ent_solo'").all(gid)[0].n,
    1,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM group_cell WHERE group_id='grp_my_words' AND item_id='ent_solo'").all()[0].n,
    0,
  );
});

test("tap an empty slot, add there: the word lands at that slot and nothing else moves", () => {
  const db = openDb();
  const { id: gid } = createGroup(db, { name: "Park" });
  const cup = db
    .prepare(
      `SELECT sense_id FROM label WHERE normalized_text='cup' AND kind='lemma' AND status='approved' AND locale='en'`,
    )
    .all()[0].sense_id;
  const before = cells(db, gid);
  const cell = placeItem(db, gid, "sense", cup, { page: 0, slot_index: 14 });
  assert.deepEqual(cell, { page: 0, slot_index: 14 });
  const after = cells(db, gid);
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(
    after.filter((r) => r.item_id !== cup),
    before,
  );
  // an occupied target refuses — the picker only offers empty slots
  const plate = db
    .prepare(
      `SELECT sense_id FROM label WHERE normalized_text='plate' AND kind='lemma' AND status='approved' AND locale='en'`,
    )
    .all()[0].sense_id;
  assert.throws(() => placeItem(db, gid, "sense", plate, { page: 0, slot_index: 14 }), /occupied/);
});

test("swap touches exactly the two rows", () => {
  const db = openDb();
  const before = cells(db, "grp_breakfast");
  const [a, b] = [before[0], before[10]];
  swapItems(db, "grp_breakfast", a, b);
  const after = cells(db, "grp_breakfast");
  assert.equal(after.length, before.length);
  const diff = before.filter(
    (r) =>
      !after.some(
        (x) =>
          x.item_id === r.item_id && x.page === r.page && x.slot_index === r.slot_index,
      ),
  );
  assert.deepEqual(diff.map((r) => r.item_id).sort(), [a.item_id, b.item_id].sort());
});

test("edit gestures never touch the core map", () => {
  const db = openDb();
  const before = snapshotCoreCells(db);
  const { id: gid } = createGroup(db, { name: "Park" });
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_a', 'Rex', NULL, NULL, NULL)",
  ).run();
  placeItem(db, gid, "entity", "ent_a", { page: 0, slot_index: 14 });
  const { undo } = removeItemUndoable(db, gid, "entity", "ent_a");
  undo();
  const rows = cells(db, "grp_breakfast");
  swapItems(db, "grp_breakfast", rows[0], rows[1]);
  assert.deepEqual(snapshotCoreCells(db), before);
});
