import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_29_FILES = [
  { word: "doctor", src: `${BRAIN_DIR}/batch29_doctor.png` },
  { word: "nurse", src: `${BRAIN_DIR}/batch29_nurse.png` },
  { word: "babysitter", src: `${BRAIN_DIR}/batch29_babysitter.png` },
  { word: "firefighter", src: `${BRAIN_DIR}/batch29_firefighter.png` },
  { word: "police_officer", src: `${BRAIN_DIR}/batch29_police_officer.png` },
  { word: "bus_driver", src: `${BRAIN_DIR}/batch29_bus_driver.png` },
  { word: "kids", src: `${BRAIN_DIR}/batch29_kids.png` },
  { word: "name", src: `${BRAIN_DIR}/batch29_name.png` },
  { word: "man", src: `${BRAIN_DIR}/batch29_man.png` },
  { word: "woman", src: `${BRAIN_DIR}/batch29_woman.png` },
];

for (const item of BATCH_29_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

// Zero-spend aliases for boy and girl
for (const [alias, canonical] of [["boy", "he"], ["girl", "she"]]) {
  const srcAsset = join(SYMBOLS_DIR, `${canonical}.png`);
  if (existsSync(srcAsset)) {
    copyFileSync(srcAsset, join(SYMBOLS_DIR, `${alias}.png`));
    copyFileSync(srcAsset, join(PUBLIC_SYMBOLS_DIR, `${alias}.png`));
    console.log(`Aliased ${alias}.png -> ${canonical}.png`);
  }
}

console.log(`\nAll ${BATCH_29_FILES.length} symbols in Batch 29 successfully mastered!`);
