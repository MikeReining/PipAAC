import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_6_FILES = [
  { word: "it", src: `${BRAIN_DIR}/batch6_it.png` },
  { word: "that", src: `${BRAIN_DIR}/batch6_that_white.png` },
  { word: "here", src: `${BRAIN_DIR}/batch6_here_white.png` },
  { word: "there", src: `${BRAIN_DIR}/batch6_there_white.png` },
  { word: "all", src: `${BRAIN_DIR}/batch6_all_reroll.png` },
  { word: "some", src: `${BRAIN_DIR}/batch6_some_reroll.png` },
  { word: "with", src: `${BRAIN_DIR}/batch6_with.png` },
  { word: "what", src: `${BRAIN_DIR}/batch6_what.png` },
  { word: "where", src: `${BRAIN_DIR}/batch6_where.png` },
  { word: "why", src: `${BRAIN_DIR}/batch6_why.png` },
  { word: "when", src: `${BRAIN_DIR}/batch6_when.png` },
];

for (const item of BATCH_6_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log("All 11 symbols successfully mastered into assets/symbols/!");
