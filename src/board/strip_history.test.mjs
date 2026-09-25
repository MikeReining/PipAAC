/**
 * Smart bar v2 Works Test — the child's own phrase history.
 *
 * A spoken closeSentence writes one row per prefix of the sentence
 * (ctx "" and every longer prefix → what followed it) into
 * phrase_count, keyed by item ids. Proves: the ENTIRE phrase is the
 * context (histories differing only at position −3 answer
 * differently); the longest seen ending beats a shorter one; a
 * mid-sentence phrase never falls back to the empty phrase; the open
 * sentence and cleared bars never train; the 90-minute "now" window
 * selects by sentence start time of day; time-of-day comes from the
 * event's own stored offset.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  openSentence, closeSentence, logSelection,
  stripCandidates, stripRanked,
} from "../../public/shared/funnel.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import { makeKids } from "./test_phrases.mjs";

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
const shown = (db, words, kids = null, at = NOW) =>
  stripCandidates(db, items(db, words), at, "en", kids).map((c) => lemmaOf(db, c.id));

function say(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
  closeSentence(db, s, at + words.length, "spoken");
}
const rowsOf = (db) => db.prepare(
  "SELECT ctx, item_kind, item_id, n FROM phrase_count ORDER BY ctx, item_id",
).all();

test("the ENTIRE phrase is the context — a changed first word changes the answer", () => {
  const db = fresh();
  for (let i = 0; i < 3; i++) {
    say(db, ["the", "i", "want", "juice"], NOW - 100000 - i * 100);
    say(db, ["a", "i", "want", "milk"], NOW - 100000 - i * 100 - 50);
  }
  // The exact ending decides the lead; the 'i want' suffix fills the rest.
  assert.deepEqual(shown(db, ["the", "i", "want"]), ["juice", "milk"]);
  assert.deepEqual(shown(db, ["a", "i", "want"]), ["milk", "juice"]);
  assert.equal(
    lemmaOf(db, stripRanked(db, items(db, ["the", "i", "want"]), NOW, "en").ranked[0].id),
    "juice",
  );
});

test("phrase_count holds every ending, keyed by item ids", () => {
  const db = fresh();
  say(db, ["i", "want", "juice"], NOW - 1000);
  const [i, want, juice] = items(db, ["i", "want", "juice"]).map((x) => x.id);
  const rows = rowsOf(db);
  // Endings: "" -> i, "i" -> want, "i want" -> juice, "want" -> juice.
  assert.deepEqual(rows.map((r) => r.ctx), [
    "",
    `sense:${i}`,
    `sense:${i} sense:${want}`,
    `sense:${want}`,
  ]);
  assert.equal(rows[0].item_id, i);
  assert.equal(rows[1].item_id, want);
  assert.equal(rows[2].item_id, juice);
  assert.equal(rows[3].item_id, juice);
});

test("the longest seen ending leads; shorter endings only fill", () => {
  const db = fresh();
  // 'go play want juice' twice seeds ending 'play want' → juice, and
  // 'want' → juice too — 'more' comes only from the 'want' ending via
  // 'i want more'.
  for (let i = 0; i < 2; i++) say(db, ["go", "play", "want", "juice"], NOW - 100000 - i * 100);
  for (let i = 0; i < 2; i++) say(db, ["i", "want", "more"], NOW - 90000 - i * 100);
  const s = shown(db, ["go", "do", "play", "want"]);
  assert.deepEqual(s, ["juice", "more"],
    `longest ending 'play want' first, 'want' fills 'more' — got ${s.join(", ")}`);
});

test("a phrase that shares only its last item answers from that item", () => {
  const db = fresh();
  for (let i = 0; i < 2; i++) say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
  // 'go want' was never said — the 'want' ending still carries history.
  assert.deepEqual(shown(db, ["go", "want"]), ["juice"]);
});

test("relative frequency orders within an ending, not raw count", () => {
  const db = fresh();
  // 'milk' 3 taps after 'want' inside 'i want'; 'juice' 4 taps but
  // after 'want' inside 'go want' — different endings never mix.
  for (let i = 0; i < 3; i++) say(db, ["i", "want", "milk"], NOW - 100000 - i * 100);
  for (let i = 0; i < 4; i++) say(db, ["go", "want", "juice"], NOW - 90000 - i * 100);
  const { ranked } = stripRanked(db, items(db, ["go", "want"]), NOW, "en");
  // 'go want' exact: juice share 1.0 → leads even though 'want' alone
  // saw milk+juice mixed at 3+4.
  assert.equal(lemmaOf(db, ranked[0].id), "juice");
});

test("the open sentence is excluded from its own strip", () => {
  const db = fresh();
  const s = openSentence(db, NOW);
  ["i", "want"].forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), NOW + i, { sentenceId: s, position: i }));
  assert.deepEqual(shown(db, ["i", "want"]), [],
    "an open bar must not echo itself");
});

test("a cleared bar leaves phrase_count untouched", () => {
  const db = fresh();
  say(db, ["i", "want", "juice"], NOW - 100000);
  const before = rowsOf(db);
  const s = openSentence(db, NOW);
  ["go", "do", "play"].forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), NOW + i, { sentenceId: s, position: i }));
  closeSentence(db, s, NOW + 10, "cleared");
  assert.deepEqual(rowsOf(db), before);
});

test("the 90-minute window picks by sentence start time of day", () => {
  const db = fresh();
  // 'juice' at 8:00 (in the window at 8:20), 'milk' at 5:00 (outside).
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], Date.parse("2026-09-24T08:00:00") - i * 100);
    say(db, ["i", "want", "milk"], Date.parse("2026-09-24T05:00:00") - i * 100);
  }
  const { ranked, shown: got } = stripRanked(db, items(db, ["i", "want"]), NOW, "en");
  assert.equal(lemmaOf(db, ranked[0].id), "juice");
  assert.equal(ranked[0].src, "now");
  assert.equal(ranked[1].src, "all");
  assert.deepEqual(got.map((c) => lemmaOf(db, c.id)), ["juice", "milk"]);
});

test("any day counts: yesterday's sentence at this hour is 'now'", () => {
  const db = fresh();
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], Date.parse("2026-09-23T08:10:00") - i * 100);
  }
  const { ranked } = stripRanked(db, items(db, ["i", "want"]), NOW, "en");
  assert.equal(ranked[0].src, "now",
    "same time of day yesterday belongs to the now table");
});

test("the window edge: 90 minutes in, 91 out", () => {
  const db = fresh();
  const inEdge = Date.parse("2026-09-24T06:51:00"); // 89 min before 8:20
  const outEdge = Date.parse("2026-09-24T06:49:00"); // 91 min before
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], inEdge - i * 100);
    say(db, ["i", "want", "milk"], outEdge - i * 100);
  }
  const { ranked } = stripRanked(db, items(db, ["i", "want"]), NOW, "en");
  assert.equal(ranked.find((c) => lemmaOf(db, c.id) === "juice")?.src, "now");
  assert.equal(ranked.find((c) => lemmaOf(db, c.id) === "milk")?.src, "all");
});

test("mid-sentence never falls back to the empty phrase", () => {
  const db = fresh();
  // Only openers in history: 'i' three times at position 0.
  for (let i = 0; i < 3; i++) say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
  // 'go red' was never said and shares no ending — nothing, not even 'i'.
  assert.deepEqual(shown(db, ["go", "red"]), [],
    "a non-empty phrase must not read the empty-phrase row");
});

test("entities reach the bar through her history only", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { juice: 100 } },
  ]);
  assert.deepEqual(
    stripCandidates(db, items(db, ["i", "want"]), NOW, "en", kids)
      .filter((c) => c.kind === "entity"),
    [],
  );
});

test("timezone: the window reads each sentence's own stored offset", () => {
  const db = fresh();
  // A sentence stamped with a different offset (the device traveled):
  // its local start minute is what the window compares, not UTC.
  const s = openSentence(db, NOW - 24 * 3600e3);
  db.prepare("UPDATE sentence SET tz_offset_min = -300 WHERE id = ?").run(s);
  for (let i = 0; i < 2; i++) {
    logSelection(db, "sense", senseId(db, i ? "want" : "i"),
      NOW - 24 * 3600e3 + i, { sentenceId: s, position: i });
  }
  logSelection(db, "sense", senseId(db, "juice"),
    NOW - 24 * 3600e3 + 2, { sentenceId: s, position: 2 });
  db.prepare(
    "UPDATE learner_event_log SET tz_offset_min = -300 WHERE sentence_id = ?",
  ).run(s);
  closeSentence(db, s, NOW - 24 * 3600e3 + 3, "spoken");
  say(db, ["i", "want", "juice"], NOW - 30 * 60000); // same shape, near now
  // The shifted sentence started at 03:20 local (-300) — far outside
  // the 8:20 window — so 'now' still holds just the local 8:20 repeat.
  const { ranked } = stripRanked(db, items(db, ["i", "want"]), NOW, "en");
  const juice = ranked.find((c) => lemmaOf(db, c.id) === "juice");
  assert.equal(juice.src, "now");
  assert.equal(juice.her >= 2, true);
});
