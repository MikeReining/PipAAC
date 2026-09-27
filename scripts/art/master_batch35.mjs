import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_35_FILES = [
  { word: "swing_set", src: `${BRAIN_DIR}/batch35_swing_set.png` },
  { word: "sandbox", src: `${BRAIN_DIR}/batch35_sandbox.png` },
  { word: "bike", src: `${BRAIN_DIR}/batch35_bike.png` },
  { word: "scooter", src: `${BRAIN_DIR}/batch35_scooter.png` },
  { word: "skateboard", src: `${BRAIN_DIR}/batch35_skateboard.png` },
  { word: "wagon", src: `${BRAIN_DIR}/batch35_wagon.png` },
  { word: "chalk", src: `${BRAIN_DIR}/batch35_chalk.png` },
  { word: "jump_rope", src: `${BRAIN_DIR}/batch35_jump_rope.png` },
  { word: "music", src: `${BRAIN_DIR}/batch35_music.png` },
  { word: "song", src: `${BRAIN_DIR}/batch35_song.png` },
];

for (const item of BATCH_35_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_35_FILES.length} symbols in Batch 35 successfully mastered!`);
