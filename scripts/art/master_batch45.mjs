import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_45_FILES = [
  { word: "duck", src: `${BRAIN_DIR}/batch45_duck.png` },
  { word: "hen", src: `${BRAIN_DIR}/batch45_hen.png` },
  { word: "cow", src: `${BRAIN_DIR}/batch45_cow.png` },
  { word: "horse", src: `${BRAIN_DIR}/batch45_horse.png` },
  { word: "pig", src: `${BRAIN_DIR}/batch45_pig.png` },
  { word: "sheep", src: `${BRAIN_DIR}/batch45_sheep.png` },
  { word: "goat", src: `${BRAIN_DIR}/batch45_goat.png` },
  { word: "bear", src: `${BRAIN_DIR}/batch45_bear.png` },
  { word: "lion", src: `${BRAIN_DIR}/batch45_lion.png` },
  { word: "tiger", src: `${BRAIN_DIR}/batch45_tiger.png` },
];

for (const item of BATCH_45_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_45_FILES.length} symbols in Batch 45 successfully mastered!`);
