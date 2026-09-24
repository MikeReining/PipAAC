/**
 * 017 item 4 / step 24 item 1 Works Test — the "respond" boost (R17, R20).
 *
 * An adult taps words while modeling → those words get a one-turn `echo`
 * boost in the child's next strip. The turn lives in memory only: it
 * expires (~2 min) and is never written to any table — the learner's
 * event log holds the child's picks, never the partner's taps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  stripCandidates, stripScored, features, featureEnv, ECHO_WINDOW_MS,
  openSentence, closeSentence, logImpression, fillChosen,
} from "../../public/shared/funnel.mjs";
import { learnFromSentence, loadWeights } from "../../public/shared/learn.mjs";
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
const partner = (db, words, at = NOW) => ({
  items: new Set(words.map((w) => `sense:${senseId(db, w)}`)),
  at,
});
const model = (p = null) => ({
  weights: { ...defaults.weights.local_only },
  tau: defaults.tau,
  book: BOOK,
  partner: p,
});

test("modeled words ride the next strip: 'juice or milk?' shows both", () => {
  const db = fresh();
  const shown = stripCandidates(db, items(db, ["i", "want"]), NOW, "en",
    model(partner(db, ["juice", "milk"])))
    .map((c) => lemmaOf(db, c.id));
  assert.ok(shown.includes("juice") && shown.includes("milk"),
    `modeled words should be in the bar — got ${shown.join(", ")}`);
});

test("a modeled word with no other support still shows (echo is support)", () => {
  const db = fresh();
  // 'waffle' has no book mass after 'i want' and no history — the echo
  // feature alone puts it in the bar.
  const shown = stripCandidates(db, items(db, ["i", "want"]), NOW, "en",
    model(partner(db, ["waffle"])))
    .map((c) => lemmaOf(db, c.id));
  assert.ok(shown.includes("waffle"),
    `an echoed word should appear even with no other signal — got ${shown.join(", ")}`);
});

test("the echo is recorded on the candidate (learn can fit the weight)", () => {
  const db = fresh();
  const p = partner(db, ["juice"]);
  const env = featureEnv(db, items(db, ["i", "want"]), NOW, "en", null, BOOK, p);
  const x = features(db, { kind: "sense", id: senseId(db, "juice") }, env);
  assert.equal(x.echo, 1);
  const x2 = features(db, { kind: "sense", id: senseId(db, "milk") }, env);
  assert.equal(x2.echo, 0, "an un-modeled word carries echo 0");
});

test("an expired turn boosts nothing", () => {
  const db = fresh();
  const stale = partner(db, ["waffle"], NOW - ECHO_WINDOW_MS - 1);
  const shown = stripCandidates(db, items(db, ["i", "want"]), NOW, "en",
    model(stale)).map((c) => lemmaOf(db, c.id));
  assert.ok(!shown.includes("waffle"),
    `a stale turn still boosted 'waffle': ${shown.join(", ")}`);
});

test("never stored: partner words write nothing to the learner's log", () => {
  const db = fresh();
  stripCandidates(db, items(db, ["i", "want"]), NOW, "en",
    model(partner(db, ["juice", "milk"])));
  stripScored(db, items(db, ["i", "want"]), NOW, "en",
    model(partner(db, ["waffle"])));
  const n = db.prepare("SELECT COUNT(*) AS n FROM learner_event_log").all()[0].n;
  assert.equal(n, 0, "partner taps must never land in learner_event_log");
  const h = db.prepare("SELECT COUNT(*) AS n FROM history_count").all()[0].n;
  assert.equal(h, 0, "partner taps must never land in history_count");
});

test("a user who never echoes loses the boost: echo weight decays", () => {
  const db = fresh();
  const juice = senseId(db, "juice");
  const milk = senseId(db, "milk");
  const waffle = senseId(db, "waffle");
  // 50 moments where an echoed word was offered and the child picked
  // something else every time — the learned weight must leave the seed.
  for (let i = 0; i < 50; i++) {
    const sid = openSentence(db, NOW + i * 60000);
    logImpression(db, {
      sentenceId: sid, position: 0, shownAt: NOW + i * 60000 + 1,
      candidates: [
        { kind: "sense", id: juice, x: { echo: 1, book: 0.1 }, s: 8.8, p: 0.6 },
        { kind: "sense", id: milk, x: { book: 0.1 }, s: 2, p: 0.3 },
        { kind: "sense", id: waffle, x: { book: 0.05 }, s: 1, p: 0.1 },
      ],
      shown: ["sense:" + juice, "sense:" + milk, "sense:" + waffle],
      pNone: 0.1, weightSet: "local_only",
      weightsLocal: { w: defaults.weights.local_only, tau: defaults.tau, ver: "test", seen: 0 },
      shortlistCap: 3,
    });
    // The child picks the un-echoed word every time.
    fillChosen(db, sid, { kind: "sense", id: milk, source: "grid" });
    closeSentence(db, sid, NOW + i * 60000 + 2, "spoken");
    learnFromSentence(db, sid, catalog.prediction);
  }
  const learned = loadWeights(db, catalog.prediction).weights.echo;
  console.log(`  learned echo after 50 non-echo moments: ${learned.toFixed(2)} (seed ${defaults.weights.local_only.echo})`);
  assert.ok(learned < defaults.weights.local_only.echo / 2,
    `echo weight ${learned} should have decayed well below the seed ${defaults.weights.local_only.echo}`);
});
