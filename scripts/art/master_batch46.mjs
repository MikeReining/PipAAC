import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_46_FILES = [
  { word: "elephant", src: `${BRAIN_DIR}/batch46_elephant.png` },
  { word: "monkey", src: `${BRAIN_DIR}/batch46_monkey.png` },
  { word: "giraffe", src: `${BRAIN_DIR}/batch46_giraffe.png` },
  { word: "zebra", src: `${BRAIN_DIR}/batch46_zebra.png` },
  { word: "hippo", src: `${BRAIN_DIR}/batch46_hippo.png` },
  { word: "penguin", src: `${BRAIN_DIR}/batch46_penguin.png` },
  { word: "dolphin", src: `${BRAIN_DIR}/batch46_dolphin.png` },
  { word: "whale", src: `${BRAIN_DIR}/batch46_whale.png` },
  { word: "snake", src: `${BRAIN_DIR}/batch46_snake.png` },
  { word: "turtle", src: `${BRAIN_DIR}/batch46_turtle.png` },
];

for (const item of BATCH_46_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_46_FILES.length} symbols in Batch 46 successfully mastered!`);
