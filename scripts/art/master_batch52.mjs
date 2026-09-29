import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_52_FILES = [
  { word: "fast", src: `${BRAIN_DIR}/batch52_fast.png` },
  { word: "slow", src: `${BRAIN_DIR}/batch52_slow.png` },
  { word: "tall", src: `${BRAIN_DIR}/batch52_tall.png` },
  { word: "short", src: `${BRAIN_DIR}/batch52_short.png` },
  { word: "long", src: `${BRAIN_DIR}/batch52_long.png` },
  { word: "heavy", src: `${BRAIN_DIR}/batch52_heavy.png` },
  { word: "light", src: `${BRAIN_DIR}/batch52_light.png` },
  { word: "thick", src: `${BRAIN_DIR}/batch52_thick.png` },
  { word: "thin", src: `${BRAIN_DIR}/batch52_thin.png` },
  { word: "wide", src: `${BRAIN_DIR}/batch52_wide.png` },
];

for (const item of BATCH_52_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_52_FILES.length} symbols in Batch 52 successfully mastered!`);
