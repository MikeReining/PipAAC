import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH70_MUSE_ITEMS = [
  {
    rank: 21,
    word: "round",
    fileKey: "round",
    framing: "object",
    social_scale: "zero",
    hint: "A bold, vibrant blue round circle with a clean, thick black outline. A perfect round circular shape filling the center of the canvas on a pure white background. Flat solid vector appearance, bold outline, clean monoline clipart.",
  },
  {
    rank: 22,
    word: "any",
    fileKey: "any",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist graphic representing choice and 'any' on a pure white background. A horizontal row of three identical round circles: two circles have pale light gray fills with bold black outlines, and one circle has a bright blue fill with a subtle selection ring around it. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 26,
    word: "call",
    fileKey: "call",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso on a pure white background. Pip has a round white head with an open smiling mouth, calling out loud. Both hands are cupped around Pip's mouth in a universal calling out gesture ('call someone / call out loud'). Clean curved sound waves emanate forward. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 27,
    word: "day",
    fileKey: "day",
    framing: "object",
    social_scale: "zero",
    hint: "A bright daytime landscape on a pure white background, matching the style of morning and night. A brilliant round yellow cartoon sun shines in a clear light blue sky over gently rolling vibrant green hills. Bold black outline, monoline vector clipart, fills the lower canvas.",
  },
  {
    rank: 28,
    word: "shall",
    fileKey: "shall",
    framing: "bust",
    social_scale: "zero",
    torso: "pink",
    hint: "A minimalist stick figure bust with a solid pink torso on a pure white background. Pip has a friendly, cheerful proposing expression with head tilted slightly, making an inviting proposal gesture ('Shall we? / What if we...?'). Both arms are open with palms facing upward and forward in a warm, welcoming invitation. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 29,
    word: "which",
    fileKey: "which",
    framing: "bust",
    social_scale: "zero",
    torso: "pink",
    hint: "A minimalist stick figure bust with a solid pink torso on a pure white background in a thoughtful choosing pose ('which one?'). Pip is looking thoughtfully between two distinct items: a small green square on the left and a small blue circle on the right. A clean black question mark floats above. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 30,
    word: "stay",
    fileKey: "stay",
    framing: "full",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso on a pure white background. Pip is standing firmly planted in place on a bright circular floor spot marker ('stay right here / stay on your spot'). Both arms are held downward with open palms gesturing firmly down toward the floor spot, showing staying firmly in place. Bold black outline, monoline vector clipart.",
  },
];

export async function runBatch70Muse() {
  for (const item of BATCH70_MUSE_ITEMS) {
    const outFile = `${BRAIN_DIR}/batch70_muse_${item.fileKey}.png`;
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

if (process.argv[1]?.endsWith("gen_batch70.mjs")) {
  runBatch70Muse().catch(console.error);
}
