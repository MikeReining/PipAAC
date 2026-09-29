import assert from "node:assert/strict";
import test from "node:test";

import { elevenExpressiveMintText, elevenSentenceLine } from "./expressive_eleven.mjs";

test("elevenExpressiveMintText — locked winners", () => {
  assert.equal(
    elevenExpressiveMintText("I want an apple", "happy"),
    "[cheerful, bright voice] I want an apple!",
  );
  assert.equal(elevenExpressiveMintText("I want an apple", "sad"), "[sad] I want an apple.");
  assert.equal(
    elevenExpressiveMintText("I want an apple", "angry"),
    "[frustrated] I want an apple!",
  );
  assert.equal(elevenExpressiveMintText("Really?", "happy"), "[cheerful, bright voice] Really?");
});

test("elevenSentenceLine — neutral", () => {
  assert.equal(elevenSentenceLine("Hi", "neutral"), "Hi.");
});
