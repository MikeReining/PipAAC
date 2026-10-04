/**
 * 023 §5.2 Works Test — names never leave the device.
 *
 * maskNames swaps entity names for PERSONn before the transform call;
 * unmask restores the stored spelling in whatever the model returns,
 * through reordering, possessives and lowercase placeholders.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskNames } from "../../public/shared/name_shield.mjs";

test("a name in the sentence becomes PERSON1 and comes home as itself", () => {
  const { masked, unmask } = maskNames("leo fall down", ["Leo", "Sarah"]);
  assert.equal(masked, "PERSON1 fall down");
  assert.equal(unmask("PERSON1 fell down."), "Leo fell down.");
});

test("only sentence names are masked; untouched names leak nothing", () => {
  const { masked } = maskNames("i want sarah", ["Leo", "Sarah", "Grandma Sue"]);
  assert.equal(masked, "i want PERSON1");
});

test("longest name wins and digits in the sentence stay digits", () => {
  const { masked } = maskNames("Grandma Sue has 3 dogs and Grandma came", ["Grandma", "Grandma Sue"]);
  assert.equal(masked, "PERSON1 has 3 dogs and PERSON2 came");
});

test("possessives and lowercase placeholders restore to the stored spelling", () => {
  const { masked, unmask } = maskNames("leo toy", ["Leo"]);
  assert.equal(masked, "PERSON1 toy");
  assert.equal(unmask("person1's toy is fast."), "Leo's toy is fast.");
});

test("a model that splits the token — 'Person 1' — still unmasks", () => {
  const { masked, unmask } = maskNames("leo sad", ["Leo"]);
  assert.equal(masked, "PERSON1 sad");
  assert.equal(unmask("Person 1 is sad."), "Leo is sad.");
  assert.equal(unmask("person 1 is sad."), "Leo is sad.");
});

test("no names in the sentence means identity masking and unmasking", () => {
  const { masked, unmask } = maskNames("i want a cookie", ["Leo"]);
  assert.equal(masked, "i want a cookie");
  assert.equal(unmask("I want a cookie."), "I want a cookie.");
});

/* 043 H — the boundary was ASCII \b: a name starting with a non-ASCII
 * letter after a space never matched, so it went upstream unmasked. */
test("non-ASCII names mask too — Ömer, José, multiword", () => {
  const a = maskNames("ömer wants juice", ["Ömer"]);
  assert.equal(a.masked, "PERSON1 wants juice");
  assert.equal(a.unmask("PERSON1 wants juice."), "Ömer wants juice.");

  const b = maskNames("i go with josé", ["José"]);
  assert.equal(b.masked, "i go with PERSON1");

  const c = maskNames("tía maría is here", ["Tía María"]);
  assert.equal(c.masked, "PERSON1 is here");
});

test("a non-ASCII name still respects boundaries — no partial match", () => {
  // "Om" must not mask inside "Ömer" or inside a longer word.
  const { masked } = maskNames("ömer came home", ["Om", "Ömer"]);
  assert.equal(masked, "PERSON1 came home");
});
