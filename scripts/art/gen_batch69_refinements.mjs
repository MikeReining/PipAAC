import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const REFINEMENT_ITEMS = [
  {
    word: "bit",
    fileKey: "bit_hand",
    framing: "object",
    social_scale: "zero",
    hint: "A clean, minimalist cartoon hand and wrist on a pure white background, seen in side profile. The hand is holding its thumb and index finger very close together in a universal 'tiny bit' pinch gesture, with a small visible gap between the fingertips. White skin fill, bold black outline, monoline vector clipart in the exact style of Pip AAC hand symbols. Pure white background, high contrast, clean vector lines.",
  },
  {
    word: "time",
    fileKey: "time_watch",
    framing: "object",
    social_scale: "zero",
    hint: "A clean, minimalist cartoon wrist and hand on a pure white background. The wrist is wearing a simple round wristwatch with a clean white watch face and black clock hands. The index finger of a second hand is pointing directly at the watch face in the universal 'what time is it / it is time' gesture. White skin fill, bold black outline, monoline vector clipart in the exact style of Pip AAC hand symbols. Pure white background, high contrast.",
  },
  {
    word: "about",
    fileKey: "about_two_arms",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure bust on a pure white background in a thoughtful pondering pose. Pip has a round white head with dot eyes, looking up curiously. Pip has two complete arms: one arm is bent with the hand gently resting against the chin, and the second arm is folded across the lower torso with a round white hand resting on the waist. Floating freely in the upper right with a clean white air gap is a speech bubble containing an orbiting curved arrow loop with a question mark in the center. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runRefinements() {
  for (const item of REFINEMENT_ITEMS) {
    const outFile = `${BRAIN_DIR}/batch69_muse_${item.fileKey}.png`;
    console.log(`\n=== Generating Refinement: ${item.fileKey} ===`);
    await generateToFile({
      word: item.word,
      framing: item.framing,
      social_scale: item.social_scale,
      torso: item.torso,
      hint: item.hint,
      out: outFile,
    });
  }
}

if (process.argv[1]?.endsWith("gen_batch69_refinements.mjs")) {
  runRefinements().catch(console.error);
}
