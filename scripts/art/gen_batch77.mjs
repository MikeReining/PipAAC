import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH77_MUSE_ITEMS = [
  {
    rank: 100,
    word: "once",
    fileKey: "once",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'once' (one time / 1x) on a pure white background. The bold black numeral 1 enclosed inside a neat circular arrow that makes one single clean circular loop. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 101,
    word: "even",
    fileKey: "even",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'even' (equal and balanced) on a pure white background. A classic two-pan balance scale resting perfectly level and horizontal, with two identical small blue cubes of equal weight sitting on each pan. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 106,
    word: "engine",
    fileKey: "engine",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of an automotive car engine on a pure white background. A mechanical car engine block viewed from the front, showing the cylinder head, drive belt pulley wheel, and intake manifold. Crisp technical yet simple icon, bold black outline, monoline vector clipart.",
  },
  {
    rank: 107,
    word: "letter",
    fileKey: "letter",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a postal letter on a pure white background. A crisp paper mailing envelope with the flap folded closed, featuring a small square red postage stamp in the top right corner and three neat horizontal address lines. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 108,
    word: "mouse",
    fileKey: "mouse",
    framing: "object",
    social_scale: "zero",
    hint: "A clean standalone little mouse sitting upright on a pure white background. A gentle light gray field mouse in side profile with round pink-lined ears, delicate whiskers, black bead eye, and a long slender curved tail. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 110,
    word: "brush",
    fileKey: "brush",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist hairbrush on a pure white background. A classic oval hairbrush viewed at an angle, with a smooth wooden handle and neat rows of bristles. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 111,
    word: "mess",
    fileKey: "mess",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a mess on a pure white background. An untidy, chaotic pile of scattered everyday items: a jumbled sock, a crooked book, a spilled pencil, and a tipped-over toy block, with small squiggly clutter lines around them. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 112,
    word: "blow",
    fileKey: "blow",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso blowing on a pure white background. Pip in side profile with puffed-out round cheeks, exhaling a gentle visible air stream with two curved breeze wind lines radiating forward. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 114,
    word: "yum",
    fileKey: "yum",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso expressing 'yum' on a pure white background. Pip has a contented smile with closed curved eyes and tongue licking lips, rubbing belly with one circular hand motion. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 116,
    word: "star",
    fileKey: "star",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist five-pointed star on a pure white background. A bold classic star filled with warm vibrant golden yellow (#F59E0B), with crisp symmetrical points. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch77Muse() {
  for (const item of BATCH77_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch77_muse_${item.fileKey}.png`;
    if (existsSync(outPath)) {
      console.log(`[skip] Already exists: ${outPath}`);
      continue;
    }
    console.log(`[muse] Generating #${item.rank} "${item.word}" -> ${outPath}`);
    const opts = {
      word: item.word,
      hint: item.hint,
      framing: item.framing,
      social_scale: item.social_scale,
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
  runBatch77Muse();
}
