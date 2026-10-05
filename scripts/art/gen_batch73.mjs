import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH73_MUSE_ITEMS = [
  {
    rank: 52,
    word: "else",
    fileKey: "else",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'else' (the alternative option) on a pure white background. Two rectangular cards side by side. The left card is dimmed neutral light gray with a simple subtle red 'X' mark. The right card is highlighted in bright vibrant solid blue. A bold smooth black curved arrow arches cleanly from the top of the gray card over to point directly at the blue card. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 54,
    word: "drive",
    fileKey: "drive",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso pretend driving a car on a pure white background. Pip is smiling happily, holding a clean round black steering wheel in both hands in front of the chest, actively turning it. A couple of subtle horizontal motion breeze lines on the side convey driving forward. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 55,
    word: "fly",
    fileKey: "fly",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso pretend flying like an airplane on a pure white background. Pip is tilted forward joyfully with both arms outstretched wide to the sides like airplane wings, smiling happily with eyes open, accompanied by two clean curved wind gust swoosh lines. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 56,
    word: "bang",
    fileKey: "bang",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of the sound and action 'bang' on a pure white background. A wooden toy mallet striking down onto the top of a bright red drum head, creating an energetic comic starburst impact burst shape and vibration arcs at the point of impact. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 57,
    word: "stick",
    fileKey: "stick",
    framing: "object",
    social_scale: "zero",
    hint: "A clean standalone wooden tree stick with a small green leaf twig on a pure white background. Bold black outline, warm storybook vector clipart.",
  },
  {
    rank: 58,
    word: "money",
    fileKey: "money",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of money on a pure white background. A crisp green rectangular paper dollar bill resting neatly next to a shiny round gold coin. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 59,
    word: "bring",
    fileKey: "bring",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso carrying and delivering items on a pure white background. Pip is smiling and stepping forward toward the viewer, holding a neat serving tray with both hands. Resting on the tray is a bright blue drinking cup and a small bowl. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 60,
    word: "game",
    fileKey: "game",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a board game on a pure white background. A winding game board path with colorful square spaces, a single red pawn playing piece standing on a space, and a pair of white dice with black dots resting nearby. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 61,
    word: "lot",
    fileKey: "lot",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'a lot' on a pure white background, matching the blue quantifier family style. A large abundant neat pyramid pile of vibrant blue toy blocks stacked high and wide, filled with many blocks. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 62,
    word: "much",
    fileKey: "much",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'much' on a pure white background, matching the blue quantifier family style. A clear measuring cup with measurement tick marks, filled high with vibrant blue liquid all the way up to the very top measurement line, representing a large volume. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch73Muse() {
  for (const item of BATCH73_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch73_muse_${item.fileKey}.png`;
    if (existsSync(outPath)) {
      console.log(`[skip] Already exists: ${outPath}`);
      continue;
    }
    console.log(`[muse] Generating #${item.rank} "${item.word}" -> ${outPath}`);
    const opts = {
      word: item.word,
      hint: item.hint,
      framing: item.framing,
      out: outPath,
    };
    if (item.torso) opts.torso = item.torso;
    try {
      await generateToFile(opts);
      console.log(`[muse] Done: ${item.word}`);
    } catch (err) {
      console.error(`[muse] Failed for ${item.word}:`, err);
    }
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runBatch73Muse();
}
