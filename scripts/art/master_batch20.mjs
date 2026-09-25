import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_20_FILES = [
  { word: "lonely", src: `${BRAIN_DIR}/batch20_lonely.png` },
  { word: "hungry", src: `${BRAIN_DIR}/batch20_hungry.png` },
  { word: "thirsty", src: `${BRAIN_DIR}/batch20_thirsty.png` },
  { word: "tired", src: `${BRAIN_DIR}/batch20_tired.png` },
  { word: "sleepy", src: `${BRAIN_DIR}/batch20_sleepy.png` },
  { word: "energetic", src: `${BRAIN_DIR}/batch20_energetic.png` },
  { word: "hot", src: `${BRAIN_DIR}/batch20_hot.png` },
  { word: "cold", src: `${BRAIN_DIR}/batch20_cold.png` },
  { word: "dizzy", src: `${BRAIN_DIR}/batch20_dizzy.png` },
  { word: "loud", src: `${BRAIN_DIR}/batch20_loud.png` },
  { word: "headache", src: `${BRAIN_DIR}/batch20_headache.png` },
  { word: "cozy", src: `${BRAIN_DIR}/batch20_cozy.png` },
];

for (const item of BATCH_20_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_20_FILES.length} symbols in Batch 20 successfully mastered into assets/symbols/!`);
