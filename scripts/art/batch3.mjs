import { generateToFile } from "./gen.mjs";
import { resolve } from "path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "you",
    torso: "yellow",
    framing: "bust",
    hint: "The stick figure points forward toward the viewer with one hand.",
  },
  {
    word: "sad",
    framing: "face",
    hint: "A sad facial expression with a downturned mouth and a single blue teardrop.",
  },
  {
    word: "help",
    torso: "red",
    framing: "full",
    hint: "A stick figure in red reaching out with both hands to help a smaller stick figure stand up.",
  },
  {
    word: "in",
    framing: "diagram",
    hint: "An open cardboard box with a bold pink arrow entering inside the box.",
  },
  {
    word: "on",
    framing: "diagram",
    hint: "A flat wooden table with a bold pink arrow pointing down resting directly on top of the surface.",
  },
  {
    word: "off",
    framing: "diagram",
    hint: "A flat wooden table with a bold pink arrow curving up and leaping off of the surface.",
  },
  {
    word: "put",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is placing a red block down into an open cardboard box.",
  },
  {
    word: "take",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is lifting a red block up out of an open cardboard box.",
  },
  {
    word: "give",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is holding out a red toy with both hands to give to the viewer.",
  },
  {
    word: "drink",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is holding a blue cup to its mouth to drink.",
  },
];

async function run() {
  console.log(`Starting Batch 3: 10 words, exactly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch3_${item.word}.png`;
    console.log(`[${i + 1}/10] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        torso: item.torso,
        framing: item.framing,
        hint: item.hint,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 3 generation complete.");
}

run().catch(console.error);
