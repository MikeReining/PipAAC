import assert from "node:assert/strict";
import { test } from "node:test";

import {
  labTakeFilename,
  labVariationText,
  modelForLabVariation,
  slugFromLabTakeFilename,
} from "./elevenlabs_v4_lab.mjs";

test("labVariationText v3/v4 matrix", () => {
  assert.equal(labVariationText("find", "v3_plain"), "find");
  assert.equal(labVariationText("find", "v3_period"), "find.");
  assert.equal(labVariationText("find.", "v3_period"), "find.");
  assert.equal(labVariationText("find", "v4_plain"), "find");
  assert.equal(labVariationText("find", "v4_period"), "find.");
  assert.equal(labVariationText("find", "v4_warm"), "[warm, clear] find.");
  assert.equal(labVariationText("go", "v4_ipa", { ipa: "ɡoʊ" }), "/ɡoʊ/");
  assert.equal(labVariationText("an", "v4_ipa", { ipa: "/æn/" }), "/æn/");
});

test("slugFromLabTakeFilename", () => {
  assert.equal(slugFromLabTakeFilename("bathroom_v4_plain.mp3"), "bathroom");
  assert.equal(slugFromLabTakeFilename("all_done_v3_period.mp3"), "all_done");
  assert.equal(slugFromLabTakeFilename("go_v4_ipa.mp3"), "go");
});

test("labTakeFilename and modelForLabVariation", () => {
  assert.equal(labTakeFilename("bath", "v4_warm"), "bath_v4_warm.mp3");
  assert.equal(modelForLabVariation("v3_plain"), "eleven_v3");
  assert.equal(modelForLabVariation("v4_period"), "eleven_v4");
});
