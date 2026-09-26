import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const LANDSCAPE_FILES = [
  "family",
  "brother",
  "sister",
  "pet",
  "teacher",
  "friend",
];

async function squareImages() {
  console.log("Padding 3:2 landscape images to 1:1 square (1920x1920)...");
  for (const name of LANDSCAPE_FILES) {
    const file = `${BRAIN_DIR}/batch27_${name}.png`;
    const meta = await sharp(file).metadata();
    if (meta.width === meta.height) {
      console.log(`${name} is already square (${meta.width}x${meta.height}). Skipping.`);
      continue;
    }
    const maxDim = Math.max(meta.width, meta.height);
    const buf = await sharp(file)
      .resize(maxDim, maxDim, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
    writeFileSync(file, buf);
    console.log(`Padded ${name} from ${meta.width}x${meta.height} -> ${maxDim}x${maxDim}`);
  }
}

squareImages().catch((err) => {
  console.error("Error squaring images:", err);
  process.exit(1);
});
