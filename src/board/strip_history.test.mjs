/**
 * 017 step 10 Works Test — the user's own history, as counts.
 *
 * A spoken closeSentence writes decayed running counts (what followed
 * the last 1/2/3 items, plus overall); the `hist` feature reads them
 * as a Witten-Bell probability. Proves:
 * histories differing only at position −3 give different predictions;
 * after a noun-uninviting tail the strip can still offer a noun the
 * user actually said; the history expert alone reproduces the user's
 * most common continuation for their most common two-word start; and
 * no two model features carry the same signal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  features, featureEnv, logSelection, openSentence, closeSentence,
  stripCandidates, MODEL_FEATURES,
} from "../../public/shared/funnel.mjs";
import { loadWeights } from "../../public/shared/learn.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import defaults from "../../data/prediction/defaults.json" with { type: "json" };

const repoRoot = join(import.meta.dirname, "../..");
const BOOK = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/opening_book.en.json"), "utf8"));

const NOW = Date.parse("2026-09-24T08:20:00");
const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const senseId = (db, lemma) =>
  db.prepare(
    `SELECT sense_id AS id FROM label
     WHERE normalized_text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
  ).all(lemma)[0]?.id;
const lemmaOf = (db, id) =>
  db.prepare(
    `SELECT normalized_text AS t FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
  ).all(id)[0]?.t;
const items = (db, words) => words.map((w) => ({ kind: "sense", id: senseId(db, w) }));

/** Say a sentence and speak it — that close is what trains history. */
function say(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
  closeSentence(db, s, at + words.length, "spoken");
}

const histOf = (db, sentence, lemma, at = NOW) =>
  features(db, { kind: "sense", id: senseId(db, lemma) },
    featureEnv(db, sentence, at, "en")).hist;

test("histories differing only at position -3 give different predictions", () => {
  const db = fresh();
  for (let i = 0; i < 4; i++) {
    say(db, ["the", "i", "want", "juice"], NOW - 100000 - i * 100);
    say(db, ["a", "i", "want", "milk"], NOW - 100000 - i * 100 - 50);
  }
  const theIW = items(db, ["the", "i", "want"]);
  const aIW = items(db, ["a", "i", "want"]);
  assert.ok(
    histOf(db, theIW, "juice") > histOf(db, aIW, "juice"),
    "juice is likelier after 'the i want' than 'a i want' — the -3 item changed the answer",
  );
  assert.ok(
    histOf(db, aIW, "milk") > histOf(db, theIW, "milk"),
    "milk is likelier after 'a i want' than 'the i want'",
  );
});

test("after a noun-uninviting tail, the strip offers a noun the user said", () => {
  const db = fresh();
  for (let i = 0; i < 4; i++) say(db, ["red", "wagon"], NOW - 100000 - i * 100);
  const shown = stripCandidates(db, items(db, ["red"]), NOW, "en", {
    weights: { ...defaults.weights.local_only },
    tau: defaults.tau,
  }).map((c) => lemmaOf(db, c.id));
  assert.ok(shown.includes("wagon"),
    `history alone should surface 'wagon' after 'red' — got ${shown.join(", ")}`);
});

test("the history expert alone reproduces the most common continuation", () => {
  const db = fresh();
  // A day of use: 'i want X' is the common two-word start; juice is its
  // most common continuation.
  for (let i = 0; i < 6; i++) say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
  for (let i = 0; i < 2; i++) say(db, ["i", "want", "milk"], NOW - 100000 - i * 100 - 50);
  say(db, ["go", "outside"], NOW - 90000);
  const histOnly = {
    weights: {
      hist: defaults.weights.local_only.hist,
      none_bias: defaults.weights.local_only.none_bias,
    },
    tau: { tile: 0, none: 0.7 },
  };
  const shown = stripCandidates(db, items(db, ["i", "want"]), NOW, "en", histOnly)
    .map((c) => lemmaOf(db, c.id));
  assert.equal(shown[0], "juice",
    `hist alone should put the most common continuation first — got ${shown.join(", ")}`);
});

test("counts decay: an old pattern loses to a fresh one", () => {
  const db = fresh();
  say(db, ["i", "want", "milk"], NOW - 45 * 24 * 3600 * 1000); // 45 days ago
  for (let i = 0; i < 3; i++) say(db, ["i", "want", "juice"], NOW - 1000 - i * 10);
  assert.ok(
    histOf(db, items(db, ["i", "want"]), "juice") >
      histOf(db, items(db, ["i", "want"]), "milk"),
    "a 45-day-old pattern should not beat three fresh repeats",
  );
});

test("no two model features carry the same name", () => {
  assert.equal(new Set(MODEL_FEATURES).size, MODEL_FEATURES.length);
  assert.ok(!MODEL_FEATURES.includes("phrase") && !MODEL_FEATURES.includes("pair"),
    "phrase/pair are replaced by hist — the same count, not two features");
});

/* --- Open-sentence leak and broken backoff (founder 2026-09-24) ------
 * The strip is scored the way the board scores it: loadWeights (so
 * sentence-help doubles the book) and the shipped opening book.
 * History sentences are spoken. The sentence under test is only
 * logged — still open, the way board.js paints the strip. */

const shipped = (db) => {
  const lw = loadWeights(db, catalog.prediction);
  return { weights: lw.weights, tau: catalog.prediction.tau, book: BOOK };
};
const shownOf = (db, words) =>
  stripCandidates(db, items(db, words), NOW, "en", shipped(db))
    .map((c) => lemmaOf(db, c.id));
/** The open bar: logged, not spoken — the strip paints in this state. */
function typing(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
}
const HISTORY = [
  ["i", "want", "juice"],
  ["i", "want", "cookie"],
  ["want", "more"],
  ["want", "more"],
  ["want", "juice"],
];
function sayHistory(db) {
  let at = NOW - 100000;
  for (let i = 0; i < 6; i++) {
    for (const words of HISTORY) {
      say(db, words, at);
      at += 100;
    }
  }
}

test("fresh sentence go do play want does not offer those words back", () => {
  const db = fresh();
  typing(db, ["go", "do", "play", "want"], NOW);
  const shown = shownOf(db, ["go", "do", "play", "want"]);
  for (const w of ["go", "do", "play", "want"]) {
    assert.ok(!shown.includes(w), `'${w}' was offered back: ${shown.join(", ")}`);
  }
  // Book order is to, a, it, go. `go` was just tapped, and freq/recency
  // still read that event, so it drops a slot and `some` fills it.
  assert.deepEqual(shown, ["to", "a", "it", "some"]);
});

test("after real want-continuations, want is not offered and the followers are", () => {
  const db = fresh();
  sayHistory(db);
  typing(db, ["go", "do", "play", "want"], NOW);
  const shown = shownOf(db, ["go", "do", "play", "want"]);
  assert.ok(!shown.includes("want"), `want was offered: ${shown.join(", ")}`);
  for (const w of ["juice", "more", "cookie"]) {
    assert.ok(shown.includes(w), `'${w}' missing: ${shown.join(", ")}`);
  }
  assert.deepEqual(shown, ["juice", "more", "cookie", "to"]);
});

test("hist(juice | want) beats hist(want | want) when juice follows and want does not", () => {
  const db = fresh();
  sayHistory(db);
  const ctx = items(db, ["go", "do", "play", "want"]);
  const juice = histOf(db, ctx, "juice");
  const want = histOf(db, ctx, "want");
  assert.ok(juice > want,
    `hist(juice)=${juice.toFixed(3)} should beat hist(want)=${want.toFixed(3)}`);
});

test("a cleared sentence leaves history_count unchanged", () => {
  const db = fresh();
  const rows = () => db.prepare(
    "SELECT ctx, item_kind, item_id, n FROM history_count ORDER BY ctx, item_kind, item_id",
  ).all();
  const before = rows();
  const s = openSentence(db, NOW);
  ["go", "do", "play", "want"].forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), NOW + i, { sentenceId: s, position: i }));
  closeSentence(db, s, NOW + 10, "cleared");
  assert.deepEqual(rows(), before);
});
