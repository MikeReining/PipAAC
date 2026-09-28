import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_48_FILES = [
  { word: "wind", src: `${BRAIN_DIR}/batch48_wind.png` },
  { word: "cloud", src: `${BRAIN_DIR}/batch48_cloud.png` },
  { word: "moon", src: `${BRAIN_DIR}/batch48_moon.png` },
  { word: "vehicle", src: `${BRAIN_DIR}/batch48_vehicle.png` },
  { word: "car", src: `${BRAIN_DIR}/batch48_car.png` },
  { word: "truck", src: `${BRAIN_DIR}/batch48_truck.png` },
  { word: "bus", src: `${BRAIN_DIR}/batch48_bus.png` },
  { word: "train", src: `${BRAIN_DIR}/batch48_train.png` },
  { word: "airplane", src: `${BRAIN_DIR}/batch48_airplane.png` },
  { word: "boat", src: `${BRAIN_DIR}/batch48_boat.png` },
];

for (const item of BATCH_48_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_48_FILES.length} symbols in Batch 48 successfully mastered!`);
