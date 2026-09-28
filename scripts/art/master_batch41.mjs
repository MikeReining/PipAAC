import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_41_FILES = [
  { word: "sponge", src: `${BRAIN_DIR}/batch41_sponge.png` },
  { word: "tape", src: `${BRAIN_DIR}/batch41_tape.png` },
  { word: "flashlight", src: `${BRAIN_DIR}/batch41_flashlight.png` },
  { word: "bucket", src: `${BRAIN_DIR}/batch41_bucket.png` },
  { word: "paper towel", src: `${BRAIN_DIR}/batch41_paper towel.png` },
  { word: "shirt", src: `${BRAIN_DIR}/batch41_shirt.png` },
  { word: "pants", src: `${BRAIN_DIR}/batch41_pants.png` },
  { word: "shorts", src: `${BRAIN_DIR}/batch41_shorts.png` },
  { word: "underwear", src: `${BRAIN_DIR}/batch41_underwear.png` },
  { word: "dress", src: `${BRAIN_DIR}/batch41_dress.png` },
];

for (const item of BATCH_41_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_41_FILES.length} symbols in Batch 41 successfully mastered!`);
