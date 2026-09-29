import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_49_FILES = [
  { word: "fire_truck", alt: "fire truck", src: `${BRAIN_DIR}/batch49_fire_truck.png` },
  { word: "police_car", alt: "police car", src: `${BRAIN_DIR}/batch49_police_car.png` },
  { word: "ambulance", src: `${BRAIN_DIR}/batch49_ambulance.png` },
  { word: "bicycle", src: `${BRAIN_DIR}/batch49_bicycle.png` },
  { word: "motorcycle", src: `${BRAIN_DIR}/batch49_motorcycle.png` },
  { word: "van", src: `${BRAIN_DIR}/batch49_van.png` },
  { word: "tractor", src: `${BRAIN_DIR}/batch49_tractor.png` },
  { word: "stroller", src: `${BRAIN_DIR}/batch49_stroller.png` },
  { word: "helicopter", src: `${BRAIN_DIR}/batch49_helicopter.png` },
  { word: "rocket", src: `${BRAIN_DIR}/batch49_rocket.png` },
];

for (const item of BATCH_49_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);

  if (item.alt) {
    copyFileSync(item.src, join(SYMBOLS_DIR, `${item.alt}.png`));
    copyFileSync(item.src, join(PUBLIC_SYMBOLS_DIR, `${item.alt}.png`));
    console.log(`Copied ${item.alt}.png -> assets/symbols & public/symbols (alias)`);
  }
}

console.log(`\nAll ${BATCH_49_FILES.length} symbols in Batch 49 successfully mastered!`);
