import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_31_FILES = [
  { word: "playground", src: `${BRAIN_DIR}/batch31_playground.png` },
  { word: "gym", src: `${BRAIN_DIR}/batch31_gym.png` },
  { word: "cafeteria", src: `${BRAIN_DIR}/batch31_cafeteria.png` },
  { word: "library", src: `${BRAIN_DIR}/batch31_library.png` },
  { word: "hallway", src: `${BRAIN_DIR}/batch31_hallway.png` },
  { word: "desk", src: `${BRAIN_DIR}/batch31_desk.png` },
  { word: "park", src: `${BRAIN_DIR}/batch31_park.png` },
  { word: "store", src: `${BRAIN_DIR}/batch31_store.png` },
  { word: "grocery_store", src: `${BRAIN_DIR}/batch31_grocery_store.png` },
  { word: "restaurant", src: `${BRAIN_DIR}/batch31_restaurant.png` },
];

for (const item of BATCH_31_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_31_FILES.length} symbols in Batch 31 successfully mastered!`);
