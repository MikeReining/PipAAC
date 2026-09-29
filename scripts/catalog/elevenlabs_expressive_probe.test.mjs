import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPRESSIVE_PROBE_ROUNDS,
  elevenSentenceLine,
  elevenTextForProbeVariant,
  elevenV4ExpressiveText,
  elevenWinnerText,
} from "./elevenlabs_expressive_probe.mjs";
import { applyEmotionalProsody } from "../../src/worker/prosody.mjs";

test("elevenSentenceLine — matches Grok ? ! . endings without XML", () => {
  assert.equal(elevenSentenceLine("I want an apple", "neutral"), "I want an apple.");
  assert.equal(elevenSentenceLine("I want an apple", "happy"), "I want an apple!");
  assert.equal(elevenSentenceLine("Really?", "angry"), "Really?");
});

test("elevenV4ExpressiveText — legacy faces round tags", () => {
  assert.match(elevenV4ExpressiveText("I want an apple", "happy"), /^\[excited\]/);
  assert.match(elevenV4ExpressiveText("I want an apple", "sad"), /^\[crying\]/);
});

test("happy-v2 round — prose prefixes", () => {
  const warm = EXPRESSIVE_PROBE_ROUNDS["happy-v2"].variants.find((v) => v.id === "prose_warm");
  assert.match(elevenTextForProbeVariant("I want an apple", warm), /^\[warm, conversational tone/);
});

test("winners — Eve tags vs Grok XML differ", () => {
  assert.equal(
    elevenWinnerText("I want an apple", "angry"),
    "[frustrated] I want an apple!",
  );
  assert.match(applyEmotionalProsody("I want an apple", "angry"), /^<loud>/);
});
