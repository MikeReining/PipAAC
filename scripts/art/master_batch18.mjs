import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_18_FILES = [
  { word: "hurt", src: `${BRAIN_DIR}/batch18_hurt.png` },
  { word: "sick", src: `${BRAIN_DIR}/batch18_sick.png` },
  { word: "pain", src: `${BRAIN_DIR}/batch18_pain.png` },
  { word: "fever", src: `${BRAIN_DIR}/batch18_fever.png` },
  { word: "cough", src: `${BRAIN_DIR}/batch18_cough.png` },
  { word: "medicine", src: `${BRAIN_DIR}/batch18_medicine.png` },
  { word: "dentist", src: `${BRAIN_DIR}/batch18_dentist.png` },
  { word: "sad", src: `${BRAIN_DIR}/batch18_sad.png` },
  { word: "mad", src: `${BRAIN_DIR}/batch18_mad.png` },
  { word: "angry", src: `${BRAIN_DIR}/batch18_angry.png` },
];

for (const item of BATCH_18_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log("All 10 symbols in Batch 18 successfully mastered into assets/symbols/!");
