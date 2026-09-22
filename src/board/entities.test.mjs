/**
 * Phase 002 slice 2 Works Test — add Cooper, offline, one confirm.
 *
 * Proves: an entity saved from inside a sub-zone files into that zone; a
 * save with no zone context lands in My Words; the save changes neither
 * the sense count nor the coordinate table; it writes no edge/enrichment
 * rows and attempts no network call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import { addPersonalEntity, listEntities, MY_WORDS } from "./entities.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("offline save from a sub-zone files the entity there; parent corner files to My Words", () => {
  const db = openDb();

  // Network down: any fetch attempt would throw. The save must not need it.
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("network unavailable");
  };
  try {
    addPersonalEntity(db, {
      spokenName: "Cooper",
      photoKey: "fixture:cooper.png",
      category: "Animals & Nature",
    });
    addPersonalEntity(db, { spokenName: "Baba", photoKey: "fixture:baba.png" });
  } finally {
    globalThis.fetch = realFetch;
  }

  const animals = listEntities(db, "Animals & Nature");
  assert.equal(animals.length, 1);
  assert.equal(animals[0].spoken_name, "Cooper");
  assert.equal(animals[0].photo_key, "fixture:cooper.png");

  const mine = listEntities(db, MY_WORDS);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].spoken_name, "Baba");
});

test("the save moves nothing: sense count, coordinate table, enrichment rows", () => {
  const db = openDb();
  const cellsBefore = snapshotCoreCells(db);
  const sensesBefore = db.prepare("SELECT COUNT(*) AS n FROM sense").get().n;

  addPersonalEntity(db, {
    spokenName: "Cooper",
    photoKey: "fixture:cooper.png",
    category: "Animals & Nature",
  });

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sense").get().n, sensesBefore);
  assert.equal(sensesBefore, 599);
  assert.deepEqual(snapshotCoreCells(db), cellsBefore);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entity_enrichment").get().n, 0);

  // No edge table exists anywhere in the schema.
  const edgeTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%edge%'")
    .all();
  assert.deepEqual(edgeTables, []);
});

test("entity id is prefixed and unique per save", () => {
  const db = openDb();
  const a = addPersonalEntity(db, { spokenName: "Cooper" });
  const b = addPersonalEntity(db, { spokenName: "Cooper" });
  assert.match(a.id, /^ent_[0-9a-f]{32}$/);
  assert.notEqual(a.id, b.id);
});
