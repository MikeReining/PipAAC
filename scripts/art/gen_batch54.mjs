import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS_TO_GEN = [
  {
    name: "puzzle_easy",
    hint: "A simple 4-piece jigsaw puzzle arranged in a 2x2 square on a pure white background. Three chunky puzzle pieces with bold primary colors (vivid blue, yellow, green) are clicked together. The fourth piece (top right, vivid red with a single rounded tab) is floating just slightly detached by 40 pixels, perfectly oriented and ready to drop into the remaining slot. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no text, AAC symbol.",
  },
  {
    name: "puzzle_difficult",
    hint: "A complicated and difficult jigsaw puzzle on a pure white background. A 16-piece grid of small intricate puzzle pieces where only 3 or 4 pieces are connected, while several other small loose jigsaw pieces with complicated interlocking tabs are scattered around in a chaotic, unsolved state. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no text, AAC symbol.",
  },
  {
    name: "cars_new_old",
    hint: "Side-by-side comparison on a pure white background. On the left: a brand new shiny bright blue cartoon sedan car, pristine glossy body, clean chrome bumper, sparkling clean with a small bright yellow twinkle star sparkle above the hood. On the right: the EXACT same cartoon car, but old and beaten up: faded dull paint, brown rust patches on the fender, a small dent in the door, a hairline crack in the windshield, and a small puff of gray exhaust smoke coming out of the tailpipe. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no ground, no road, AAC symbol.",
  },
  {
    name: "flower_pretty",
    hint: "A single gorgeous, vibrant blooming cartoon daisy flower standing upright on a pure white background. Cheerful bright pink petals radiating from a sunny yellow center, a clean fresh green stem with two green leaves, and a delicate sparkling twinkle star nearby. Bold clean black outlines, flat vector clipart style, thick lines, pure white background, no vase, no pot, AAC symbol.",
  },
  {
    name: "safe_shield",
    hint: "A bold emerald green knight heraldic shield with a clean white padlock emblem in the center. Bold thick black outlines, simple flat vector cartoon clipart style, thick lines, pure white background, no swords, no weapons, AAC symbol.",
  },
  {
    name: "dangerous_triangle",
    hint: "A bold bright yellow equilateral warning triangle with rounded corners, a thick heavy black border, and a bold black exclamation point in the center. Clean simple flat vector graphic style, thick lines, pure white background, no text, AAC symbol.",
  },
  {
    name: "glass_full",
    hint: "A clean simple transparent drinking tumbler glass standing upright on a flat surface, filled almost to the brim with clear bright blue water. Crisp black and blue outlines showing the glass rim and water meniscus surface level, transparent body, pure white background, no straw, no ice, no lemon.",
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
  console.log("All Batch 54 base generations completed!");
}

run().catch(console.error);
