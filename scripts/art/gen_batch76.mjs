import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH76_MUSE_ITEMS = [
  {
    rank: 90,
    word: "real",
    fileKey: "real",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction contrasting real vs fake on a pure white background. A genuine crisp red apple with a fresh green leaf sitting next to a plain wooden toy block apple. A neat green checkmark appears beside the authentic real apple. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 92,
    word: "live",
    fileKey: "live",
    framing: "full",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso standing cheerfully in front of a warm cozy house with a front door, window, and pitched roof on a pure white background. Pip is gesturing warmly with an open hand toward the home ('live here'). Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 95,
    word: "naughty",
    fileKey: "naughty",
    framing: "full",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso being cheeky and mischievous on a pure white background. Pip has a cheeky sideways smirk and is playfully tapping the top of a stacked block tower with one outstretched finger, causing the blocks to topple over with small motion lines. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 96,
    word: "number",
    fileKey: "number",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of numbers on a pure white background. Three neat colorful wooden blocks side-by-side clearly showing the numerals 1, 2, and 3, with a neat '#' number sign symbol above them. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 97,
    word: "pop",
    fileKey: "pop",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a bubble popping on a pure white background. A translucent soap bubble bursting right as a stick figure index finger touches it, with sharp comic burst sparks, droplet dots radiating outward, and action lines showing the burst '*pop*'. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 98,
    word: "hole",
    fileKey: "hole",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist 3D depiction of a circular hole in the ground on a pure white background. A neat circular ground opening viewed from an angle, with a shaded dark interior conveying depth, a defined clean rim, and two tiny pebbles beside the edge. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 99,
    word: "beep",
    fileKey: "beep",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a car horn honking 'beep' on a pure white background. A car steering wheel with a stick figure hand pressing down firmly on the center horn button, with curved sound wave vibration arcs radiating outwards. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 102,
    word: "page",
    fileKey: "page",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a book page on a pure white background. An open hardcover book resting flat, with one crisp white page actively curling and flipping over from the right side toward the left, with a subtle curved turn arrow. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 103,
    word: "fight",
    fileKey: "fight",
    framing: "full",
    social_scale: "pair",
    hint: "A clean dignified depiction of two minimalist stick figures in an athletic sparring match on a pure white background. Two stick figures facing each other in a respectful boxing stance, wearing padded red and blue boxing gloves with hands up in a sport sparring match. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 104,
    word: "story",
    fileKey: "story",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso reading a storybook on a pure white background. Pip is holding an open book, looking down with a gentle smile, while three subtle gold twinkle stars and a soft imagination swirl float up from the open pages. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch76Muse() {
  for (const item of BATCH76_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch76_muse_${item.fileKey}.png`;
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
  runBatch76Muse();
}
