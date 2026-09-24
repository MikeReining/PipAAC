/**
 * 014 slice 3 Works Test — an adult moves a core word. The spec's own
 * test: "move `stop`, restart, update the catalog — `stop` is still
 * where the adult put it." The lie-prone layer is a move stored in a
 * shape a catalog regen could overwrite: this measures the *effective*
 * map (`coreCells` — the rows the renderer draws), the untouched
 * `core_cell` catalog rows, and op replay onto a second database.
 * The drag leg is `scripts/probes/core_move_probe.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import { coreCells, coreSlot, moveCore } from "../../public/shared/coremove.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;
const at = (db, slot, layout = "grid60") =>
  coreCells(db, layout, "en").find((c) => c.slot_index === slot)?.label;

test("swap: stop ↔ want, catalog rows untouched, override rows carry it", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const want = senseOf(db, "want");
  const stopAt = coreSlot(db, "grid60", stop);
  const wantAt = coreSlot(db, "grid60", want);

  const mv = moveCore(db, "grid60", stop, wantAt);
  assert.deepEqual(mv, { from: stopAt, swapped: want });
  // The rendered map moved, not the catalog.
  assert.equal(at(db, wantAt), "stop");
  assert.equal(at(db, stopAt), "want");
  assert.equal(db.prepare(
    "SELECT slot_index FROM core_cell WHERE layout = 'grid60' AND sense_id = ?",
  ).all(stop)[0].slot_index, stopAt, "core_cell row unchanged");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM core_override").all()[0].n, 2);
  assert.ok(listOps(db).some((o) => o.kind === "move_core"));
});

test("restart + catalog regen: the adult's placement survives", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const want = senseOf(db, "want");
  const wantAt = coreSlot(db, "grid60", want);
  const stopAt = coreSlot(db, "grid60", stop);
  moveCore(db, "grid60", stop, wantAt);

  // A real catalog update: the map doc changes (here, stop and want
  // trade places upstream), core_cell regenerates from scratch — the
  // adult's override is profile data and must still win.
  const md = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")
    .replace("I · you · want · like", "I · you · stop · like")
    .replace("little · stop", "little · want");
  const updated = buildCatalog(
    JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
    parseCoordinateMapMarkdown(md),
  );
  db.exec("DELETE FROM core_cell");
  importCatalog(db, updated);
  // The new default put stop back at its old slot and want at stop's —
  // the adult's map still shows stop where they put it.
  assert.equal(at(db, wantAt), "stop", "stop is still where the adult put it");
  assert.equal(at(db, stopAt), "want", "the swap's other half holds too");
  // And prove the catalog really did move: the regenerated default has
  // stop at want's old slot — the override is what kept the board still.
  assert.equal(db.prepare(
    "SELECT slot_index FROM core_cell WHERE layout = 'grid60' AND sense_id = ?",
  ).all(stop)[0].slot_index, wantAt, "the regenerated default moved");
});

test("move back to the catalog slot drops the override row", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const wantAt = coreSlot(db, "grid60", senseOf(db, "want"));
  const home = coreSlot(db, "grid60", stop);
  moveCore(db, "grid60", stop, wantAt);
  moveCore(db, "grid60", stop, home);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM core_override WHERE item_id = ?").all(stop)[0].n,
    0, "back at the catalog slot is canonical — no row",
  );
  assert.equal(at(db, home), "stop");
});

test("anchors and reserved slots refuse the drop", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  // grid15 slot 12 is the reserved ? family slot; grid90 slot 89 is Groups.
  assert.equal(moveCore(db, "grid15", stop, 12, { anchors: new Set([12]) }), null);
  assert.equal(moveCore(db, "grid90", stop, 89, { anchors: new Set([89]) }), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM core_override").all()[0].n, 0);
});

test("the move replays onto a second device through the op log", () => {
  const a = fresh();
  const b = fresh();
  const stop = senseOf(a, "stop");
  const wantAt = coreSlot(a, "grid60", senseOf(a, "want"));
  moveCore(a, "grid60", stop, wantAt);
  for (const op of listOps(a)) applyOp(b, op);
  assert.equal(at(b, wantAt), "stop");
  assert.equal(at(b, coreSlot(a, "grid60", senseOf(a, "want"))), "want");
});
