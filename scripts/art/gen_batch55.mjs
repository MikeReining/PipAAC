import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS_TO_GEN = [
  {
    name: "batch55_cool",
    word: "cool face",
    framing: "face",
    hint: "A cheerful, round bright yellow cartoon smiley face wearing classic dark black sunglasses with a subtle white angled shine reflection on the lenses, and a friendly confident warm smile. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no body, AAC symbol.",
  },
  {
    name: "batch55_special",
    word: "special treasure",
    framing: "object",
    hint: "Two gentle human hands held open and cupped together from below, reverently presenting and lifting up a glowing radiant golden star with bright shining light beams. Clean stylized hands in warm skin tone, shining golden star with radiant light rays, bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_ready",
    word: "ready to run",
    framing: "full",
    hint: "A simple cartoon stick figure in an athletic runner starting stance at a crisp white starting line on the ground. Coiled low in runner starting blocks, one knee bent low, fingertips touching the ground line, head raised forward with focus, ready to sprint forward. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_favorite",
    word: "favorite star",
    framing: "object",
    hint: "A single iconic glowing golden 5-pointed star on a pure white background. Vibrant warm yellow-gold color with a subtle warm amber border shade, clean sharp symmetrical points, and a subtle twinkle glint. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no text, no face, AAC symbol.",
  },
  {
    name: "batch55_weird",
    word: "weird monster",
    framing: "object",
    hint: "A whimsical, goofy cartoon purple blob creature on a pure white background. A funny roundish asymmetrical purple body with one huge round googly eye and one tiny googly eye, a crooked spiral antenna bouncing up from the top, and a silly wavy smile. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_funny",
    word: "funny laugh",
    framing: "full",
    hint: "A cheerful cartoon stick figure doubled over laughing hysterically on a pure white background. The figure is bent at the waist, holding their belly with both hands while laughing, with happy curved squinting eyes, wide open laughing mouth, and small tears of joy flying from the eyes. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_morning",
    word: "morning sunrise",
    framing: "diagram",
    hint: "A bright golden cartoon sun rising up from behind a clean smooth green horizon line on a pure white background. Half of the sunny yellow sun is visible rising above the green hill, casting cheerful warm yellow sunbeams upward into the sky, with a small clean upward-pointing curved arrow next to the sun showing the sunrise motion. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_afternoon",
    word: "afternoon sun",
    framing: "diagram",
    hint: "A full bright sunny yellow cartoon sun positioned high at the top center of the sky on a pure white background. Radiating warm yellow sunbeams straight down onto a cheerful green rolling hill with a single fluffy white cloud. Bright clear midday sun. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_evening",
    word: "evening sunset",
    framing: "diagram",
    hint: "A warm reddish-orange cartoon sun setting halfway below a smooth green horizon line on a pure white background. The sunset is sinking down into the horizon, casting warm orange dusk rays, with a small clean downward-pointing curved arrow next to the sun showing the sunset motion. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
  },
  {
    name: "batch55_night",
    word: "night moon",
    framing: "diagram",
    hint: "A serene night scene on a pure white background. A calm green rolling hill at the bottom, with a glowing golden-yellow crescent moon resting high in the dark navy-blue night sky above, surrounded by small twinkling four-pointed stars. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, AAC symbol.",
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
  console.log("All Batch 55 base generations completed!");
}

run().catch((err) => {
  console.error("Batch 55 generation error:", err);
  process.exit(1);
});
