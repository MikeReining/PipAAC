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
    "--hint", "running forward",
    "--out", "/tmp/run.png",
    "--print-prompt",
  ]);
  assert.equal(parsed.word, "run");
  assert.equal(parsed.torso, "green");
  assert.equal(parsed.hint, "running forward");
  assert.equal(parsed.out, "/tmp/run.png");
  assert.equal(parsed.print, true);
});
