import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH68_MUSE_ITEMS = [
  {
    rank: 5,
    word: "gone",
    fileKey: "gone",
    framing: "full",
    social_scale: "zero",
    hint: "A minimalist stick figure that has vanished. The stick figure is shown entirely as a bold black dashed outline silhouette with an empty white interior on a pure white background. At the base where the figure stood is a clean, simple cartoon puff of dust or motion smoke with two tiny sparkles in the air, showing the figure just disappeared. Pure white background, bold black dashed outline, high contrast vector clipart.",
  },
  {
    rank: 9,
    word: "watch",
    fileKey: "watch",
    framing: "full",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso seated comfortably in side profile, watching a clean modern flat screen television monitor. The television screen is dark blue with a clean subtle yellow star in the center. The stick figure is looking directly at the screen with attentive pleasant expression. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 10,
    word: "try",
    fileKey: "try",
    framing: "full",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso stretching upward on tiptoes with determined effort, holding a clean yellow geometric cube in both hands, trying to place it into the slot of a wooden shape sorter box on a low table. Clean posture of active effort and attempt, pleasant determined smile. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 6,
    word: "let",
    fileKey: "let",
    framing: "full",
    social_scale: "zero",
    torso: "green",
    hint: "A friendly minimalist stick figure with a solid green torso standing beside an open doorway, holding an open hand gesturing invitingly forward in a welcoming 'after you / go ahead' allowing posture. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 3,
    word: "well",
    fileKey: "well",
    framing: "bust",
    social_scale: "zero",
    torso: "pink",
    hint: "A minimalist stick figure bust with a solid pink torso in a thoughtful, pondering pose. One hand is resting gently against the chin with a contemplative, gentle smile, head tilted slightly in a thinking 'well...' expression. Clean monoline vector clipart, pure white background, bold black outline.",
  },
];

export async function runBatch68Muse() {
  for (const item of BATCH68_MUSE_ITEMS) {
    const outFile = `${BRAIN_DIR}/batch68_muse_${item.fileKey}.png`;
    if (existsSync(outFile)) {
      console.log(`Skipping #${item.rank} ${item.word} (already exists: ${outFile})`);
      continue;
    }
    console.log(`\n=== Generating #${item.rank} ${item.word} ===`);
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

if (process.argv[1]?.endsWith("gen_batch68.mjs")) {
  runBatch68Muse().catch(console.error);
}
