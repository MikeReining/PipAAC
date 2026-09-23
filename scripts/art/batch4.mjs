import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "more",
    framing: "object",
    social_scale: "zero",
    hint: "A stack of three colorful wooden toy blocks, with a fourth block being placed on top to add more.",
  },
  {
    word: "all done",
    framing: "bust",
    torso: "blue",
    social_scale: "solo",
    hint: "The stick figure has both arms spread wide with open palms facing forward to signal all done.",
  },
  {
    word: "yes",
    framing: "object",
    social_scale: "zero",
    hint: "A vibrant green circular badge with a bold white check mark in the center.",
  },
  {
    word: "no",
    framing: "object",
    social_scale: "zero",
    hint: "A vibrant red circular badge with a bold white diagonal prohibition slash line across it.",
  },
  {
    word: "not",
    framing: "diagram",
    social_scale: "zero",
    hint: "A bold red X over a dashed black square outline.",
  },
  {
    word: "up",
    framing: "diagram",
    social_scale: "zero",
    hint: "A clean graphic diagram with a bold pink arrow pointing straight up.",
  },
  {
    word: "down",
    framing: "diagram",
    social_scale: "zero",
    hint: "A clean graphic diagram with a bold pink arrow pointing straight down.",
  },
  {
    word: "open",
    framing: "object",
    social_scale: "zero",
    hint: "A bright blue wooden door swung wide open on its hinges, showing an open doorway.",
  },
  {
    word: "turn",
    framing: "diagram",
    social_scale: "zero",
    hint: "A bold curved circular arrow indicating turning in a circle.",
  },
  {
    word: "hurt",
    framing: "face",
    social_scale: "solo",
    hint: "A stick figure face with a pained wincing expression, closed eyes, and a small band-aid on the forehead.",
  },
];

async function run() {
  console.log(`Starting Batch 4: 10 words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch4_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/10] Generating "${item.word}"...`);
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
  console.log("Batch 4 generation complete.");
}

run().catch(console.error);
