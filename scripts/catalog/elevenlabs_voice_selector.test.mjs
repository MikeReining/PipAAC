import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProbeTakeFilename,
  probeTakeFilename,
  probeSlug,
} from "./elevenlabs_voice_selector.mjs";

test("probeTakeFilename and parseProbeTakeFilename", () => {
  const name = probeTakeFilename("his", "c2");
  assert.equal(name, "his__c2_v4_plain.mp3");
  assert.deepEqual(parseProbeTakeFilename(name), { slug: "his", candidateId: "c2" });
});

test("probeSlug", () => {
  assert.equal(probeSlug("car"), "car");
});
