import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_21_FILES = [
  { word: "quiet", src: `${BRAIN_DIR}/batch21_quiet.png` },
  { word: "noisy", src: `${BRAIN_DIR}/batch21_noisy.png` },
  { word: "bright", src: `${BRAIN_DIR}/batch21_bright.png` },
  { word: "dark", src: `${BRAIN_DIR}/batch21_dark.png` },
  { word: "soft", src: `${BRAIN_DIR}/batch21_soft.png` },
  { word: "rough", src: `${BRAIN_DIR}/batch21_rough.png` },
  { word: "sticky", src: `${BRAIN_DIR}/batch21_sticky.png` },
  { word: "gross", src: `${BRAIN_DIR}/batch21_gross.png` },
  { word: "comfortable", src: `${BRAIN_DIR}/batch21_comfortable.png` },
  { word: "uncomfortable", src: `${BRAIN_DIR}/batch21_uncomfortable.png` },
  { word: "overwhelmed", src: `${BRAIN_DIR}/batch21_overwhelmed.png` },
  { word: "mom", src: `${BRAIN_DIR}/test_mom.png` },
  { word: "dad", src: `${BRAIN_DIR}/test_dad.png` },
];

for (const item of BATCH_21_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_21_FILES.length} symbols in Batch 21 successfully mastered into assets/symbols/!`);
