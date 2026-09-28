import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_37_FILES = [
  { word: "markers", src: `${BRAIN_DIR}/batch37_markers.png` },
  { word: "crayons", src: `${BRAIN_DIR}/batch37_crayons.png` },
  { word: "book", src: `${BRAIN_DIR}/batch37_book.png` },
  { word: "chair", src: `${BRAIN_DIR}/batch37_chair.png` },
  { word: "couch", src: `${BRAIN_DIR}/batch37_couch.png` },
  { word: "table", src: `${BRAIN_DIR}/batch37_table.png` },
  { word: "bed", src: `${BRAIN_DIR}/batch37_bed.png` },
  { word: "door", src: `${BRAIN_DIR}/batch37_door.png` },
  { word: "window", src: `${BRAIN_DIR}/batch37_window.png` },
  { word: "lamp", src: `${BRAIN_DIR}/batch37_lamp.png` },
];

for (const item of BATCH_37_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_37_FILES.length} symbols in Batch 37 successfully mastered!`);
