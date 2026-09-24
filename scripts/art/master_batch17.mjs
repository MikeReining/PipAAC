import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_17_FILES = [
  { word: "wet_wipe", src: `${BRAIN_DIR}/batch17_wet_wipe.png` },
  { word: "bath", src: `${BRAIN_DIR}/batch17_bath.png` },
  { word: "shower", src: `${BRAIN_DIR}/batch17_shower.png` },
  { word: "soap", src: `${BRAIN_DIR}/batch17_soap.png` },
  { word: "toothbrush", src: `${BRAIN_DIR}/batch17_toothbrush.png` },
  { word: "toothpaste", src: `${BRAIN_DIR}/batch17_toothpaste.png` },
  { word: "towel", src: `${BRAIN_DIR}/batch17_towel.png` },
  { word: "comb", src: `${BRAIN_DIR}/batch17_comb.png` },
  { word: "tissue", src: `${BRAIN_DIR}/batch17_tissue.png` },
  { word: "bandage", src: `${BRAIN_DIR}/batch17_bandage.png` },
];

for (const item of BATCH_17_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log("All 10 symbols in Batch 17 successfully mastered into assets/symbols/!");
