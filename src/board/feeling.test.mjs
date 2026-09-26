/**
 * 025 slices 2–4 Works Test — the faces' data and the suggestion rule.
 *
 * § 3's doc cases, run on ids (never spelling): the last feeling word
 * lights its face iff the nearest people word before it is I or me.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expressiveOn, suggestedFeeling,
} from "../../public/shared/feeling.mjs";

const data = JSON.parse(readFileSync(
  join(import.meta.dirname, "../../data/catalog/feeling_voice.json"), "utf8"));

// The shipped ids the doc names — assert the data matches.
test("the feeling map names the doc's senses", () => {
  assert.equal(data.feelings.sns_0061, "happy");    // happy
  assert.equal(data.feelings.sns_0183, "happy");    // excited
  assert.equal(data.feelings.sns_0179, "sad");      // sad
  assert.equal(data.feelings.sns_0181, "angry");    // angry
  assert.equal(data.feelings.sns_0180, "angry");    // mad
  assert.equal(data.feelings.sns_0187, "angry");    // frustrated
  assert.deepEqual(data.self, ["sns_0001", "sns_0003"]); // I, me
});

// Lookup stubs: the shipped pronoun set and a couple of entities.
const PRONOUNS = new Set([
  "sns_0001", "sns_0002", "sns_0003", "sns_0004", "sns_0005", "sns_0006",
  "sns_0007", "sns_0008", "sns_0009", "sns_0010", "sns_0011", "sns_0012",
]);
const CATS = { ent_mama: "People, Family & Roles", ent_teddy: "Animals & Nature", ent_cup: "Food & Drink" };
const isPronoun = (id) => PRONOUNS.has(id);
const cat = (id) => CATS[id] ?? null;
const S = (id) => ({ kind: "sense", id });
const E = (id) => ({ kind: "entity", id });
const T = (text) => ({ kind: "typed", text });
const I = "sns_0001", ME = "sns_0003", HE = "sns_0006", AM = "sns_0050",
  HAPPY = "sns_0061", SAD = "sns_0179", MAD = "sns_0180", THINK = "sns_0400";

test("I'm happy / I am so sad / me mad light their faces", () => {
  assert.equal(suggestedFeeling([S(I), S(AM), S(HAPPY)], data, isPronoun, cat), "happy");
  assert.equal(suggestedFeeling([S(I), S(AM), S("sns_0120"), S(SAD)], data, isPronoun, cat), "sad");
  assert.equal(suggestedFeeling([S(ME), S(MAD)], data, isPronoun, cat), "angry");
});

test("he is happy / I think he is sad / happy alone don't light", () => {
  assert.equal(suggestedFeeling([S(HE), S(AM), S(HAPPY)], data, isPronoun, cat), null);
  assert.equal(suggestedFeeling([S(I), S(THINK), S(HE), S(AM), S(SAD)], data, isPronoun, cat), null);
  assert.equal(suggestedFeeling([S(HAPPY)], data, isPronoun, cat), null);
  assert.equal(suggestedFeeling([], data, isPronoun, cat), null);
});

test("an entity people-word blocks the light; a thing entity doesn't", () => {
  // Mama is happy — the nearest people word is Mama, not I/me.
  assert.equal(suggestedFeeling([E("ent_mama"), S(AM), S(HAPPY)], data, isPronoun, cat), null);
  assert.equal(suggestedFeeling([E("ent_teddy"), S(MAD)], data, isPronoun, cat), null);
  // i cup happy — the cup isn't a people word; the scan reaches I.
  assert.equal(suggestedFeeling([S(I), E("ent_cup"), S(HAPPY)], data, isPronoun, cat), "happy");
  // A typed word carries no id — it never counts as a people word.
  assert.equal(suggestedFeeling([S(I), T("blorf"), S(HAPPY)], data, isPronoun, cat), "happy");
});

test("the LAST feeling word wins when two appear", () => {
  // i happy sad — sad is last; the suggestion is sad's face.
  assert.equal(suggestedFeeling([S(I), S(HAPPY), S(SAD)], data, isPronoun, cat), "sad");
});

test("expressiveOn defaults on and honors the column", () => {
  const mk = (v) => ({
    prepare: () => ({ all: () => (v === undefined ? [] : [{ v }]) }),
  });
  assert.equal(expressiveOn(mk(1)), true);
  assert.equal(expressiveOn(mk(0)), false);
  assert.equal(expressiveOn(mk(undefined)), true); // missing row -> default
  assert.equal(expressiveOn({ prepare: () => { throw new Error("no column"); } }), true);
});
