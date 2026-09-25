import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH_24_FILES = [
  { word: "draw", src: `${BRAIN_DIR}/batch24_draw.png` },
  { word: "color", src: `${BRAIN_DIR}/batch24_color.png` },
  { word: "paint", src: `${BRAIN_DIR}/batch24_paint.png` },
  { word: "cut", src: `${BRAIN_DIR}/batch24_cut.png` },
  { word: "glue", src: `${BRAIN_DIR}/batch24_glue.png` },
  { word: "listen", src: `${BRAIN_DIR}/batch24_listen.png` },
  { word: "speak", src: `${BRAIN_DIR}/batch24_speak_roll2.png` },
  { word: "talk", src: `${BRAIN_DIR}/batch24_speak.png` },
  { word: "sing", src: `${BRAIN_DIR}/batch24_sing.png` },
  { word: "count", src: `${BRAIN_DIR}/batch24_count.png` },
];

for (const item of BATCH_24_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const dest = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, dest);
  console.log(`Copied ${item.word}.png -> ${dest}`);
}

console.log(`All ${BATCH_24_FILES.length} symbols in Batch 24 successfully mastered into assets/symbols/!`);
