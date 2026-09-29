import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_51_FILES = [
  { word: "red", src: `${BRAIN_DIR}/batch51_red.png` },
  { word: "blue", src: `${BRAIN_DIR}/batch51_blue.png` },
  { word: "green", src: `${BRAIN_DIR}/batch51_green.png` },
  { word: "yellow", src: `${BRAIN_DIR}/batch51_yellow.png` },
  { word: "orange", src: `${BRAIN_DIR}/batch51_orange.png` },
  { word: "purple", src: `${BRAIN_DIR}/batch51_purple.png` },
  { word: "pink", src: `${BRAIN_DIR}/batch51_pink.png` },
  { word: "brown", src: `${BRAIN_DIR}/batch51_brown.png` },
  { word: "black", src: `${BRAIN_DIR}/batch51_black.png` },
  { word: "white", src: `${BRAIN_DIR}/batch51_white.png` },
];

for (const item of BATCH_51_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_51_FILES.length} symbols in Batch 51 successfully mastered!`);
