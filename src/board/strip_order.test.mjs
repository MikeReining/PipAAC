/**
 * 017 item 6 / R21 Works Test — Smart bar order (Motor_Grid § 2.2).
 *
 * Proves the shipped defaults against the real catalog + opening book:
 * board words rank in the bar (Show board words on), a likely negation
 * word pins to the last Predict slot, nothing is forced when no "no"
 * word is likely, both settings honor their off state, sentence help
 * keeps small words alive under one_step_up while their_words lets the
 * child's own history lead — and the same input paints the same slots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  stripCandidates, openSentence, logSelection,
} from "../../public/shared/funnel.mjs";
import { setSetting, setMask } from "../../public/shared/groups.mjs";
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
const model = (db) => {
  const lw = loadWeights(db, catalog.prediction);
  return { weights: lw.weights, tau: catalog.prediction.tau, book: BOOK };
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
const shown = (db, words) =>
  stripCandidates(db, items(db, words), NOW, "en", model(db)).map((c) => lemmaOf(db, c.id));
function say(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
}

test("'i': core words rank in the bar, a no-word pins the last slot", () => {
  const db = fresh();
  const s = shown(db, ["i"]);
  // The book's top 'i' continuations are all grid words — they lead.
  assert.equal(s[0], "want");
  assert.ok(s.includes("get") || s.includes("can"),
    `expected core words alongside 'want' — got ${s.join(", ")}`);
  // A negation inside the top 8 ('can't' or 'don't') takes the last slot.
  const last = s.at(-1);
  const neg = catalog.senses.find(
    (x) => x.negation && lemmaOf(db, x.id) === last);
  assert.ok(neg, `last slot should be a negation word — got '${last}'`);
});

test("'i am': 'not' takes the last slot", () => {
  const db = fresh();
  const s = shown(db, ["i", "am"]);
  assert.equal(s.at(-1), "not", `expected 'not' last — got ${s.join(", ")}`);
});

test("'i want': no negation is likely — nothing is forced", () => {
  const db = fresh();
  const s = shown(db, ["i", "want"]);
  const negLemmas = new Set(
    catalog.senses.filter((x) => x.negation).map((x) => lemmaOf(db, x.id)));
  assert.ok(!s.some((w) => negLemmas.has(w)),
    `a no-word appeared where none was likely: ${s.join(", ")}`);
});

test("Keep \"no\" off: plain probability order, nothing pinned", () => {
  const negLemmas = (db) => new Set(
    catalog.senses.filter((x) => x.negation).map((x) => lemmaOf(db, x.id)));
  // 'i': a negation sits inside the top 8 but outside the top 4 — the
  // slot rule pulls it in; with the rule off the bar is plain order.
  const on = shown(fresh(), ["i"]);
  assert.ok(negLemmas(fresh()).has(on.at(-1)),
    `slot-on sanity check: '${on.at(-1)}' should be a no-word`);
  const db = fresh();
  setSetting(db, "no_last_slot", 0);
  const off = shown(db, ["i"]);
  assert.ok(!off.some((w) => negLemmas(db).has(w)),
    `a no-word appeared with the slot rule off: ${off.join(", ")}`);
  assert.notDeepEqual(off, on, "the setting must change the painted order");
});

test("Show board words off: core words leave the bar", () => {
  const db = fresh();
  setSetting(db, "show_board_words", 0);
  const s = shown(db, ["i"]);
  const coreLemmas = new Set(
    catalog.senses.filter((x) => x.tier === "root_core").map((x) => lemmaOf(db, x.id)));
  assert.ok(!s.some((w) => coreLemmas.has(w)),
    `a board word showed with the setting off: ${s.join(", ")}`);
});

test("sentence help: one_step_up keeps small words; their_words lets history lead", () => {
  const db = fresh();
  for (let i = 0; i < 20; i++) say(db, ["i", "want", "waffle"], NOW - 100000 - i * 100);
  setSetting(db, "sentence_help", "one_step_up");
  const up = shown(db, ["i", "want"]);
  assert.ok(up.includes("waffle") && (up.includes("to") || up.includes("a")),
    `one_step_up should keep small words alongside 'waffle' — got ${up.join(", ")}`);
  setSetting(db, "sentence_help", "their_words");
  const theirs = shown(db, ["i", "want"]);
  assert.equal(theirs[0], "waffle",
    `their_words should let the child's own history lead — got ${theirs.join(", ")}`);
  // The knob itself is wired: the served book weight differs per mode.
  setSetting(db, "sentence_help", "one_step_up");
  const wUp = loadWeights(db, catalog.prediction).weights.book;
  setSetting(db, "sentence_help", "their_words");
  const wTheirs = loadWeights(db, catalog.prediction).weights.book;
  assert.ok(wUp > wTheirs,
    `one_step_up should serve a stronger book weight (${wUp} vs ${wTheirs})`);
});

test("deterministic: the same sentence start paints the same slots", () => {
  const a = shown(fresh(), ["i", "am"]);
  const b = shown(fresh(), ["i", "am"]);
  assert.deepEqual(a, b);
});

test("a hidden negation word is never pinned to the last slot", () => {
  const db = fresh();
  const notId = senseId(db, "not");
  setMask(db, notId, true);
  const s = shown(db, ["i", "am"]);
  assert.ok(!s.includes("not"), "a hidden word reached the bar");
});
