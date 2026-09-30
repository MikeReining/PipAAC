/** The wand scorer — the instrument that can't be gamed. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { contentStems, scoreCell, stemVariants, tokenize } from "./scorer.mjs";

test("stemVariants: irregulars, suffixes, consonant doubling, silent e", () => {
  assert.ok(stemVariants("went").has("go"));
  assert.ok(stemVariants("going").has("go"));
  assert.ok(stemVariants("running").has("run"));
  assert.ok(stemVariants("hoped").has("hope"));
  assert.ok(stemVariants("barking").has("bark"));
  assert.ok(stemVariants("cookies").has("cookie"));
  assert.ok(stemVariants("children").has("child"));
  assert.ok(stemVariants("wanted").has("want"));
});

test("scoreCell: abstention is a pass", () => {
  const s = scoreCell("go more", "go more");
  assert.equal(s.same, true);
  assert.equal(s.ok, true);
});

test("scoreCell: grammar-only transforms pass clean", () => {
  // reorder + glue
  assert.equal(scoreCell("more go", "Go more.").ok, true);
  // me -> I as subject, glue 'am'
  assert.equal(scoreCell("me hungry", "I am hungry.").ok, true);
  // tense forms don't count as added/dropped
  assert.equal(scoreCell("go park", "Went to the park.").ok, true);
  assert.equal(scoreCell("she sad", "She is sad.").ok, true);
  // subject-dropped question marker is free
  assert.equal(scoreCell("go park", "Go to the park?").ok, true);
});

test("scoreCell: fabrication, drops, added subjects flag", () => {
  const fab = scoreCell("go park", "I want to go to the park.");
  assert.deepEqual(fab.added, ["want"]);
  assert.deepEqual(fab.subject, ["me"]); // 'i' → the 'me' group
  assert.equal(fab.ok, false);

  const drop = scoreCell("want more juice", "I want juice.");
  assert.deepEqual(drop.dropped, ["more"]);
  assert.equal(drop.ok, false);

  const subj = scoreCell("eat cookie", "I eat a cookie.");
  assert.deepEqual(subj.subject, ["me"]);
  assert.equal(subj.ok, false);
});

test("scoreCell: pronoun case switch is allowed; a new pronoun flags", () => {
  assert.equal(scoreCell("me hungry", "I am hungry.").subject.length, 0);
  assert.equal(scoreCell("help me", "Help me.").ok, true);
  // 'you' appearing where she tapped no pronoun
  assert.deepEqual(scoreCell("come", "You come.").subject, ["you"]);
});

test("scoreCell: contractions split by tokenizer stay glue", () => {
  const s = scoreCell("no bath", "I don't want a bath.");
  assert.ok(s.added.includes("want"));   // 'want' is real fabrication
  assert.ok(!s.added.includes("don"));   // contraction fragments aren't
});

test("scoreCell: masked name tokens are content — splitting flags both ways", () => {
  const ok = scoreCell("person1 sad", "Person1 is sad.");
  assert.equal(ok.ok, true);
  const bad = scoreCell("person1 sad", "Person 1 is sad.");
  assert.deepEqual(bad.dropped, ["person1"]);
  assert.ok(bad.added.length > 0);
  assert.equal(bad.ok, false);
});

test("contentStems skips glue + pronouns", () => {
  const c = contentStems("I am going to the park");
  assert.deepEqual(c.map((x) => x.word), ["park"]);
});
