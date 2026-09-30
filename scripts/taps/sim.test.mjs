/**
 * Tap simulator Works Test — the instrument proves itself before its
 * numbers mean anything:
 *   1. The shipped board's known path reproduces exactly:
 *      "i want to play puzzle" = 4 surface taps + folder + door + word = 7.
 *   2. Grammar help is free: the produced surface reads "puzzles".
 *   3. Multi-word lemmas are one tile ("my turn" = 1 word-tile).
 *   4. Determinism: the same scenario run twice is identical.
 *   5. autoReturn can only help under the oracle policy (≤ baseline).
 * The corpus is deliberately small and fixed; the numbers asserted are
 * path costs the code under test cannot influence — they are derived
 * from catalog cells, not from the sim's own claims.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { boardModel, runCorpus, catalog, cfg } from "./sim.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const corpus = [
  "i want to play puzzle",
  "my turn",
  "i like the dog",
  "more juice please",
  "go to park",
];

function fresh() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return { db, M: boardModel(db) };
}

test("baseline reproduces the hand-counted TouchChat comparison path", () => {
  const { db, M } = fresh();
  const run = runCorpus(db, M, corpus, cfg("baseline"));
  const row = run.per.find((p) => p.sent === "i want to play puzzle");
  assert.equal(row.taps, 7);
  assert.match(row.path, /F G:Play puzzle/); // folder + door + word = 3
  assert.match(row.produced, /puzzles/);     // grammar help plural, 0 taps
});

test("multi-word lemmas resolve to a single tile", () => {
  const { db, M } = fresh();
  const run = runCorpus(db, M, ["my turn"], cfg("baseline"));
  assert.equal(run.per[0].words, 1);
});

test("every buried fetch costs at least folder + door + word", () => {
  const { db, M } = fresh();
  const run = runCorpus(db, M, ["the"], cfg("baseline")); // 'the' lives in Little words
  assert.ok(run.per[0].taps >= 3, `the cost ${run.per[0].taps}`);
});

test("the run is deterministic", () => {
  const a = fresh();
  const b = fresh();
  const r1 = runCorpus(a.db, a.M, corpus, cfg("baseline"));
  const r2 = runCorpus(b.db, b.M, corpus, cfg("baseline"));
  assert.equal(r1.agg.taps, r2.agg.taps);
});

test("autoReturn never costs more than baseline under the oracle", () => {
  const a = fresh();
  const b = fresh();
  const base = runCorpus(a.db, a.M, corpus, cfg("baseline"));
  const ret = runCorpus(b.db, b.M, corpus, cfg("autoreturn"));
  assert.ok(ret.agg.taps <= base.agg.taps);
});
