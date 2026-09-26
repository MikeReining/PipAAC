import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_32_FILES = [
  { word: "pool", src: `${BRAIN_DIR}/batch32_pool.png` },
  { word: "beach", src: `${BRAIN_DIR}/batch32_beach.png` },
  { word: "zoo", src: `${BRAIN_DIR}/batch32_zoo.png` },
  { word: "doctor_office", src: `${BRAIN_DIR}/batch32_doctor_office.png` },
  { word: "hospital", src: `${BRAIN_DIR}/batch32_hospital.png` },
  { word: "museum", src: `${BRAIN_DIR}/batch32_museum.png` },
  { word: "movie_theater", src: `${BRAIN_DIR}/batch32_movie_theater.png` },
  { word: "mall", src: `${BRAIN_DIR}/batch32_mall.png` },
  { word: "farm", src: `${BRAIN_DIR}/batch32_farm.png` },
  { word: "airport", src: `${BRAIN_DIR}/batch32_airport.png` },
];

for (const item of BATCH_32_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_32_FILES.length} symbols in Batch 32 successfully mastered!`);
