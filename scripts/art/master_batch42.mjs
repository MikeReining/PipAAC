import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_42_FILES = [
  { word: "skirt", src: `${BRAIN_DIR}/batch42_skirt.png` },
  { word: "sweater", src: `${BRAIN_DIR}/batch42_sweater.png` },
  { word: "sweatshirt", src: `${BRAIN_DIR}/batch42_sweatshirt.png` },
  { word: "socks", src: `${BRAIN_DIR}/batch42_socks.png` },
  { word: "shoes", src: `${BRAIN_DIR}/batch42_shoes.png` },
  { word: "pajamas", src: `${BRAIN_DIR}/batch42_pajamas.png` },
  { word: "robe", src: `${BRAIN_DIR}/batch42_robe.png` },
  { word: "slippers", src: `${BRAIN_DIR}/batch42_slippers.png` },
  { word: "jacket", src: `${BRAIN_DIR}/batch42_jacket.png` },
  { word: "coat", src: `${BRAIN_DIR}/batch42_coat.png` },
];

for (const item of BATCH_42_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_42_FILES.length} symbols in Batch 42 successfully mastered!`);
