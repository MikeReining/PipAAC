import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPluralWord,
  buildPrompt,
  loadStyleRefs,
  sniffImageMime,
  parseArgs,
  DEFAULT_STYLE_REF_DIR,
  MAX_STYLE_REFS,
} from "./gen.mjs";

test("isPluralWord identifies regular and irregular plurals", () => {
  assert.equal(isPluralWord("apple"), false);
  assert.equal(isPluralWord("apples"), true);
  assert.equal(isPluralWord("children"), true);
  assert.equal(isPluralWord("people"), true);
  assert.equal(isPluralWord("glass"), false); // ends in ss
  assert.equal(isPluralWord("bus"), false);   // ends in us
  assert.equal(isPluralWord("physics"), false); // ends in ics
  assert.equal(isPluralWord("yes"), false); // non-plural ending in s
  assert.equal(isPluralWord("this"), false); // non-plural ending in s
});

test("buildPrompt builds the 3-line base prompt with optional clauses", () => {
  const base = buildPrompt({ word: "apple" });
  assert.equal(
    base,
    [
      "We are trying to teach a child the concept of: apple.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
    ].join("\n"),
  );

  const action = buildPrompt({ word: "run", torso: "green" });
  assert.ok(action.includes("The stick figure's torso is solid green."));

  const spatial = buildPrompt({ word: "in", hint: "an open box with a bold pink arrow entering inside" });
  assert.ok(spatial.includes("an open box with a bold pink arrow entering inside"));

  const plural = buildPrompt({ word: "apples" });
  assert.ok(plural.includes("Show more than one."));

  const face = buildPrompt({ word: "happy", framing: "face" });
  assert.ok(face.includes("Close-up shot of a stick figure face filling the frame. Head only, no body, no legs."));

  const bust = buildPrompt({ word: "eat", torso: "green", framing: "bust" });
  assert.ok(bust.includes("Close-up shot of the stick figure from the chest up. Upper body and hands only, no legs."));
  assert.ok(bust.includes("The stick figure's torso is solid green."));

  const full = buildPrompt({ word: "run", torso: "green", framing: "full" });
  assert.ok(full.includes("Full body stick figure with complete posture and legs."));

  const diagram = buildPrompt({ word: "in", framing: "diagram" });
  assert.ok(diagram.includes("A clean graphic diagram with no human figures."));

  const handTest = buildPrompt({ word: "look", torso: "green", framing: "bust", hand: "pointing_mitten" });
  assert.ok(handTest.includes("One hand is in a pointing mitten pose with a single extended pointer finger."));
});

test("loadStyleRefs loads exactly 3 style references from assets/style-refs/pip-v1", () => {
  const refs = loadStyleRefs(DEFAULT_STYLE_REF_DIR);
  assert.equal(refs.length, MAX_STYLE_REFS);
  for (const ref of refs) {
    assert.ok(ref.file.length > 0);
    assert.ok(ref.dataUri.startsWith("data:image/jpeg;base64,") || ref.dataUri.startsWith("data:image/png;base64,"));
  }
});

test("parseArgs parses flags correctly", () => {
  const parsed = parseArgs([
    "--word", "run",
    "--torso", "green",
    "--framing", "full",
    "--hand", "resting_ball",
    "--hint", "running forward",
    "--out", "/tmp/run.png",
    "--classify",
    "--print-prompt",
  ]);
  assert.equal(parsed.word, "run");
  assert.equal(parsed.torso, "green");
  assert.equal(parsed.framing, "full");
  assert.equal(parsed.hand, "resting_ball");
  assert.equal(parsed.hint, "running forward");
  assert.equal(parsed.out, "/tmp/run.png");
  assert.equal(parsed.classify, true);
  assert.equal(parsed.print, true);
});

test("parseArgs rejects invalid framing", () => {
  assert.throws(
    () => parseArgs(["--word", "run", "--framing", "wide_angle"]),
    /invalid framing: wide_angle/,
  );
});

test("parseArgs rejects invalid hand mode", () => {
  assert.throws(
    () => parseArgs(["--word", "run", "--hand", "lobster_claws"]),
    /invalid hand mode: lobster_claws/,
  );
});

test("parseArgs handles and validates social scale", () => {
  const parsed = parseArgs(["--word", "give", "--social-scale", "pair"]);
  assert.equal(parsed.social_scale, "pair");

  assert.throws(
    () => parseArgs(["--word", "give", "--social-scale", "crowd"]),
    /invalid social scale: crowd/,
  );
});

test("buildPrompt applies social scale correctly", () => {
  const pairPrompt = buildPrompt({ word: "give", framing: "bust", social_scale: "pair" });
  assert.ok(pairPrompt.includes("Close-up shot of two stick figures from the chest up."));

  const groupPrompt = buildPrompt({ word: "we", framing: "bust", social_scale: "group" });
  assert.ok(groupPrompt.includes("Close-up shot of three stick figures from the chest up."));

  const zeroPrompt = buildPrompt({ word: "stop", social_scale: "zero" });
  assert.ok(zeroPrompt.includes("No human figures in the image."));
});

