import { generateToFile } from "./gen.mjs";
import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH66_ITEMS = [
  {
    slot: 671,
    word: "tickle",
    framing: "bust",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso laughing with eyes crinkled happily, as two cartoon hands with wiggling curved fingers tickle Pip's tummy with small motion vibration lines.",
  },
  {
    slot: 676,
    word: "love",
    framing: "bust",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso with a warm peaceful smile, hugging a large bright red glowing heart against their chest with both arms.",
  },
  {
    slot: 677,
    word: "together",
    framing: "object",
    social_scale: "zero",
    hint: "Two bold metallic golden chain links securely hooked and interlocked through each other in the center, clean flat color with thick bold black outline.",
  },
  {
    slot: 679,
    word: "yours",
    isCopy: true,
    copyFrom: "assets/symbols/your.png",
  },
  {
    slot: 680,
    word: "these",
    framing: "diagram",
    social_scale: "zero",
    hint: "Three identical bright yellow toy cube blocks clustered closely together in the foreground. A bold black outline cartoon pointing hand is right above the blocks pointing straight down at the group of blocks.",
  },
  {
    slot: 681,
    word: "those",
    framing: "diagram",
    social_scale: "zero",
    hint: "A bold black outline cartoon pointing hand in the foreground on the left, pointing across toward three small bright yellow toy cube blocks clustered together in the distance on the right.",
  },
  {
    slot: 682,
    word: "nothing",
    framing: "object",
    social_scale: "zero",
    hint: "A classic brown leather bifold wallet tipped completely upside down with its bill compartment and card slots open and visibly empty, with nothing falling out.",
  },
  {
    slot: 683,
    word: "behind",
    framing: "diagram",
    social_scale: "zero",
    hint: "A simple clean graphic diagram: a solid blue or wooden cube box in the foreground, with a solid round ball positioned directly behind the box peeking out from the back, with a bold pink arrow pointing behind the box.",
  },
  {
    slot: 684,
    word: "did",
    framing: "object",
    social_scale: "zero",
    hint: "A clean clipboard with a white checklist sheet on it. The list items all have large, crisp, bold green checkmarks next to them, indicating completed tasks.",
  },
  {
    slot: 691,
    word: "string cheese",
    fileKey: "string_cheese",
    framing: "object",
    social_scale: "zero",
    hint: "A creamy white mozzarella string cheese snack, with the top plastic wrapper peeled down and two slender strands of cheese peeled down from the top.",
  },
];

async function run() {
  console.log(`Starting Batch 66 generation: 10 items (9 Muse rolls + 1 copy)...`);
  for (let i = 0; i < BATCH66_ITEMS.length; i++) {
    const item = BATCH66_ITEMS[i];
    const fileKey = item.fileKey || item.word.replace(/\s+/g, "_");
    const dest = `${BRAIN_DIR}/batch66_muse_${fileKey}.png`;

    if (item.isCopy) {
      console.log(`[${i + 1}/10] #${item.slot} "${item.word}" -> copying from ${item.copyFrom}...`);
      copyFileSync(item.copyFrom, dest);
      console.log(`  -> copied to ${dest}`);
      continue;
    }

    console.log(`[${i + 1}/10] Generating #${item.slot} "${item.word}" via Muse...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        torso: item.torso,
        framing: item.framing,
        social_scale: item.social_scale,
        hint: item.hint,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 66 generation complete.");
}

if (process.argv[1]?.endsWith("gen_batch66.mjs")) {
  run().catch(console.error);
}
