import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_34_FILES = [
  { word: "action_figure", src: `${BRAIN_DIR}/batch34_action_figure.png` },
  { word: "bubbles", src: `${BRAIN_DIR}/batch34_bubbles.png` },
  { word: "play_dough", src: `${BRAIN_DIR}/batch34_play_dough.png` },
  { word: "toy_car", src: `${BRAIN_DIR}/batch34_toy_car.png` },
  { word: "toy_train", src: `${BRAIN_DIR}/batch34_toy_train.png` },
  { word: "stuffed_animal", src: `${BRAIN_DIR}/batch34_stuffed_animal.png` },
  { word: "dinosaur", src: `${BRAIN_DIR}/batch34_dinosaur.png` },
  { word: "robot", src: `${BRAIN_DIR}/batch34_robot.png` },
  { word: "legos", src: `${BRAIN_DIR}/batch34_legos.png` },
  { word: "board_game", src: `${BRAIN_DIR}/batch34_board_game.png` },
];

for (const item of BATCH_34_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);
}

console.log(`\nAll ${BATCH_34_FILES.length} symbols in Batch 34 successfully mastered!`);
