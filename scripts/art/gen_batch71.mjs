import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH71_MUSE_ITEMS = [
  {
    rank: 31,
    word: "hear",
    fileKey: "hear",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist ear icon with concentric sound waves entering it on a pure white background. The ear has a bold black outline and clean beige/skin fill, shown in side profile. Three clean curved green sound waves radiate toward and enter the ear canal. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 32,
    word: "into",
    fileKey: "into",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'into' on a pure white background, matching the style of the in symbol. A simple open brown cardboard box viewed from a 3/4 angle. A bold pink arrow starts outside and arches smoothly downward, pointing directly into the interior of the open box. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 33,
    word: "top",
    fileKey: "top",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'top' on a pure white background. A neat vertical stack of three wooden toy blocks. The topmost block is highlighted in vibrant blue or pink with a clean arrow or indicator pointing directly to the very top surface. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 34,
    word: "around",
    fileKey: "around",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'around' on a pure white background. A central solid cube or cylinder with a bold pink curved loop arrow encircling all the way around the object in a smooth 3D orbit path. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 35,
    word: "birthday",
    fileKey: "birthday",
    framing: "object",
    social_scale: "zero",
    hint: "A celebratory birthday icon on a pure white background. A delicious decorated birthday cake with glowing lit candles on top, next to a festive striped conical birthday party hat and cheerful confetti specks. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 36,
    word: "pick",
    fileKey: "pick",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'pick' on a pure white background. Pip's clean stick figure hand reaching down to pick and lift a single bright red apple from a bowl or branch, lifting it upward in a clear picking action. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 37,
    word: "hide",
    fileKey: "hide",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso playing hide and seek ('hide') on a pure white background. Pip is playfully peeking out from behind a vertical white wall or tree trunk, both hands gripping the edge, round white head and curious eyes peeking around the corner. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 38,
    word: "noise",
    fileKey: "noise",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso on a pure white background reacting to loud noise. Pip has eyes squeezed shut and mouth in a wincing grimace, clamping both hands firmly over Pip's ears to block out the loud sound. Jagged red or orange sound burst lines radiate around the sides. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch71Muse() {
  for (const item of BATCH71_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch71_muse_${item.fileKey}.png`;
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
  runBatch71Muse();
}
