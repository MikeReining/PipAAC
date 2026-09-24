/**
 * 014 slice 10 Works Test — "put a person on a Core 15 cell, restart,
 * update the catalog — the person is still there, and the replaced core
 * word is still reachable from Groups." The lie-prone layer is a
 * placement stored where a catalog regen could overwrite it or a shape
 * the renderer can't draw: this measures the *effective* map
 * (`coreCells`), the untouched `core_cell` rows, the replaced word's
 * group membership, a real file-database reopen, and op replay onto a
 * second database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { cellSlot, coreCells, placeOnBoard, seatSetupPeople } from "../../public/shared/coremove.mjs";
import { migrateSchema } from "../../public/shared/migrate.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const build = () => buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const catalog = build();
const fresh = (path = ":memory:") => {
  const db = createDatabase(path);
  importCatalog(db, catalog);
  return db;
};
const at = (db, slot, layout = "grid15") =>
  coreCells(db, layout, "en").find((c) => c.slot_index === slot);

// A real Core 15 word that lives in a group — the spec's reachability
// leg needs one — away from the reserved ? family slot (12).
const victim = (db) =>
  db.prepare(
    `SELECT cc.sense_id, cc.slot_index, l.text AS label FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id AND l.kind = 'lemma' AND l.locale = 'en'
     WHERE cc.layout = 'grid15' AND cc.slot_index != 12
       AND EXISTS (SELECT 1 FROM group_cell gc
         WHERE gc.item_kind = 'sense' AND gc.item_id = cc.sense_id)
     LIMIT 1`,
  ).all()[0];

test("a person takes a Core 15 cell; the word leaves the board but not Groups", () => {
  const db = fresh();
  const v = victim(db);
  const { id: maya } = createEntity(db, { name: "Maya" });

  const mv = placeOnBoard(db, "grid15", "entity", maya, v.slot_index, { anchors: new Set([12]) });
  assert.ok(mv, "the placement happened");
  assert.equal(mv.from, null, "the person came from off-board");

  const cell = at(db, v.slot_index);
  assert.equal(cell.kind, "entity");
  assert.equal(cell.entity_id, maya);
  assert.equal(cell.label, "Maya");

  // The replaced word is off the home board — the app did not pick a
  // slot for it — and still reachable: its group_cell rows are intact.
  assert.equal(cellSlot(db, "grid15", "sense", v.sense_id), null);
  assert.ok(
    db.prepare("SELECT 1 AS x FROM group_cell WHERE item_kind = 'sense' AND item_id = ?")
      .all(v.sense_id)[0],
    `${v.label} is still in a group`,
  );
  assert.ok(listOps(db).some((o) => o.kind === "place_cell"));
});

test("restart + catalog regen: the person is still there", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-place-"));
  const path = join(dir, "board.sqlite");
  let db = fresh(path);
  const v = victim(db);
  const { id: maya } = createEntity(db, { name: "Maya" });
  placeOnBoard(db, "grid15", "entity", maya, v.slot_index);
  db.close();

  // Restart: reopen the same file — placement is data, not state.
  db = createDatabase(path);
  assert.equal(at(db, v.slot_index)?.entity_id, maya, "person survived the reopen");

  // A real catalog update: core_cell regenerates from scratch — the
  // adult's placement is profile data and still wins.
  db.exec("DELETE FROM core_cell");
  importCatalog(db, catalog);
  assert.equal(at(db, v.slot_index)?.entity_id, maya, "person survived the regen");
  assert.equal(
    db.prepare("SELECT slot_index FROM core_cell WHERE layout = 'grid15' AND sense_id = ?")
      .all(v.sense_id)[0]?.slot_index,
    v.slot_index,
    "the catalog still owns the word's default slot",
  );
  // And the word is still off the board — claim beats default.
  assert.equal(cellSlot(db, "grid15", "sense", v.sense_id), null);
  db.close();
});

test("the placement replays onto a second device through the op log", () => {
  const a = fresh();
  const b = fresh();
  const v = victim(a);
  createEntity(a, { id: "ent_maya", name: "Maya" });
  placeOnBoard(a, "grid15", "entity", "ent_maya", v.slot_index);

  for (const op of listOps(a)) applyOp(b, op);
  assert.equal(at(b, v.slot_index)?.entity_id, "ent_maya");
  assert.equal(cellSlot(b, "grid15", "sense", v.sense_id), null);
});

test("clearing a cell frees it; anchors refuse any item", () => {
  const db = fresh();
  const v = victim(db);
  const { id: maya } = createEntity(db, { name: "Maya" });
  placeOnBoard(db, "grid15", "entity", maya, v.slot_index);
  placeOnBoard(db, "grid15", "entity", maya, null);
  assert.equal(at(db, v.slot_index)?.sense_id, v.sense_id, "the word is back home");

  assert.equal(placeOnBoard(db, "grid15", "entity", maya, 12, { anchors: new Set([12]) }), null);
  assert.equal(at(db, 12), undefined, "the reserved slot took nothing");
});

test("nothing places itself: a fresh board has no override rows", () => {
  const db = fresh();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM core_override").all()[0].n, 0);
});

test("a pre-polymorphic override migrates: the adult's move is kept", () => {
  // A database persisted under the slice-3 shape — sense_id, no
  // item_kind — run through the real migrator.
  const db = fresh();
  const v = db.prepare(
    `SELECT cc.sense_id FROM core_cell cc WHERE cc.layout = 'grid60' LIMIT 2`,
  ).all();
  db.exec("DROP TABLE core_override");
  db.exec(`CREATE TABLE core_override (
    layout TEXT NOT NULL, sense_id TEXT NOT NULL, slot_index INTEGER NOT NULL,
    PRIMARY KEY (layout, sense_id))`);
  db.prepare("INSERT INTO core_override (layout, sense_id, slot_index) VALUES ('grid60', ?, 0)")
    .run(v[1].sense_id);

  const schemaSql = readFileSync(join(repoRoot, "src/board/schema.sql"), "utf8");
  const facade = {
    exec: (s) => db.exec(s),
    all: (s, p = []) => db.prepare(s).all(...p),
    prepare: (s) => db.prepare(s),
  };
  migrateSchema(facade, schemaSql);

  const row = db.prepare("SELECT * FROM core_override").all()[0];
  assert.equal(row.item_kind, "sense");
  assert.equal(row.item_id, v[1].sense_id);
  assert.equal(row.slot_index, 0);
  assert.equal(at(db, 0, "grid60")?.sense_id, v[1].sense_id, "the move still shows");
});

test("018 slice 3: setup's people take the mom/dad cells on every layout that has them", () => {
  const db = fresh();
  const mom = db.prepare(
    `SELECT sense_id FROM label WHERE text = 'mom' AND kind = 'lemma'
       AND status = 'approved' AND locale = 'en'`).all()[0].sense_id;
  const dad = db.prepare(
    `SELECT sense_id FROM label WHERE text = 'dad' AND kind = 'lemma'
       AND status = 'approved' AND locale = 'en'`).all()[0].sense_id;

  // Three names — the third stays an entity, seated nowhere.
  const ids = ["Maria", "Tom", "Grandma"].map((n) => createEntity(db, { name: n }).id);
  const placed = seatSetupPeople(db, ids, "en");

  // Both seats land on grid60 AND grid90 — the people follow the child
  // when density changes. grid15 has no mom/dad cells: untouched.
  assert.deepEqual(
    placed.map((p) => [p.id, p.layout, p.slot]),
    [[ids[0], "grid60", 30], [ids[0], "grid90", 30],
     [ids[1], "grid60", 31], [ids[1], "grid90", 31]]);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM core_override WHERE layout = 'grid15'").all()[0].n, 0);

  for (const layout of ["grid60", "grid90"]) {
    const cells = coreCells(db, layout, "en");
    assert.equal(cells.find((c) => c.slot_index === 30)?.entity_id, ids[0]);
    assert.equal(cells.find((c) => c.slot_index === 31)?.entity_id, ids[1]);
    // The mom/dad words left the board — but not their group.
    assert.equal(cellSlot(db, layout, "sense", mom), null);
    assert.equal(cellSlot(db, layout, "sense", dad), null);
    for (const sid of [mom, dad]) {
      assert.ok(db.prepare(
        "SELECT 1 AS x FROM group_cell WHERE item_kind = 'sense' AND item_id = ?")
        .all(sid)[0], "the displaced word stays reachable in Groups");
    }
  }
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM core_override WHERE item_id = ?").all(ids[2])[0].n, 0,
    "the third person has no seat");

  // The seating replays onto a second device through the op log.
  const b = fresh();
  for (const op of listOps(db)) applyOp(b, op);
  const cells = coreCells(b, "grid60", "en");
  assert.equal(cells.find((c) => c.slot_index === 30)?.entity_id, ids[0]);
  assert.equal(cells.find((c) => c.slot_index === 31)?.entity_id, ids[1]);
});
