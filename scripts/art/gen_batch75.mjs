import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH75_MUSE_ITEMS = [
  {
    rank: 74,
    word: "buy",
    fileKey: "buy",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of the action 'buy' on a pure white background. A stick figure hand handing a crisp green dollar bill across a checkout counter to pay for a neat item. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 77,
    word: "room",
    fileKey: "room",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of an interior bedroom on a pure white background. An open doorway looking into a tidy room showing a simple bed with a pillow, a small nightstand, and a square window with bright daylight. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 79,
    word: "knock",
    fileKey: "knock",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of knocking on a door on a pure white background. A stick figure hand with a closed fist firmly rapping against the wooden panel of a door, with two neat curved sound vibration arcs showing the sound of knocking. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 81,
    word: "rabbit",
    fileKey: "rabbit",
    framing: "object",
    social_scale: "zero",
    hint: "A clean standalone bunny rabbit sitting upright on a pure white background. Naturalistic, gentle hare with long soft upright ears, small pink nose, and fluffy tail. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 82,
    word: "stuff",
    fileKey: "stuff",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of personal belongings ('stuff') on a pure white background. A neat open shallow storage box holding a mix of everyday personal items: a notebook, a coffee mug, a set of keys, and a pen. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 83,
    word: "reach",
    fileKey: "reach",
    framing: "full",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso standing on tiptoes on a pure white background. Pip is stretching one arm high upward, reaching toward a red apple resting on a tall shelf. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 84,
    word: "side",
    fileKey: "side",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist 3D isometric cube on a pure white background. The front face and top face of the cube are neutral pale light gray with a black outline. Only the right lateral side face is filled with vibrant solid blue, highlighting the side. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 86,
    word: "floor",
    fileKey: "floor",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of an interior wooden plank floor on a pure white background. Horizontal floor planks with wood grain lines, with a neat bold black arrow pointing directly down at the flat ground surface. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 89,
    word: "roll",
    fileKey: "roll",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of rolling on a pure white background. A bright red sphere rolling forward along a horizontal ground line, accompanied by a clean curved circular motion swoosh arrow indicating forward rolling rotation. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 91,
    word: "crash",
    fileKey: "crash",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a car crash on a pure white background. Two passenger cars collided head-on at an angle, with a crumpled front bumper, a cracked spiderweb fracture line on the windshield, and impact lines between the smashed front ends. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch75Muse() {
  for (const item of BATCH75_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch75_muse_${item.fileKey}.png`;
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
  runBatch75Muse();
}
