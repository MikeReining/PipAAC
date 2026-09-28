import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_38_FILES = [
  { word: "clock", src: `${BRAIN_DIR}/batch38_clock.png` },
  { word: "trash", src: `${BRAIN_DIR}/batch38_trash.png` },
  { word: "sink", src: `${BRAIN_DIR}/batch38_sink.png` },
  { word: "mirror", src: `${BRAIN_DIR}/batch38_mirror.png` },
  { word: "rug", src: `${BRAIN_DIR}/batch38_rug.png` },
  { word: "plate", src: `${BRAIN_DIR}/batch38_plate.png` },
  { word: "bowl", src: `${BRAIN_DIR}/batch38_bowl.png` },
  { word: "cup", src: `${BRAIN_DIR}/batch38_cup.png` },
  { word: "fork", src: `${BRAIN_DIR}/batch38_fork.png` },
  { word: "spoon", src: `${BRAIN_DIR}/batch38_spoon.png` },
];

for (const item of BATCH_38_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_38_FILES.length} symbols in Batch 38 successfully mastered!`);
