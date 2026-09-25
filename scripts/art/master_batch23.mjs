import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_23_FILES = [
  { word: "throw", src: `${BRAIN_DIR}/batch23_throw.png` },
  { word: "catch", src: `${BRAIN_DIR}/batch23_catch.png` },
  { word: "push", src: `${BRAIN_DIR}/batch23_push.png` },
  { word: "pull", src: `${BRAIN_DIR}/batch23_pull.png` },
  { word: "swing", src: `${BRAIN_DIR}/batch23_swing.png` },
  { word: "slide", src: `${BRAIN_DIR}/batch23_slide.png` },
  { word: "fall", src: `${BRAIN_DIR}/batch23_fall.png` },
  { word: "carry", src: `${BRAIN_DIR}/batch23_carry.png` },
  { word: "drop", src: `${BRAIN_DIR}/batch23_drop.png` },
  { word: "write", src: `${BRAIN_DIR}/batch23_write.png` },
];

for (const item of BATCH_23_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_23_FILES.length} symbols in Batch 23 successfully mastered into assets/symbols/!`);
