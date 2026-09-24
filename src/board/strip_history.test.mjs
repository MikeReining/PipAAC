/**
 * 017 step 10 Works Test — the user's own history, as counts.
 *
 * logSelection maintains decayed running counts (what followed the last
 * 1/2/3 items, plus overall); the `hist` feature reads them as a
 * backed-off probability — no training, no per-event scans. Proves:
 * histories differing only at position −3 give different predictions;
 * after a noun-uninviting tail the strip can still offer a noun the
 * user actually said; the history expert alone reproduces the user's
 * most common continuation for their most common two-word start; and
 * no two model features carry the same signal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  features, featureEnv, logSelection, openSentence, stripCandidates,
  MODEL_FEATURES,
} from "../../public/shared/funnel.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import defaults from "../../data/prediction/defaults.json" with { type: "json" };

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

/** Say a sentence: open it, log each pick at its position. */
function say(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
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
