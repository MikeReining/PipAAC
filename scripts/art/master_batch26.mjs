import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_26_FILES = [
  { word: "remember", src: `${BRAIN_DIR}/batch26_remember.png` },
  { word: "forget", src: `${BRAIN_DIR}/batch26_forget.png` },
  { word: "choose", src: `${BRAIN_DIR}/batch26_choose.png` },
  { word: "show", src: `${BRAIN_DIR}/batch26_show.png` },
  { word: "ask", src: `${BRAIN_DIR}/batch26_ask.png` },
  { word: "hug", src: `${BRAIN_DIR}/batch26_hug.png` },
  { word: "kiss", src: `${BRAIN_DIR}/batch26_kiss.png` },
  { word: "laugh", src: `${BRAIN_DIR}/batch26_laugh.png` },
  { word: "cry", src: `${BRAIN_DIR}/batch26_cry.png` },
  { word: "sleep", src: `${BRAIN_DIR}/batch26_sleep.png` },
];

const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

for (const item of BATCH_26_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets & public`);
}

console.log(`All ${BATCH_26_FILES.length} symbols in Batch 26 successfully mastered into assets/symbols/!`);
