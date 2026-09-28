import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_39_FILES = [
  { word: "knife", src: `${BRAIN_DIR}/batch39_knife.png` },
  { word: "napkin", src: `${BRAIN_DIR}/batch39_napkin.png` },
  { word: "bottle", src: `${BRAIN_DIR}/batch39_bottle.png` },
  { word: "straw", src: `${BRAIN_DIR}/batch39_straw.png` },
  { word: "fridge", src: `${BRAIN_DIR}/batch39_fridge.png` },
  { word: "microwave", src: `${BRAIN_DIR}/batch39_microwave.png` },
  { word: "backpack", src: `${BRAIN_DIR}/batch39_backpack.png` },
  { word: "bag", src: `${BRAIN_DIR}/batch39_bag.png` },
  { word: "keys", src: `${BRAIN_DIR}/batch39_keys.png` },
  { word: "wallet", src: `${BRAIN_DIR}/batch39_wallet.png` },
];

for (const item of BATCH_39_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_39_FILES.length} symbols in Batch 39 successfully mastered!`);
