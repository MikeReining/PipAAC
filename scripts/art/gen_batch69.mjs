import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH69_MUSE_ITEMS = [
  {
    rank: 11,
    word: "bit",
    fileKey: "bit",
    framing: "bust",
    social_scale: "zero",
    torso: "blue",
    hint: "A minimalist stick figure bust on a pure white background. The figure is holding up one hand with the thumb and index finger held very close together in a universal 'tiny bit' pinch gesture, showing a tiny gap. Pip has a pleasant, focused expression looking toward the hand. Two tiny dashed black indicator lines bracket the small gap between the fingertips. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 12,
    word: "time",
    fileKey: "time",
    framing: "bust",
    social_scale: "zero",
    torso: "blue",
    hint: "A minimalist stick figure bust on a pure white background. Pip has a round white head, dot eyes, friendly expression. Pip is lifting one arm wearing a simple round wristwatch, and pointing with the other index finger directly at the watch face in the universal 'what time is it / it is time' gesture. The watch face is clean and legible with black hands. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 13,
    word: "move",
    fileKey: "move",
    framing: "full",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso in dynamic sideways motion across a pure white background. The figure is shifting or sliding energetically from left to right, with a bold bright green directional arrow pointing right and clean horizontal motion speed streaks trailing behind. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 14,
    word: "dear",
    fileKey: "dear",
    framing: "bust",
    social_scale: "zero",
    torso: "pink",
    hint: "A minimalist stick figure bust with a solid pink torso on a pure white background, expressing gentle sympathetic dismay ('Oh dear!'). Both hands are raised and resting against the cheeks or side of face. Gentle curved eyebrows showing mild concern, soft small rounded mouth, head tilted slightly in an empathetic, sympathetic 'oh dear' gesture. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 16,
    word: "nice",
    fileKey: "nice",
    framing: "full",
    social_scale: "zero",
    torso: "yellow",
    hint: "A minimalist stick figure with a solid yellow torso kneeling or standing gently beside a cute, smiling little puppy or kitten. Pip has a warm, caring smile and is gently stroking the small pet's head with one hand ('be nice / nice hands'). The little puppy is happily wagging its tail with pleasant smile. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 17,
    word: "about",
    fileKey: "about",
    framing: "bust",
    social_scale: "zero",
    torso: "blue",
    hint: "A minimalist stick figure bust on a pure white background in a thoughtful pondering pose ('talk about / think about'). Pip is looking upward with a friendly curious expression. Floating in the upper corner is a clean speech bubble containing a circular curved orbiting arrow loop with a small question mark in the center. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 19,
    word: "mean",
    fileKey: "mean",
    framing: "bust",
    social_scale: "zero",
    torso: "orange",
    hint: "A minimalist stick figure bust on a pure white background expressing an unkind, grumpy attitude ('that is mean / do not be mean'). Pip has arms crossed over the chest with slightly furrowed slanted eyebrows and a grumpy scowl, turned slightly sideways in a huffy posture. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: "ref_bath",
    word: "bathroom",
    fileKey: "bathroom",
    framing: "full",
    social_scale: "zero",
    hint: "A clean, friendly, minimalist cartoon interior of a home bathroom on a pure white background. On the left is a bold porcelain white toilet with seat and water tank. Next to it on the right is a clean white pedestal sink with a curved chrome faucet and a neat rectangular mirror above it on the wall, with a small soft blue hand towel hanging beside the sink. The fixtures fill 85% of the square canvas, with bold black outlines, simple clean fills, monoline vector clipart.",
  },
  {
    rank: "ref_nap",
    word: "naptime",
    fileKey: "naptime",
    framing: "full",
    social_scale: "zero",
    hint: "A minimalist stick figure taking a cozy afternoon nap on a warm living room sofa on a pure white background. Pip is curled up asleep on the comfortable couch, head resting on a soft fluffy pillow against the sofa armrest, smiling peacefully with closed eyes under a light cozy pastel blanket. In the upper corner, a bright friendly yellow cartoon sun shines warm gentle daylight rays. Cozy daytime nap, fills the square canvas, bold black outlines, clean monoline vector clipart.",
  },
];

export async function runBatch69Muse() {
  for (const item of BATCH69_MUSE_ITEMS) {
    const outFile = `${BRAIN_DIR}/batch69_muse_${item.fileKey}.png`;
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

if (process.argv[1]?.endsWith("gen_batch69.mjs")) {
  runBatch69Muse().catch(console.error);
}
