import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_27_FILES = [
  { word: "wake_up", src: `${BRAIN_DIR}/batch27_wake_up.png` },
  { word: "family", src: `${BRAIN_DIR}/batch27_family.png` },
  { word: "baby", src: `${BRAIN_DIR}/batch27_baby.png` },
  { word: "brother", src: `${BRAIN_DIR}/batch27_brother.png` },
  { word: "sister", src: `${BRAIN_DIR}/batch27_sister.png` },
  { word: "grandma", src: `${BRAIN_DIR}/batch27_grandma.png` },
  { word: "grandpa", src: `${BRAIN_DIR}/batch27_grandpa.png` },
  { word: "pet", src: `${BRAIN_DIR}/batch27_pet.png` },
  { word: "teacher", src: `${BRAIN_DIR}/batch27_teacher.png` },
  { word: "friend", src: `${BRAIN_DIR}/batch27_friend.png` },
];

for (const item of BATCH_27_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

// Zero-spend aliases for mama and dada
for (const [alias, canonical] of [["mama", "mom"], ["dada", "dad"]]) {
  const srcAsset = join(SYMBOLS_DIR, `${canonical}.png`);
  if (existsSync(srcAsset)) {
    copyFileSync(srcAsset, join(SYMBOLS_DIR, `${alias}.png`));
    copyFileSync(srcAsset, join(PUBLIC_SYMBOLS_DIR, `${alias}.png`));
    console.log(`Aliased ${alias}.png -> ${canonical}.png`);
  }
}

console.log(`\nAll ${BATCH_27_FILES.length} symbols in Batch 27 successfully mastered!`);
