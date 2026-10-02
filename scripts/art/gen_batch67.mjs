import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH67_ITEMS = [
  {
    slot: 694,
    word: "banana bread",
    fileKey: "banana_bread",
    framing: "object",
    social_scale: "zero",
    hint: "A delicious golden-brown whole loaf of banana bread baked in a loaf pan, with a thick sliced piece resting in front showing textured crumb and banana rounds, clean vector clipart, pure white background.",
  },
  {
    slot: 695,
    word: "goldfish crackers",
    fileKey: "goldfish_crackers",
    framing: "object",
    social_scale: "zero",
    hint: "Three cute cheddar cheese fish-shaped snack crackers clustered together, bright golden-orange color with little eye indentations and happy smiles, bold black outline, pure white background.",
  },
  {
    slot: 696,
    word: "pudding",
    fileKey: "pudding",
    framing: "object",
    social_scale: "zero",
    hint: "A clear glass dessert dish filled with smooth rich brown chocolate pudding swirl, with a silver spoon resting inside the dish, clean vector clipart, pure white background.",
  },
  {
    slot: 697,
    word: "jello",
    fileKey: "jello",
    framing: "object",
    social_scale: "zero",
    hint: "A classic molded dome of bright translucent ruby-red gelatin with fluted ridges sitting on a simple white dessert plate with clean shine highlights, clean vector clipart, pure white background.",
  },
  {
    slot: 700,
    word: "chocolate",
    fileKey: "chocolate",
    framing: "object",
    social_scale: "zero",
    hint: "A rectangular chocolate candy bar with silver foil wrapper torn open halfway down, showing glossy brown rectangular scored chocolate squares, clean vector clipart, pure white background.",
  },
  {
    slot: 712,
    word: "cantaloupe",
    fileKey: "cantaloupe",
    framing: "object",
    social_scale: "zero",
    hint: "A round textured tan whole uncut cantaloupe melon, with a juicy crescent slice resting in front showing vibrant bright orange interior fruit and pale rind, clean monoline vector illustration, pure white background.",
  },
  {
    slot: 719,
    word: "hot chocolate",
    fileKey: "hot_chocolate",
    framing: "object",
    social_scale: "zero",
    hint: "A warm red ceramic mug filled with rich brown hot cocoa, topped with several puffy white mini marshmallows floating on top and gentle curly steam lines rising, clean vector clipart, pure white background.",
  },
  {
    slot: 720,
    word: "milkshake",
    fileKey: "milkshake",
    framing: "object",
    social_scale: "zero",
    hint: "A tall classic fluted diner soda-fountain milkshake glass filled with thick pink milkshake, piled high with white whipped cream, a bright red maraschino cherry with a stem on top, and a diagonal red-and-white striped straw, clean vector clipart, pure white background.",
  },
];

export async function runBatch67() {
  for (const item of BATCH67_ITEMS) {
    const outFile = `${BRAIN_DIR}/batch67_muse_${item.fileKey}.png`;
    if (existsSync(outFile)) {
      console.log(`Skipping #${item.slot} ${item.word} (already exists: ${outFile})`);
      continue;
    }
    console.log(`\n=== Generating #${item.slot} ${item.word} ===`);
    await generateToFile({
      word: item.word,
      framing: item.framing,
      social_scale: item.social_scale,
      hint: item.hint,
      out: outFile,
    });
  }
}

if (process.argv[1]?.endsWith("gen_batch67.mjs")) {
  runBatch67().catch(console.error);
}
