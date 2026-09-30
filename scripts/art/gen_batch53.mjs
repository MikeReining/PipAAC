import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS_TO_GEN = [
  {
    name: "anvil_hard",
    hint: "A solid heavy blacksmith cast-iron anvil with a flat striking surface, horn, and sturdy base sitting firmly on a flat surface. A small crisp cartoon spark/gleam at the top indicating rock-hard solid steel. Bold clean black outlines, simple flat colors, pure white background, no hammer, no words.",
  },
  {
    name: "sponges_wet_dry",
    hint: "Two rectangular household cleaning sponges sitting side by side on a clean white surface: on the left, a saturated wet sponge dripping bright blue water droplets with a small blue puddle below; on the right, an identical dry sponge sitting flat and completely dry with zero droplets. Bold clean black outlines, simple flat colors, pure white background, no hands, no arrows.",
  },
  {
    name: "plates_clean_dirty",
    hint: "Two round white ceramic dinner plates sitting side by side on a clean white surface: on the left, a spotless sparkling clean plate with a small four-point twinkle star sparkle; on the right, an identical dirty plate smeared with brown food splatters, sauce stains, and crumbs. Bold clean black outlines, simple flat colors, pure white background, no forks, no utensils, no arrows.",
  },
  {
    name: "pebble_smooth",
    hint: "A perfectly smooth, rounded oval polished river pebble stone resting on a clean surface. Bold clean black outlines, simple flat colors, pure white background, no hands, no background elements.",
  },
  {
    name: "mugs_broken_fixed",
    hint: "Two simple ceramic coffee mugs with round loop handles sitting side by side on a clean white surface: on the left, a broken mug cracked down the middle with a jagged zigzag fissure; on the right, an identical mug seamlessly mended back together with clean repair seam lines. Bold clean black outlines, simple flat colors, pure white background, no liquid, no coffee, no arrows.",
  },
  {
    name: "glass_empty",
    hint: "A clean simple transparent drinking tumbler glass standing upright on a flat surface, completely empty with zero liquid inside. Crisp blue and black outlines showing the glass rim and base, transparent body, pure white background, no straw, no ice.",
  },
];

async function run() {
  for (const item of ITEMS_TO_GEN) {
    const out = `${BRAIN_DIR}/${item.name}.png`;
    if (existsSync(out)) {
      console.log(`${item.name}.png already exists, skipping.`);
      continue;
    }
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
  console.log("All Batch 53 base generations completed!");
}

run().catch(console.error);
