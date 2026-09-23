/**
 * 009 slice 7 Works Test — the iPad paste box (Word_Library § 5.4).
 * The lie-prone layer is a UI-side preview that drifts from what Apply
 * writes — so this measures the shared resolve→apply path on real rows:
 * Cooper (own word), apple (library), trampoline (undrawn → new,
 * needs a picture), Nana (new), a duplicate apple, a blank line.
 * Apply must create only Nana, place four rows in the target group, skip the
 * duplicate and the blank, and leave the core map byte-identical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import { applyPasteRows, applyPhotoDrafts, nameFromFile, resolvePasteRows } from "../../public/shared/bulk.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const GROUP = "grp_play"; // a seeded built-in group (apple is not placed here)

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const coreMap = (db) =>
  JSON.stringify(db.prepare(
    "SELECT layout, slot_index, sense_id FROM core_cell ORDER BY layout, slot_index").all());

test("paste preview → Add all: own, library, undrawn, new — no dupes, no blanks", () => {
  const db = openDb();
  addPersonalEntity(db, { spokenName: "Cooper", category: "Animals & Nature" });
  const coreBefore = coreMap(db);
  const before = db.prepare(
    "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ?", ).all(GROUP)[0].n;

  const rows = resolvePasteRows(db, "Cooper\napple\ntrampoline\nNana\napple\n\n", {
    groupId: GROUP, locale: "en",
  });

  // Preview: one row per unique non-blank line, in order.
  assert.equal(rows.length, 4, "the duplicate apple and the blank line collapse");
  const [cooper, apple, trampoline, nana] = rows;
  assert.equal(cooper.kind, "entity");
  assert.equal(cooper.label, "Cooper");
  assert.equal(apple.kind, "sense");
  assert.equal(trampoline.kind, "new");       // undrawn → new word…
  assert.equal(trampoline.needsPicture, true); // …flagged for a picture
  assert.equal(nana.kind, "new");

  const res = applyPasteRows(db, rows, { groupId: GROUP });
  assert.equal(res.created, 2, "trampoline and Nana are the only new entities");
  assert.equal(res.placed, 4);

  // No second Cooper: the entity table holds exactly one.
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name = 'Cooper'").all()[0].n,
    1);
  // Four placements into the target group: Cooper + apple + trampoline + Nana —
  // the duplicate apple and the blank line never landed.
  const after = db.prepare(
    "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = ?", ).all(GROUP)[0].n;
  assert.equal(after - before, 4);
  // The core map is byte-identical — bulk entry never touches it.
  assert.equal(coreMap(db), coreBefore);
});

test("many photos: named drafts save into the group, the blank one is flagged", () => {
  const db = openDb();
  const before = db.prepare(
    "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_people'").all()[0].n;

  // Four picked photos: three named, one left blank (the flagged row).
  const drafts = ["grandma.png", "grandpa.png", "uncle_ray.jpeg", "IMG_4471.HEIC"]
    .map((f, i) => ({
      name: i === 3 ? "" : nameFromFile(f),
      photoKey: i === 3 ? null : `blob:test${i}`,
    }));
  assert.equal(drafts[3].name, "", "the blank row carries no name — the UI flags it");

  const res = applyPhotoDrafts(db, drafts, { groupId: "grp_people" });
  assert.equal(res.saved, 3);
  assert.equal(res.blank, 1);

  const after = db.prepare(
    "SELECT COUNT(*) AS n FROM group_cell WHERE group_id = 'grp_people'").all()[0].n;
  assert.equal(after - before, 3);
  const rows = db.prepare(
    `SELECT e.spoken_name, e.photo_key FROM group_cell gc
     JOIN personal_entity e ON e.id = gc.item_id AND gc.item_kind = 'entity'
     WHERE gc.group_id = 'grp_people' AND e.photo_key IS NOT NULL`).all();
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.photo_key.startsWith("blob:")),
    "every saved row keeps its photo");
  assert.ok(!db.prepare(
    "SELECT 1 FROM personal_entity WHERE spoken_name = 'img 4471'").all().length,
    "the blank row never became a record");
});
