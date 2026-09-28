/**
 * Smart bar v2 — the group bar Works Test (group tap trigger,
 * 2026-09-24).
 *
 * Opening a group is intent: the bar narrows to that group's members
 * she has tapped at least once, her history only — no children table.
 * Order: phrase-conditioned now-window, phrase-conditioned any-time,
 * raw in-window tap counts, raw any-time tap counts. Proves: the phrase
 * already in the sentence leads the order inside a group; the
 * time-of-day tier precedes the any-time tier; a group with one used
 * word shows one tile; a never-used group is an empty bar; non-members
 * and never-tapped members never appear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  openSentence, closeSentence, logSelection, groupRanked,
} from "../../public/shared/funnel.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };

const NOW = Date.parse("2026-09-24T08:20:00");
const GROUP = "grp_test";
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

function say(db, words, at) {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, "sense", senseId(db, w), at + i, { sentenceId: s, position: i }));
  closeSentence(db, s, at + words.length, "spoken");
}
/** A custom group holding the given lemmas. */
function makeGroup(db, lemmas) {
  const slot = db.prepare(
    "SELECT COALESCE(MAX(index_slot), 9) + 1 AS s FROM board_group",
  ).all()[0].s;
  db.prepare(
    "INSERT INTO board_group (id, kind, name, index_slot) VALUES (?, 'custom', 'test', ?)",
  ).run(GROUP, slot);
  lemmas.forEach((w) =>
    db.prepare(
      "INSERT INTO group_membership (group_id, item_kind, item_id) VALUES (?, 'sense', ?)",
    ).run(GROUP, senseId(db, w)));
}
const shown = (db, words, group = GROUP, at = NOW) =>
  groupRanked(db, items(db, words), group, at).shown.map((c) => lemmaOf(db, c.id));

test("the phrase in the sentence leads inside the group", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "toast"]);
  // 'juice' after 'i want' beats 'milk' — even though milk was tapped
  // far more often overall (frequency alone would put it first).
  for (let i = 0; i < 3; i++) say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
  say(db, ["i", "want", "milk"], NOW - 95000);
  for (let i = 0; i < 8; i++) say(db, ["drink", "milk"], NOW - 50000 - i * 100);
  assert.deepEqual(shown(db, ["i", "want"]), ["juice", "milk"],
    "phrase-conditioned order beats raw frequency inside the group");
});

test("non-members and never-tapped members stay off", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "cookie"]); // cookie never tapped
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
    say(db, ["i", "want", "more"], NOW - 90000 - i * 100); // 'more' not a member
  }
  assert.deepEqual(shown(db, ["i", "want"]), ["juice"],
    "only tapped members — 'more' is off-group, 'cookie' was never used");
});

test("in-window frequency precedes any-time frequency", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "toast"]);
  // No phrase-conditioned evidence ('go' shares no ending). 'milk' has
  // 2 taps inside the window, 'juice' 3 taps but all outside it.
  for (let i = 0; i < 2; i++) say(db, ["drink", "milk"], Date.parse("2026-09-24T08:00:00") - i * 100);
  for (let i = 0; i < 3; i++) say(db, ["drink", "juice"], Date.parse("2026-09-24T05:00:00") - i * 100);
  assert.deepEqual(shown(db, ["go"]), ["milk", "juice"],
    "the 90-minute frequency tier outranks the all-time one");
});

test("one used word paints exactly one tile", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "toast"]);
  say(db, ["i", "want", "juice"], NOW - 100000);
  assert.deepEqual(shown(db, []), ["juice"]);
});

test("a group with no used words is an empty bar", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "toast"]);
  say(db, ["i", "want", "more"], NOW - 100000); // history exists, not in this group
  assert.deepEqual(shown(db, ["i", "want"]), []);
});

test("taps inside the group extend the phrase — the filter stays on", () => {
  const db = fresh();
  makeGroup(db, ["juice", "milk", "toast"]);
  for (let i = 0; i < 3; i++) say(db, ["i", "want", "juice"], NOW - 100000 - i * 100);
  for (let i = 0; i < 2; i++) say(db, ["i", "want", "milk"], NOW - 90000 - i * 100);
  // After 'i want', juice leads; extend the phrase to 'i want juice'
  // and the group bar still answers — nothing follows 'juice' in her
  // history, so the frequency tiers fill (juice 3 taps > milk 2).
  const second = shown(db, ["i", "want", "juice"]);
  assert.deepEqual(second, ["juice", "milk"],
    "the filter stays on while the group is open — used members by frequency");
});
