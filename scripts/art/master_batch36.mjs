import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_36_FILES = [
  { word: "tablet", src: `${BRAIN_DIR}/batch36_tablet.png` },
  { word: "ipad", src: `${BRAIN_DIR}/batch36_ipad.png` },
  { word: "phone", src: `${BRAIN_DIR}/batch36_phone.png` },
  { word: "tv", src: `${BRAIN_DIR}/batch36_tv.png` },
  { word: "movie", src: `${BRAIN_DIR}/batch36_movie.png` },
  { word: "video", src: `${BRAIN_DIR}/batch36_video.png` },
  { word: "headphones", src: `${BRAIN_DIR}/batch36_headphones.png` },
  { word: "computer", src: `${BRAIN_DIR}/batch36_computer.png` },
  { word: "camera", src: `${BRAIN_DIR}/batch36_camera.png` },
  { word: "paper", src: `${BRAIN_DIR}/batch36_paper.png` },
];

for (const item of BATCH_36_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_36_FILES.length} symbols in Batch 36 successfully mastered!`);
