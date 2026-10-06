import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const outPath = `${BRAIN_DIR}/batch74_muse_end_v2.png`;

async function reroll() {
  console.log(`[reroll] Rolling end (checkered finish flag) -> ${outPath}`);
  await generateToFile({
    word: "end",
    hint: "A clean minimalist depiction of a checkered finish flag on a pure white background. A classic black-and-white checkered racing flag waving cleanly in the wind, attached to a sleek flagpole. Bold high-contrast checkerboard pattern, pure white background, bold black outline, monoline vector clipart.",
    framing: "object",
    social_scale: "zero",
    out: outPath,
  });
  console.log("[reroll] Done!");
}

reroll();
