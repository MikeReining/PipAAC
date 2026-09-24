/**
 * 014 slice 11 Works Test — the family's person stands in for the
 * catalog word it represents in prediction (§ 7a ruling 4): when the
 * book ranks `mom`, the bar shows Mama's photo and speaks her name in
 * `mom`'s place, at `mom`'s score. The lie-prone layer is the mapping —
 * a stand-in that survives a rename or a retired person would speak the
 * wrong name. This measures `entityForSense` against real enrichment
 * rows and the real supersede triggers; the stripCards substitution is
 * one if-statement on top (public/board.js stripCards).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity, entityForSense, renameEntity, retireEntity } from "../../public/shared/groups.mjs";
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
const mom = (db) =>
  db.prepare("SELECT sense_id FROM label WHERE text = 'mom' AND locale = 'en' AND status = 'approved'")
    .all()[0]?.sense_id;
const enrich = (db, entityId, senseId, status = "ready", id = `enr_${Math.random().toString(36).slice(2)}`) =>
  db.prepare(
    `INSERT INTO entity_enrichment (id, entity_id, sense_suggestion, model, prompt_version, status)
     VALUES (?, ?, ?, 'test', 'v0', ?)`,
  ).run(id, entityId, senseId, status);

test("a ready stand-in maps the person to the word", () => {
  const db = fresh();
  const momId = mom(db);
  assert.ok(momId, "mom is in the catalog");
  const { id: mama } = createEntity(db, { name: "Mama" });
  enrich(db, mama, momId);
  const hit = entityForSense(db, momId);
  assert.equal(hit.id, mama);
  assert.equal(hit.spoken_name, "Mama");
  // An unmapped word stands for itself — no stand-in.
  assert.equal(entityForSense(db, "sns_does_not_exist"), null);
});

test("retired and superseded stand-ins never show", () => {
  const db = fresh();
  const momId = mom(db);
  const { id: mama } = createEntity(db, { name: "Mama" });
  enrich(db, mama, momId);
  retireEntity(db, mama);
  assert.equal(entityForSense(db, momId), null, "a retired person stands for nothing");
});

test("a rename supersedes the suggestion — the old name can't keep standing in", () => {
  const db = fresh();
  const momId = mom(db);
  const { id: mama } = createEntity(db, { name: "Mama" });
  enrich(db, mama, momId);
  renameEntity(db, mama, "Nana");
  assert.equal(entityForSense(db, momId), null);
});

test("the latest ready row wins", () => {
  const db = fresh();
  const momId = mom(db);
  const { id: a } = createEntity(db, { name: "Mama" });
  const { id: b } = createEntity(db, { name: "Nana" });
  enrich(db, a, momId, "ready", "enr_old");
  enrich(db, b, momId, "ready", "enr_new");
  assert.equal(entityForSense(db, momId)?.id, b);
});
