import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH72_MUSE_ITEMS = [
  {
    rank: 41,
    word: "keep",
    fileKey: "keep",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso safely keeping a treasure on a pure white background. Pip is gently placing a bright shiny gold star into a small front pocket or holding a small open keepsake box close, safely keeping it. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 42,
    word: "lady",
    fileKey: "lady",
    framing: "bust",
    social_scale: "zero",
    torso: "yellow",
    hint: "A minimalist stick figure woman with a solid yellow dress/torso representing a lady on a pure white background. She has neatly styled hair in an elegant chignon bun and is gracefully carrying a classic dark purse handbag over her forearm. Bold black outline, round white head with gentle friendly face, pure white background, monoline vector clipart.",
  },
  {
    rank: 43,
    word: "through",
    fileKey: "through",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'through' on a pure white background, matching the style of into and around symbols. A simple hollow neutral cylindrical tube or tunnel viewed at a 3/4 angle. A bold vibrant pink arrow enters one end of the open tunnel and emerges out the far open end in a continuous path passing straight through. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 44,
    word: "stuck",
    fileKey: "stuck",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'stuck' on a pure white background. A bright red boot or shoe trapped deep inside a thick puddle of gooey brown mud. An upward motion arrow indicates pulling, with gooey mud stretching and clinging to the sole, showing the boot is stuck fast. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 45,
    word: "choo",
    fileKey: "choo",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist child depiction of 'choo' (train whistle sound) on a pure white background. A friendly cartoon steam locomotive engine viewed from the front or 3/4 angle, chugging forward with big puffy billowing white steam clouds blasting up from its smokestack with cheerful sound wave vibration lines. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 46,
    word: "use",
    fileKey: "use",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso actively using a hand saw on a pure white background. Pip is holding the handle of a classic hand saw, sawing back and forth into a wooden plank that rests on a workbench, with tiny sawdust specks showing active tool use. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 48,
    word: "guy",
    fileKey: "guy",
    framing: "bust",
    social_scale: "zero",
    torso: "yellow",
    hint: "A minimalist stick figure representing a casual guy on a pure white background. Round white head wearing a casual backwards baseball cap, friendly smile, solid yellow torso, standing in a relaxed friendly pose. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 49,
    word: "pretend",
    fileKey: "pretend",
    framing: "bust",
    social_scale: "zero",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso playing pretend on a pure white background. Pip is dressed up for imaginative play, wearing a flowing red superhero cape tied at the neck and a playful golden paper crown, holding a wooden spoon like a heroic wand or sword with a cheerful proud smile. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 50,
    word: "start",
    fileKey: "start",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist start button icon on a pure white background, designed as the direct counterpart to the stop sign. A large bold vibrant green circular button with a thick black outer border. Inside the green circle is a bold crisp white right-pointing play triangle symbol. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch72Muse() {
  for (const item of BATCH72_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch72_muse_${item.fileKey}.png`;
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
  runBatch72Muse();
}
