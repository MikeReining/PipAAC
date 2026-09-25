import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_22_FILES = [
  { word: "jump", src: `${BRAIN_DIR}/batch22_jump.png` },
  { word: "walk", src: `${BRAIN_DIR}/batch22_walk.png` },
  { word: "sit", src: `${BRAIN_DIR}/batch22_sit.png` },
  { word: "stand", src: `${BRAIN_DIR}/batch22_stand.png` },
  { word: "climb", src: `${BRAIN_DIR}/batch22_climb.png` },
  { word: "dance", src: `${BRAIN_DIR}/batch22_dance.png` },
  { word: "swim", src: `${BRAIN_DIR}/batch22_swim.png` },
  { word: "ride", src: `${BRAIN_DIR}/batch22_ride.png` },
  { word: "crawl", src: `${BRAIN_DIR}/batch22_crawl.png` },
  { word: "kick", src: `${BRAIN_DIR}/batch22_kick.png` },
  { word: "who", src: `${BRAIN_DIR}/who_cropped_1024.png` },
];

for (const item of BATCH_22_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_22_FILES.length} symbols in Batch 22 (plus corrected who) successfully mastered into assets/symbols/!`);
