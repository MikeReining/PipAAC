import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_28_FILES = [
  { word: "aunt", src: `${BRAIN_DIR}/batch28_aunt.png` },
  { word: "uncle", src: `${BRAIN_DIR}/batch28_uncle.png` },
  { word: "cousin", src: `${BRAIN_DIR}/batch28_cousin.png` },
  { word: "therapist", src: `${BRAIN_DIR}/batch28_therapist.png` },
  { word: "aide", src: `${BRAIN_DIR}/batch28_aide.png` },
  { word: "student", src: `${BRAIN_DIR}/batch28_student.png` },
  { word: "class", src: `${BRAIN_DIR}/batch28_class.png` },
  { word: "neighbor", src: `${BRAIN_DIR}/batch28_neighbor.png` },
  { word: "person", src: `${BRAIN_DIR}/batch28_person.png` },
  { word: "people", src: `${BRAIN_DIR}/batch28_people.png` },
];

for (const item of BATCH_28_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_28_FILES.length} symbols in Batch 28 successfully mastered!`);
