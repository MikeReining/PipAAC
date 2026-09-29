import assert from "node:assert/strict";
import { test } from "node:test";

import {
  labTakeFilename,
  labVariationText,
  modelForLabVariation,
  slugFromLabTakeFilename,
} from "./elevenlabs_v4_lab.mjs";

test("labVariationText: v4 only (v3 ids and the A/B matrix are retired)", () => {
  assert.equal(labVariationText("find", "v4_plain"), "find");
  assert.equal(labVariationText("go", "v4_ipa", { ipa: "ɡoʊ" }), "/ɡoʊ/");
  assert.equal(labVariationText("an", "v4_ipa", { ipa: "/æn/" }), "/æn/");
  assert.throws(() => labVariationText("find", "v3_plain"));
  assert.throws(() => labVariationText("find", "v4_warm"));
});

test("slugFromLabTakeFilename", () => {
  assert.equal(slugFromLabTakeFilename("bathroom_v4_plain.mp3"), "bathroom");
  assert.equal(slugFromLabTakeFilename("go_v4_ipa.mp3"), "go");
  // retired suffixes no longer parse as variations
  assert.equal(slugFromLabTakeFilename("all_done_v3_period.mp3"), "all_done_v3_period");
});

test("labTakeFilename and modelForLabVariation", () => {
  assert.equal(labTakeFilename("bath", "v4_ipa"), "bath_v4_ipa.mp3");
  assert.equal(modelForLabVariation("v4_plain"), "eleven_v4");
  assert.throws(() => modelForLabVariation("v3_plain"));
});
