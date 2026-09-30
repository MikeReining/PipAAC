import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPluralWord,
  buildPrompt,
  loadStyleRefs,
  sniffImageMime,
  parseArgs,
  generateToFile,
  loadGlyphWords,
  GLYPH_WORDS_PATH,
  DEFAULT_STYLE_REF_DIR,
  OBJECT_STYLE_REF_DIR,
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
      "We are creating an image to teach the concept of: apple.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
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

  const aslVTest = buildPrompt({ word: "see", torso: "green", framing: "bust", hand: "asl_v" });
  assert.ok(aslVTest.includes("One hand has two extended fingers in a clear V shape (ASL V sign) pointing toward the eyes."));

  const objectTest = buildPrompt({ word: "apple", framing: "object" });
  assert.equal(
    objectTest,
    [
      "We are creating an image to teach the concept of: apple.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
    ].join("\n"),
  );

  const packshot = buildPrompt({ word: "fruit snack", entity_mode: "category_packshot", packaging: "pouch" });
  assert.ok(packshot.includes("A product photo of a fruit snack pouch, isolated on a plain white background"));
  assert.ok(packshot.includes("no text of any kind on the packaging, no letters, no words"));

  const cpg = buildPrompt({ word: "7 up", entity_mode: "cpg_brand", packaging: "can" });
  assert.ok(cpg.includes("A product photo of 7 up can, isolated on a plain white background"));
  assert.ok(cpg.includes("faithful reproduction of authentic product packaging, brand logo, and typography"));

  const anatomyRel = buildPrompt({
    word: "hair",
    entity_mode: "anatomy_relational",
    hint: "A simplified face with black hair on top and a bold black arrow pointing to the hair.",
  });
  assert.ok(anatomyRel.includes("We are creating an image to teach the concept of: hair."));
  assert.ok(anatomyRel.includes("A simplified face with black hair on top and a bold black arrow pointing to the hair."));

  const aslHeadTest = buildPrompt({ word: "head", torso: "yellow", framing: "bust", hand: "asl_head" });
  assert.ok(aslHeadTest.includes("One open flat hand is placed against the side of the head and temple in the ASL head gesture."));

  const aslBodyTest = buildPrompt({ word: "body", torso: "yellow", framing: "full", hand: "asl_body" });
  assert.ok(aslBodyTest.includes("Both open flat hands are resting against the chest and torso in the ASL body gesture."));
});

test("loadStyleRefs loads exactly 3 style references from assets/style-refs/pip-v1 and object-v1", () => {
  const refs = loadStyleRefs(DEFAULT_STYLE_REF_DIR);
  assert.equal(refs.length, MAX_STYLE_REFS);
  for (const ref of refs) {
    assert.ok(ref.file.length > 0);
    assert.ok(ref.dataUri.startsWith("data:image/jpeg;base64,") || ref.dataUri.startsWith("data:image/png;base64,"));
  }

  const objRefs = loadStyleRefs(OBJECT_STYLE_REF_DIR);
  assert.equal(objRefs.length, MAX_STYLE_REFS);
  for (const ref of objRefs) {
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

  const packParsed = parseArgs(["--word", "fruit snack", "--packshot", "--packaging", "pouch"]);
  assert.equal(packParsed.entity_mode, "category_packshot");
  assert.equal(packParsed.packaging, "pouch");

  const cpgParsed = parseArgs(["--word", "7 up", "--cpg", "--brand", "Dr Pepper", "--packaging", "can"]);
  assert.equal(cpgParsed.entity_mode, "cpg_brand");
  assert.equal(cpgParsed.brand, "Dr Pepper");
  assert.equal(cpgParsed.packaging, "can");
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


test("contrast framing fills the target, ghosts the reference, and drops arrows", () => {
  const p = buildPrompt({ word: "big", torso: "blue", framing: "contrast", hand: "pointing_mitten" });
  assert.ok(p.includes("Only the one this word is about is filled solid blue"));
  assert.ok(p.includes("pale light grey fill. No arrows."));
  assert.ok(!p.includes("torso"));
  assert.ok(!p.includes("mitten"));
  assert.throws(() => buildPrompt({ word: "big", framing: "contrast" }), /needs --torso/);
});

test("generateToFile refuses glyph words before any network call", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error("network"); };
  await assert.rejects(
    generateToFile({ word: "Can", apiKey: "k", fetchImpl }),
    /opaque word/,
  );
  assert.equal(called, false);
});

test("every glyph word is a lexicon word with a shipped, on-palette SVG", () => {
  const lexicon = JSON.parse(readFileSync(resolve(dirname(GLYPH_WORDS_PATH), "../launch_lexicon.json"), "utf8"));
  const roleOf = new Map(lexicon.entries.map((e) => [e.spokenText.toLowerCase(), e.fitzgeraldColor]));
  const { words } = JSON.parse(readFileSync(GLYPH_WORDS_PATH, "utf8"));
  // Hue means grammar: ink, white, grey context, the person's yellow, and
  // the word's own role color (+ its pale tint). Nothing else.
  const role = { Green: ["#31a44b", "#cdebd3"], Pink: ["#f16b93", "#fcd6e2"] };
  const neutral = ["#111111", "#ffffff", "#dddad3", "#fecc2a", "none"];
  for (const [w, g] of Object.entries(words)) {
    assert.ok(roleOf.has(w), `${w} is not in data/launch_lexicon.json`);
    assert.ok(["asl", "symbol", "diagram"].includes(g.source), `${w}: bad source ${g.source}`);
    assert.ok(g.spec, `${w}: no spec`);
    const svg = readFileSync(resolve(dirname(GLYPH_WORDS_PATH), `../../assets/symbols/${w}.svg`), "utf8");
    assert.match(svg, /viewBox="0 0 100 100"/, `${w}: viewBox`);
    assert.match(svg, new RegExp(`aria-label="${w}"`), `${w}: aria-label`);
    const allowed = new Set([...neutral, ...(role[roleOf.get(w)] ?? [])]);
    for (const [, c] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
      assert.ok(allowed.has(c), `${w}: off-palette color ${c}`);
    }
  }
  assert.equal(loadGlyphWords().size, Object.keys(words).length);
});

test("every glyph renders centered, inside the safe margin, with its parts apart", async () => {
  // Measure the rendered pixels, not the SVG's own coordinates: an outline
  // poking past the edge or a drawing parked high only shows up in ink.
  const PX = 200; // 2 px per viewBox unit
  const MARGIN = 5; // units; glyphs are drawn to 6, this allows anti-aliasing
  const { words } = JSON.parse(readFileSync(GLYPH_WORDS_PATH, "utf8"));
  for (const w of Object.keys(words)) {
    const file = resolve(dirname(GLYPH_WORDS_PATH), `../../assets/symbols/${w}.svg`);
    const { data } = await sharp(file, { density: 200 }).resize(PX, PX).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    let x0 = PX, y0 = PX, x1 = -1, y1 = -1;
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        if (data[(y * PX + x) * 4 + 3] > 24) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
    }
    const u = (px) => px / 2;
    assert.ok(u(x0) >= MARGIN && u(y0) >= MARGIN && u(x1 + 1) <= 100 - MARGIN && u(y1 + 1) <= 100 - MARGIN,
      `${w}: ink ${u(x0)}..${u(x1 + 1)} x ${u(y0)}..${u(y1 + 1)} breaks the ${MARGIN}-unit margin`);
    const cx = u(x0 + x1 + 1) / 2, cy = u(y0 + y1 + 1) / 2;
    assert.ok(Math.abs(cx - 50) <= 1.5 && Math.abs(cy - 50) <= 1.5, `${w}: ink centered at ${cx},${cy}, not 50,50`);
    if (words[w].parts) {
      const found = partsWithGap(data, PX, 6 * 2);
      assert.equal(found, words[w].parts, `${w}: ${found} separate parts at a 6-unit gap, want ${words[w].parts} — pieces touching?`);
    }
  }
});

/** Count ink pieces after growing each by half the gap: two pieces closer
 *  than `gapPx` merge, so a count below the expected one means touching. */
function partsWithGap(rgba, px, gapPx) {
  const r = gapPx / 2;
  const ink = new Uint8Array(px * px);
  for (let i = 0; i < px * px; i++) ink[i] = rgba[i * 4 + 3] > 24 ? 1 : 0;
  const grown = new Uint8Array(px * px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      if (!ink[y * px + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx, Y = y + dy;
          if (dx * dx + dy * dy <= r * r && X >= 0 && Y >= 0 && X < px && Y < px) grown[Y * px + X] = 1;
        }
      }
    }
  }
  let n = 0;
  const seen = new Uint8Array(px * px);
  for (let i = 0; i < px * px; i++) {
    if (!grown[i] || seen[i]) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % px, y = (j - x) / px;
      for (const k of [x > 0 ? j - 1 : -1, x < px - 1 ? j + 1 : -1, y > 0 ? j - px : -1, y < px - 1 ? j + px : -1]) {
        if (k >= 0 && grown[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
  }
  return n;
}
