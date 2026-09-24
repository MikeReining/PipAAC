import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_16_FILES = [
  { word: "tummy", src: `${BRAIN_DIR}/batch16_tummy.png` },
  { word: "back", src: `${BRAIN_DIR}/batch16_back.png` },
  { word: "leg", src: `${BRAIN_DIR}/batch16_leg.png` },
  { word: "knee", src: `${BRAIN_DIR}/batch16_knee.png` },
  { word: "foot", src: `${BRAIN_DIR}/batch16_foot.png` },
  { word: "toes", src: `${BRAIN_DIR}/batch16_toes.png` },
  { word: "bathroom", src: `${BRAIN_DIR}/batch16_bathroom.png` },
  { word: "potty", src: `${BRAIN_DIR}/batch16_potty.png` },
  { word: "toilet", src: `${BRAIN_DIR}/batch16_toilet.png` },
  { word: "diaper", src: `${BRAIN_DIR}/batch16_diaper.png` },
];

for (const item of BATCH_16_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log("All 10 symbols in Batch 16 successfully mastered into assets/symbols/!");
