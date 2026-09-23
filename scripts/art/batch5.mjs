import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "big",
    framing: "contrast",
    torso: "blue",
    hint: "Two balls side by side, a large ball on the left and a small ball on the right. The large ball is the target.",
  },
  {
    word: "little",
    framing: "contrast",
    torso: "blue",
    hint: "Two balls side by side, a large ball on the left and a small ball on the right. The small ball is the target.",
  },
  {
    word: "good",
    framing: "bust",
    torso: "blue",
    social_scale: "solo",
    hint: "The stick figure is smiling happily and giving a clear thumbs-up gesture with one hand.",
  },
  {
    word: "bad",
    framing: "bust",
    torso: "blue",
    social_scale: "solo",
    hint: "The stick figure has a frowning mouth and is giving a clear thumbs-down gesture with one hand.",
  },
  {
    word: "he",
    framing: "bust",
    torso: "yellow",
    hand: "resting_ball",
    social_scale: "solo",
    hint: "A stick figure boy with short simple hair inside the head outline. An ink pointing hand enters from the side of the frame pointing directly at him.",
  },
  {
    word: "she",
    framing: "bust",
    torso: "yellow",
    hand: "resting_ball",
    social_scale: "solo",
    hint: "A stick figure girl with hair breaking outside the head outline in a ponytail. An ink pointing hand enters from the side of the frame pointing directly at her.",
  },
  {
    word: "me",
    framing: "bust",
    torso: "yellow",
    social_scale: "solo",
    hint: "The stick figure is pointing one hand directly at its own chest.",
  },
  {
    word: "my",
    framing: "bust",
    torso: "yellow",
    social_scale: "solo",
    hint: "The stick figure is resting a flat open hand gently over its chest.",
  },
  {
    word: "please",
    framing: "bust",
    torso: "pink",
    social_scale: "solo",
    hint: "The stick figure is rubbing a flat open hand on its chest to make the sign for please.",
  },
];

async function run() {
  console.log(`Starting Batch 5: 10 words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch5_${item.word.replace(/\s+/g, "_")}.png`;
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
  console.log("Batch 5 generation complete.");
}

run().catch(console.error);
