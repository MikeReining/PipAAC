import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_30_FILES = [
  { word: "home", src: `${BRAIN_DIR}/batch30_home.png` },
  { word: "house", src: `${BRAIN_DIR}/batch30_house.png` },
  { word: "bedroom", src: `${BRAIN_DIR}/batch30_bedroom.png` },
  { word: "living_room", src: `${BRAIN_DIR}/batch30_living_room.png` },
  { word: "kitchen", src: `${BRAIN_DIR}/batch30_kitchen.png` },
  { word: "basement", src: `${BRAIN_DIR}/batch30_basement.png` },
  { word: "stairs", src: `${BRAIN_DIR}/batch30_stairs.png` },
  { word: "yard", src: `${BRAIN_DIR}/batch30_yard.png` },
  { word: "school", src: `${BRAIN_DIR}/batch30_school.png` },
  { word: "classroom", src: `${BRAIN_DIR}/batch30_classroom.png` },
];

for (const item of BATCH_30_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_30_FILES.length} symbols in Batch 30 successfully mastered!`);
