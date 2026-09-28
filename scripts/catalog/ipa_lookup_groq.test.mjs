import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildIpaSystemPrompt,
  formatElevenV4IpaLine,
  normalizeIpaField,
  parseGroqIpaPayload,
} from "./ipa_lookup_groq.mjs";

test("parseGroqIpaPayload extracts JSON from model text", () => {
  const r = parseGroqIpaPayload('{"ipa":"/ɡoʊ/","gloss":"move"}');
  assert.equal(r.ipa, "/ɡoʊ/");
  assert.equal(r.gloss, "move");
});

test("normalizeIpaField wraps bare IPA", () => {
  assert.equal(normalizeIpaField("ɡoʊ"), "/ɡoʊ/");
  assert.equal(normalizeIpaField("/ɡoʊ/"), "/ɡoʊ/");
});

test("parseGroqIpaPayload rejects missing ipa", () => {
  assert.throws(() => parseGroqIpaPayload('{"gloss":"x"}'), /missing ipa/);
});

test("isolated_tile prompt mentions citation and an", () => {
  const p = buildIpaSystemPrompt("isolated_tile");
  assert.match(p, /isolated/i);
  assert.match(p, /an.*æn/i);
});

test("formatElevenV4IpaLine", () => {
  assert.equal(formatElevenV4IpaLine("an", "/æn/"), "/æn/");
  assert.equal(formatElevenV4IpaLine("all done", "/ɔːl dʌn/"), "all done /ɔːl dʌn/");
});
