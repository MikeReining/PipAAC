import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_40_FILES = [
  { word: "glasses", src: `${BRAIN_DIR}/batch40_glasses.png` },
  { word: "umbrella", src: `${BRAIN_DIR}/batch40_umbrella.png` },
  { word: "blanket", src: `${BRAIN_DIR}/batch40_blanket.png` },
  { word: "pillow", src: `${BRAIN_DIR}/batch40_pillow.png` },
  { word: "fan", src: `${BRAIN_DIR}/batch40_fan.png` },
  { word: "charger", src: `${BRAIN_DIR}/batch40_charger.png` },
  { word: "box", src: `${BRAIN_DIR}/batch40_box.png` },
  { word: "battery", src: `${BRAIN_DIR}/batch40_battery.png` },
  { word: "broom", src: `${BRAIN_DIR}/batch40_broom.png` },
  { word: "vacuum", src: `${BRAIN_DIR}/batch40_vacuum.png` },
];

for (const item of BATCH_40_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_40_FILES.length} symbols in Batch 40 successfully mastered!`);
