/**
 * Smart bar v2 Works Test — merge order at the chosen ending.
 *
 * Proves: the first ending with a follower is the only ending that
 * speaks; sources merge her-now, her-any, children; dedupe keeps the
 * first source's copy; board words are not excluded; a hidden word
 * never paints; fewer than four tiles is the honest answer when
 * evidence is thin; the same input paints the same slots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  likelyGroups, stripCandidates, stripRanked, openSentence, closeSentence,
  logSelection,
} from "../../public/shared/funnel.mjs";
import { setMask } from "../../public/shared/groups.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import { makeKids } from "./test_phrases.mjs";

const NOW = Date.parse("2026-09-24T08:20:00"); // 8:20am

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

test("children paint in relative-frequency order, board words included", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i"], next: { am: 300, want: 200, go: 100, like: 50 } },
  ]);
  const s = shown(db, ["i"], kids);
  // 'am' folds onto 'is' in a real table (021 merge) — 'is', 'want',
  // 'go' are board cells and belong in the bar when they are likely
  // (v2 rule: no main-board exclusion).
  assert.deepEqual(s, ["is", "want", "go", "like"]);
});

test("source order: her-now before her-any before children", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { cookie: 100 } },
  ]);
  // 'milk' said twice at 5:10am — outside the 90-minute window at 8:20.
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "milk"], Date.parse("2026-09-24T05:10:00") - i * 100);
  }
  // 'juice' said twice at 8:00am — inside the window.
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], Date.parse("2026-09-24T08:00:00") - i * 100);
  }
  const s = shown(db, ["i", "want"], kids);
  assert.deepEqual(s, ["juice", "milk", "cookie"],
    `expected now, then any-time, then children — got ${s.join(", ")}`);
});

test("dedupe: the first source keeps the tile", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { juice: 100, milk: 90 } },
  ]);
  for (let i = 0; i < 2; i++) {
    say(db, ["i", "want", "juice"], Date.parse("2026-09-24T08:00:00") - i * 100);
  }
  const { ranked } = stripRanked(db, items(db, ["i", "want"]), NOW, "en", kids);
  const juiceHits = ranked.filter((c) => lemmaOf(db, c.id) === "juice");
  assert.equal(juiceHits.length, 1);
  assert.equal(juiceHits[0].src, "now", "her-now wins the tile over children");
  const s = shown(db, ["i", "want"], kids);
  assert.deepEqual(s, ["juice", "milk"]);
});

test("mid-sentence never falls back to the empty phrase", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: [], next: { i: 200, more: 100 } }, // openers only
  ]);
  // A phrase with no seen ending shows nothing — not the openers.
  const s = shown(db, ["i", "want"], kids);
  assert.deepEqual(s, []);
  // At sentence start the empty phrase IS the context — openers paint.
  assert.deepEqual(shown(db, [], kids), ["i", "more"]);
});

test("fewer than four tiles is honest output", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { juice: 60, milk: 40 } },
  ]);
  assert.deepEqual(shown(db, ["i", "want"], kids), ["juice", "milk"]);
});

test("a hidden word never reaches the bar", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "am"], next: { not: 100, happy: 60 } },
  ]);
  setMask(db, senseId(db, "not"), true);
  const s = shown(db, ["i", "am"], kids);
  assert.ok(!s.includes("not"), "a hidden word reached the bar");
  assert.deepEqual(s, ["happy"]);
});

test("deterministic: the same sentence start paints the same slots", () => {
  const kids = (db) => makeKids(db, [
    { ctx: ["i", "am"], next: { not: 100, happy: 60, cold: 40 } },
  ]);
  const a = shown(fresh(), ["i", "am"], kids(fresh()));
  const b = shown(fresh(), ["i", "am"], kids(fresh()));
  assert.deepEqual(a, b);
});

test("the likely group is the group of the top-ranked word", () => {
  const db = fresh();
  const kids = makeKids(db, [
    { ctx: ["i", "want"], next: { waffle: 100 } },
  ]);
  const { ranked } = stripRanked(db, items(db, ["i", "want"]), NOW, "en", kids);
  const groups = likelyGroups(db, items(db, ["i", "want"]), NOW, "en", kids);
  const top = ranked[0];
  const expected = db.prepare(
    "SELECT group_id FROM group_cell WHERE item_kind = ? AND item_id = ?",
  ).all(top.kind, top.id).map((r) => r.group_id);
  assert.deepEqual([...groups].sort(), expected.sort(),
    `the glow tracks the top candidate (${lemmaOf(db, top.id) ?? top.id})`);
  assert.ok(groups.size, "a real group glows, not an empty set");
});

test("an empty bar glows nothing", () => {
  const db = fresh();
  assert.equal(likelyGroups(db, items(db, ["i", "want"]), NOW, "en", null).size, 0);
});
