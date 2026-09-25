/**
 * Smart bar v2 Works Test — the strip offers what followed the phrase
 * built so far, in her own history first.
 *
 * Proves: a spoken sentence trains phrase history and the strip then
 * offers its continuation (entities included — her names reach the bar
 * only through her own taps); a cleared bar trains nothing; an
 * un-evidenced state shows nothing; ranking never writes the
 * coordinate table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, snapshotCoreCells } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import {
  openSentence, closeSentence, logSelection,
  stripCandidates, STRIP_CAP,
} from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";
import { makeKids } from "./test_phrases.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const senseId = (word) =>
  catalog.senses.find(
    (s) =>
      catalog.labels.find((l) => l.sense_id === s.id && l.kind === "lemma")?.normalized_text === word,
  ).id;
const S = (word) => ({ kind: "sense", id: senseId(word) });

const NOW = Date.parse("2026-09-24T08:20:00"); // 8:20am — breakfast time

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

/** Say a sentence and speak it — only a spoken close trains history. */
function say(db, items, at) {
  const s = openSentence(db, at);
  items.forEach((it, i) =>
    logSelection(db, it.kind, it.id, at + i, { sentenceId: s, position: i }));
  closeSentence(db, s, at + items.length, "spoken");
}

test("her history: 'i want Cooper' twice offers Cooper after 'i want'", () => {
  const db = openDb();
  const cooper = addPersonalEntity(db, { spokenName: "Cooper" });
  const before = snapshotCoreCells(db);

  for (let i = 0; i < 2; i++) {
    say(db, [S("i"), S("want"), { kind: "entity", id: cooper.id }], NOW - 100000 - i * 100);
  }
  const shown = stripCandidates(db, [S("i"), S("want")], NOW, "en");
  assert.ok(shown.some((c) => c.kind === "entity" && c.id === cooper.id));
  assert.ok(shown.length <= STRIP_CAP);
  assert.deepEqual(snapshotCoreCells(db), before);
});

test("a cleared bar trains nothing", () => {
  const db = openDb();
  const cooper = addPersonalEntity(db, { spokenName: "Cooper" });
  for (let i = 0; i < 3; i++) {
    const s = openSentence(db, NOW - 100000 - i * 100);
    [S("i"), S("want"), { kind: "entity", id: cooper.id }].forEach((it, j) =>
      logSelection(db, it.kind, it.id, NOW - 100000 - i * 100 + j,
        { sentenceId: s, position: j }));
    closeSentence(db, s, NOW - 100000 - i * 100 + 10, "cleared");
  }
  const shown = stripCandidates(db, [S("i"), S("want")], NOW, "en");
  assert.ok(!shown.some((c) => c.kind === "entity" && c.id === cooper.id));
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM phrase_count").all()[0].n, 0,
    "cleared bars wrote phrase_count rows");
});

test("the open sentence never trains itself", () => {
  const db = openDb();
  // The open bar 'i want' was just typed — her empty history must not
  // echo the words it contains.
  const s = openSentence(db, NOW);
  [S("i"), S("want")].forEach((it, i) =>
    logSelection(db, it.kind, it.id, NOW + i, { sentenceId: s, position: i }));
  const shown = stripCandidates(db, [S("i"), S("want")], NOW, "en");
  assert.ok(!shown.some((c) => c.id === S("i").id || c.id === S("want").id));
});

test("children source cannot know her names — entities only come from her", () => {
  const db = openDb();
  addPersonalEntity(db, { spokenName: "Cooper" });
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { juice: 40 } },
  ]);
  const shown = stripCandidates(db, [S("i"), S("want")], NOW, "en", kids);
  assert.ok(!shown.some((c) => c.kind === "entity"));
});
