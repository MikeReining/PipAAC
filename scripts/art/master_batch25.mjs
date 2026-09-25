import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_25_FILES = [
  { word: "share", src: `${BRAIN_DIR}/batch25_share.png` },
  { word: "clean_up", src: `${BRAIN_DIR}/batch25_clean_up_centered.png` },
  { word: "wash", src: `${BRAIN_DIR}/batch25_wash.png` },
  { word: "wipe", src: `${BRAIN_DIR}/batch25_wipe.png` },
  { word: "cook", src: `${BRAIN_DIR}/batch25_cook_roll2.png` },
  { word: "build", src: `${BRAIN_DIR}/batch25_build.png` },
  { word: "fix", src: `${BRAIN_DIR}/batch25_fix.png` },
  { word: "hold", src: `${BRAIN_DIR}/batch25_hold.png` },
  { word: "touch", src: `${BRAIN_DIR}/batch25_touch_roll2.png` },
  { word: "know", src: `${BRAIN_DIR}/batch25_know.png` },
];

for (const item of BATCH_25_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_25_FILES.length} symbols in Batch 25 successfully mastered into assets/symbols/!`);
