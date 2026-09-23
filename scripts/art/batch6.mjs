import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "it",
    framing: "object",
    social_scale: "zero",
    hint: "A single clean cube toy block with solid yellow fill. A black outline pointing hand enters from the side pointing directly at the block.",
  },
  {
    word: "that",
    framing: "object",
    social_scale: "zero",
    hint: "A pointing hand in the foreground on the left pointing across the frame toward a yellow block in the distance on the right.",
  },
  {
    word: "here",
    framing: "diagram",
    social_scale: "zero",
    hint: "A bold pink circular spot on the ground right in front, with a downward pointing hand indicating right here.",
  },
  {
    word: "there",
    framing: "diagram",
    social_scale: "zero",
    hint: "A hand in the foreground on the left pointing outward toward a bold pink target spot in the distance on the right.",
  },
  {
    word: "all",
    framing: "object",
    social_scale: "zero",
    hint: "A clean graphic cluster of four identical round balls grouped closely together in a 2x2 square formation. All four balls are filled solid blue with bold black outlines. Pure white background, no boxes, no other shapes, no arrows.",
  },
  {
    word: "some",
    framing: "object",
    social_scale: "zero",
    hint: "Programmatic clone of all.png with bottom two circles flood-filled to #dddad3 pale grey.",
  },
  {
    word: "with",
    framing: "bust",
    torso: "pink",
    social_scale: "pair",
    hint: "Two stick figures side-by-side with arms around each other's shoulders, standing together as companions.",
  },
  {
    word: "what",
    framing: "bust",
    torso: "pink",
    social_scale: "solo",
    hand: "open_palm_up",
    hint: "The stick figure has a curious puzzled expression with raised eyebrows and both hands held out with open cupped palms in a shrugging gesture.",
  },
  {
    word: "where",
    framing: "bust",
    torso: "pink",
    social_scale: "solo",
    hand: "pointing_mitten",
    hint: "The stick figure has one hand shading its brow like a visor looking around into the distance searching for where something is.",
  },
  {
    word: "why",
    framing: "bust",
    torso: "pink",
    social_scale: "solo",
    hint: "The stick figure has a puzzled questioning expression with a tilted head, tapping its chin thoughtfully with one index finger.",
  },
  {
    word: "when",
    framing: "bust",
    torso: "pink",
    social_scale: "solo",
    hint: "The stick figure holds its left arm across its chest with a simple round watch on its wrist. Its other hand is pointing with a single index finger directly at the watch face. The stick figure has a questioning tilted head looking down at the watch.",
  },
];

async function run() {
  console.log(`Starting Batch 6: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch6_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/${BATCH.length}] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        torso: item.torso,
        framing: item.framing,
        hand: item.hand,
        social_scale: item.social_scale,
        hint: item.hint,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 6 generation complete.");
}

run().catch(console.error);
