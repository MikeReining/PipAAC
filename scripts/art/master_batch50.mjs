import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_50_FILES = [
  { word: "ship", src: `${BRAIN_DIR}/batch50_ship.png` },
  { word: "canoe", src: `${BRAIN_DIR}/batch50_canoe.png` },
  { word: "subway", src: `${BRAIN_DIR}/batch50_subway.png` },
  { word: "road", src: `${BRAIN_DIR}/batch50_road.png` },
  { word: "track", src: `${BRAIN_DIR}/batch50_track.png` },
  { word: "stoplight", src: `${BRAIN_DIR}/batch50_stoplight.png` },
  { word: "gas_station", alt: "gas station", src: `${BRAIN_DIR}/batch50_gas_station.png` },
];

for (const item of BATCH_50_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);

  if (item.alt) {
    copyFileSync(item.src, join(SYMBOLS_DIR, `${item.alt}.png`));
    copyFileSync(item.src, join(PUBLIC_SYMBOLS_DIR, `${item.alt}.png`));
    console.log(`Copied ${item.alt}.png -> assets/symbols & public/symbols (alias)`);
  }
}

console.log(`\nAll ${BATCH_50_FILES.length} symbols in Batch 50 successfully mastered!`);
