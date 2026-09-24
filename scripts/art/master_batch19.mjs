import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_19_FILES = [
  { word: "scared", src: `${BRAIN_DIR}/batch19_scared.png` },
  { word: "excited", src: `${BRAIN_DIR}/batch19_excited.png` },
  { word: "silly", src: `${BRAIN_DIR}/batch19_silly.png` },
  { word: "nervous", src: `${BRAIN_DIR}/batch19_nervous.png` },
  { word: "calm", src: `${BRAIN_DIR}/batch19_calm.png` },
  { word: "frustrated", src: `${BRAIN_DIR}/batch19_frustrated.png` },
  { word: "proud", src: `${BRAIN_DIR}/batch19_proud.png` },
  { word: "shy", src: `${BRAIN_DIR}/batch19_shy.png` },
  { word: "surprised", src: `${BRAIN_DIR}/batch19_surprised.png` },
  { word: "bored", src: `${BRAIN_DIR}/batch19_bored.png` },
];

for (const item of BATCH_19_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log("All 10 symbols in Batch 19 successfully mastered into assets/symbols/!");
