import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS_TO_GEN = [
  {
    name: "batch56_bedtime",
    word: "bedtime sleep",
    framing: "full",
    hint: "A cozy cartoon stick figure tucked into a small bed under a warm colorful quilt on a pure white background. The figure's head rests comfortably on a fluffy white pillow, fast asleep with closed smiling eyes. Beside the bed is a small nightstand with a gentle lamp, and above is a smiling yellow crescent moon with small twinkling stars. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch56_naptime",
    word: "naptime rest",
    framing: "full",
    hint: "A cartoon stick figure resting peacefully during daycare naptime on a low blue preschool nap cot with white legs on a pure white background. The figure is lying down covered by a simple pastel light-blue blanket, head on a flat nap pillow, eyes closed in gentle rest. A soft cheerful daytime sun shines in the upper corner. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
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
      word: item.word,
      torso: null,
      framing: item.framing,
      hint: item.hint,
      out,
    });
    console.log(`Saved ${out}`);
  }
  console.log("Batch 56 character generations completed!");
}

run().catch((err) => {
  console.error("Batch 56 generation error:", err);
  process.exit(1);
});
