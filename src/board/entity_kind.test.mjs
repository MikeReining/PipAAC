/**
 * 018 slice 5 (D7) Works Test — a personal word's color is its kind,
 * never a color pick. The family names the kind once at add ("an
 * action", "a describing word"…) and the tile paints that band
 * everywhere it surfaces.
 *
 * The lie-prone layer is the render path silently hardcoding Yellow for
 * every entity. This measures what the shipped readers return:
 * coreCells (the home board), groupPage (a group page), itemBand
 * (banded placement), plus op replay onto a second database and
 * migrateSchema grafting the column onto a pre-D7 table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import { createEntity, groupPage, placeItem } from "../../public/shared/groups.mjs";
import { coreCells, placeOnBoard } from "../../public/shared/coremove.mjs";
import { migrateSchema } from "../../public/shared/migrate.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const schemaSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("an action-word entity paints Green on the board and in its group; an unpicked one stays Yellow", () => {
  const db = openDb();
  createEntity(db, { id: "ent_jump", name: "Jump", role: "Green" });
  createEntity(db, { id: "ent_spin", name: "Spin", role: "Green" });
  createEntity(db, { id: "ent_baba", name: "Baba" }); // family never picked → Yellow
  placeItem(db, "grp_my_words", "entity", "ent_baba");
  placeItem(db, "grp_my_words", "entity", "ent_jump");
  placeItem(db, "grp_my_words", "entity", "ent_spin");
  placeOnBoard(db, "grid60", "entity", "ent_jump", 0);

  // The home board — the same read the renderer paints.
  const cell = coreCells(db, "grid60", "en").find((c) => c.entity_id === "ent_jump");
  assert.equal(cell.fitzgerald_role, "Green");

  // The group page — banded placement consults the stored role.
  const items = groupPage(db, "grp_my_words", 0, "en");
  assert.equal(items.find((i) => i.item_id === "ent_jump").fitzgerald_role, "Green");
  assert.equal(items.find((i) => i.item_id === "ent_baba").fitzgerald_role, "Yellow");

  // Banded placement: the two Greens share the column Jump claimed,
  // stacked top-to-bottom — never beside the Yellow in its column.
  const slots = new Map(items.map((i) => [i.item_id, i.slot_index]));
  assert.equal(slots.get("ent_spin") - slots.get("ent_jump"), 10);
  assert.notEqual(slots.get("ent_baba") % 10, slots.get("ent_jump") % 10);
});

test("the create_entity op carries the kind — replay restores the color on a second device", () => {
  const src = openDb();
  createEntity(src, { id: "ent_wiggle", name: "Wiggle", role: "Green" });
  const op = listOps(src).find((o) => o.kind === "create_entity");

  const dst = openDb();
  applyOp(dst, op);

  assert.equal(
    dst.prepare("SELECT fitzgerald_role FROM personal_entity WHERE id = 'ent_wiggle'").get().fitzgerald_role,
    "Green",
  );
});

test("a pre-D7 entity gains the column at migrate and renders Yellow", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  db.exec("DROP TABLE personal_entity");
  db.exec(`CREATE TABLE personal_entity (
    id TEXT PRIMARY KEY,
    spoken_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    photo_key TEXT,
    added_at INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    hint TEXT
  )`);
  db.prepare("INSERT INTO personal_entity (id, spoken_name) VALUES ('ent_old', 'Old Dog')").run();

  migrateSchema(
    { exec: (s) => db.exec(s), all: (s, p = []) => db.prepare(s).all(...p), prepare: (s) => db.prepare(s) },
    schemaSql,
  );

  assert.equal(
    db.prepare("SELECT fitzgerald_role FROM personal_entity WHERE id = 'ent_old'").get().fitzgerald_role,
    null,
  );
  assert.throws(() =>
    db.prepare("UPDATE personal_entity SET fitzgerald_role = 'Orange' WHERE id = 'ent_old'").run());
});
