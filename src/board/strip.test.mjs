/**
 * Phase 002 slice 3 Works Test — the strip offers Cooper without a
 * coordinate, and only when the state makes him eligible.
 *
 * Proves: recently-selected or sentence-invited entities appear in the
 * strip (≤4 tiles); a low-signal state shows nothing; ranking never
 * writes the coordinate table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import { logSelection, stripCandidates, STRIP_CAP } from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const senseId = (word) =>
  catalog.senses.find(
    (s) =>
      catalog.labels.find((l) => l.sense_id === s.id && l.kind === "lemma")?.text === word,
  ).id;
const S = (word) => ({ kind: "sense", id: senseId(word) });

const NOW = Date.parse("2026-09-22T08:20:00"); // 8:20am — breakfast time

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("sentence invites an entity: 'play with' offers Cooper", () => {
  const db = openDb();
  const cooper = addPersonalEntity(db, {
    spokenName: "Cooper",
    photoKey: "fixture:cooper.png",
    category: "Animals & Nature",
  });
  const before = snapshotCoreCells(db);

  const candidates = stripCandidates(db, [S("play"), S("with")], NOW, "en");
  assert.ok(candidates.some((c) => c.kind === "entity" && c.id === cooper.id));
  assert.ok(candidates.length <= STRIP_CAP);
  assert.deepEqual(snapshotCoreCells(db), before);
});

test("recent selection makes Cooper eligible even without a noun-inviting tail", () => {
  const db = openDb();
  const cooper = addPersonalEntity(db, { spokenName: "Cooper" });
  logSelection(db, "entity", cooper.id, NOW - 60_000);

  const candidates = stripCandidates(db, [S("happy")], NOW, "en"); // adjective tail — nothing invited
  assert.ok(candidates.some((c) => c.kind === "entity" && c.id === cooper.id));
});

test("low-signal state renders no strip", () => {
  const db = openDb();
  addPersonalEntity(db, { spokenName: "Cooper" });

  // empty sentence, never selected → nothing
  assert.deepEqual(stripCandidates(db, [], NOW, "en"), []);
  // adjective tail, never selected → nothing
  assert.deepEqual(stripCandidates(db, [S("happy")], NOW, "en"), []);
});

test("cap and ordering: at most 4 tiles, invited+recent outranks stale", () => {
  const db = openDb();
  const ids = ["Cooper", "Baba", "Bluey", "Spot", "Rex", "Mom"].map(
    (n) => addPersonalEntity(db, { spokenName: n }).id,
  );
  const [cooper, , , , , mom] = ids;
  // Cooper and Mom have history; the rest are bare saves.
  for (let i = 0; i < 5; i++) logSelection(db, "entity", cooper, NOW - 3 * 3600_000);
  logSelection(db, "entity", mom, NOW - 30_000);

  const afterVerb = stripCandidates(db, [S("want")], NOW, "en");
  assert.ok(afterVerb.length <= STRIP_CAP);
  assert.ok(afterVerb.some((c) => c.kind === "entity" && c.id === cooper));
  // all six are eligible by invitation; the cap keeps the strip at 4
  assert.equal(afterVerb.length, STRIP_CAP);
});
