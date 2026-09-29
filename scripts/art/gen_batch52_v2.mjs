import { generateToFile } from "./gen.mjs";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS_TO_GEN = [
  {
    name: "trees_tall_short",
    hint: "Two simple classic green deciduous trees standing side by side on a shared flat ground line: on the left, a tall mature tree with a tall brown trunk reaching near the top of the frame and a lush round canopy; on the right, a very short young tree with a short trunk and small round canopy standing less than half the height on the same ground line. Bold clean black outlines, simple flat colors, pure white background, no arrows.",
  },
  {
    name: "kettlebell_feather",
    hint: "Two simple objects sitting side by side on a clean white surface: on the left, a heavy solid cast-iron gym kettlebell with a round body and thick sturdy top handle; on the right, a soft, delicate, fluffy white bird feather resting gently beside it. Bold clean black outlines, simple flat colors, pure white background, no scale, no arrows.",
  },
  {
    name: "books_thick_thin",
    hint: "Two books lying flat on a table seen from a slight three-quarter top angle: on the left, an extremely thick chunky hardcover dictionary book with a very thick spine and tall dense block of white pages; on the right, an extremely thin slender paperback booklet with a wafer-thin spine and just a few pages lying flat beside it. Bold clean black outlines, simple flat colors, pure white background, no arrows.",
  },
  {
    name: "wide_gate",
    hint: "A wide open entrance between two vertical gate posts showing a very wide open space. A bold horizontal double-headed arrow spanning horizontally across the wide space in vivid blue color, beside a narrow doorway in pale light gray. Bold clean black outlines, simple flat colors, pure white background.",
  },
];

async function run() {
  for (const item of ITEMS_TO_GEN) {
    const out = `${BRAIN_DIR}/${item.name}.png`;
    console.log(`Generating ${item.name}...`);
    await generateToFile({
      word: item.name,
      torso: null,
      framing: "object",
      hint: item.hint,
      out,
    });
    console.log(`Saved ${out}`);
  }
}

run().catch(console.error);
