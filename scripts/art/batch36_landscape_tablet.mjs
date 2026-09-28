import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function padToSquare(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width === meta.height) return;
  const maxDim = Math.max(meta.width, meta.height);
  const buf = await sharp(filePath)
    .resize(maxDim, maxDim, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(filePath, buf);
}

async function run() {
  const out = `${BRAIN_DIR}/batch36_tablet_landscape.png`;
  console.log("Generating tablet in horizontal landscape orientation...");
  await generateToFile({
    word: "tablet",
    torso: null,
    framing: "object",
    hint: "A modern touchscreen tablet computer in horizontal landscape orientation, front-facing straight-on view: sleek black horizontal rectangular bezel surrounding a wide bright active display screen showing a colorful 4x3 grid of clean simple app icons. Symmetrical, centered, facing directly forward toward the viewer. Horizontal widescreen slate tablet, no stand feet, no keyboard, no home button, no hands, no human face, no text, no animals, no dogs, no pencils. Bold clean black outlines, modern slate styling, pure white background.",
    out,
  });
  await padToSquare(out);
  console.log("Landscape tablet generated!");

  // Copy to active batch files
  copyFileSync(out, `${BRAIN_DIR}/batch36_v2_tablet.png`);
  copyFileSync(out, `${BRAIN_DIR}/batch36_tablet.png`);
}

run().catch((err) => {
  console.error("Landscape tablet generation failed:", err);
  process.exit(1);
});
