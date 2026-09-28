import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_43_FILES = [
  { word: "hat", src: `${BRAIN_DIR}/batch43_hat.png` },
  { word: "mittens", src: `${BRAIN_DIR}/batch43_mittens.png` },
  { word: "gloves", src: `${BRAIN_DIR}/batch43_gloves.png` },
  { word: "scarf", src: `${BRAIN_DIR}/batch43_scarf.png` },
  { word: "boots", src: `${BRAIN_DIR}/batch43_boots.png` },
  { word: "raincoat", src: `${BRAIN_DIR}/batch43_raincoat.png` },
  { word: "swimsuit", src: `${BRAIN_DIR}/batch43_swimsuit.png` },
  { word: "sunglasses", src: `${BRAIN_DIR}/batch43_sunglasses.png` },
  { word: "zipper", src: `${BRAIN_DIR}/batch43_zipper.png` },
  { word: "button", src: `${BRAIN_DIR}/batch43_button.png` },
];

for (const item of BATCH_43_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_43_FILES.length} symbols in Batch 43 successfully mastered!`);
