import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_33_FILES = [
  { word: "outside", src: `${BRAIN_DIR}/batch33_outside.png` },
  { word: "inside", src: `${BRAIN_DIR}/batch33_inside.png` },
  { word: "street", src: `${BRAIN_DIR}/batch33_street.png` },
  { word: "town", src: `${BRAIN_DIR}/batch33_town.png` },
  { word: "church", src: `${BRAIN_DIR}/batch33_church.png` },
  { word: "toy", src: `${BRAIN_DIR}/batch33_toy.png` },
  { word: "ball", src: `${BRAIN_DIR}/batch33_ball.png` },
  { word: "blocks", src: `${BRAIN_DIR}/batch33_blocks.png` },
  { word: "puzzle", src: `${BRAIN_DIR}/batch33_puzzle.png` },
  { word: "doll", src: `${BRAIN_DIR}/batch33_doll.png` },
];

for (const item of BATCH_33_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_33_FILES.length} symbols in Batch 33 successfully mastered!`);
