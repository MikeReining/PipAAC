import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_47_FILES = [
  { word: "frog", src: `${BRAIN_DIR}/batch47_frog.png` },
  { word: "bug", src: `${BRAIN_DIR}/batch47_bug.png` },
  { word: "spider", src: `${BRAIN_DIR}/batch47_spider.png` },
  { word: "butterfly", src: `${BRAIN_DIR}/batch47_butterfly.png` },
  { word: "tree", src: `${BRAIN_DIR}/batch47_tree.png` },
  { word: "grass", src: `${BRAIN_DIR}/batch47_grass.png` },
  { word: "flower", src: `${BRAIN_DIR}/batch47_flower.png` },
  { word: "sun", src: `${BRAIN_DIR}/batch47_sun.png` },
  { word: "rain", src: `${BRAIN_DIR}/batch47_rain.png` },
  { word: "snow", src: `${BRAIN_DIR}/batch47_snow.png` },
];

for (const item of BATCH_47_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_47_FILES.length} symbols in Batch 47 successfully mastered!`);
