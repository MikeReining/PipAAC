import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const PUBLIC_SYMBOLS_DIR = "/Users/mike/dev/PipAAC/public/symbols";

const BATCH_44_FILES = [
  { word: "belt", src: `${BRAIN_DIR}/batch44_belt.png` },
  { word: "pocket", src: `${BRAIN_DIR}/batch44_pocket.png` },
  { word: "sandals", src: `${BRAIN_DIR}/batch44_sandals.png` },
  { word: "animal", src: `${BRAIN_DIR}/batch44_animal.png` },
  { word: "dog", src: `${BRAIN_DIR}/batch44_dog.png` },
  { word: "cat", src: `${BRAIN_DIR}/batch44_cat.png` },
  { word: "puppy", src: `${BRAIN_DIR}/batch44_puppy.png` },
  { word: "kitten", src: `${BRAIN_DIR}/batch44_kitten.png` },
  { word: "bird", src: `${BRAIN_DIR}/batch44_bird.png` },
  { word: "bunny", src: `${BRAIN_DIR}/batch44_bunny.png` },
];

for (const item of BATCH_44_FILES) {
  if (!existsSync(item.src)) {
    throw new Error(`Source file missing: ${item.src}`);
  }
  const destAsset = join(SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destAsset);
  const destPublic = join(PUBLIC_SYMBOLS_DIR, `${item.word}.png`);
  copyFileSync(item.src, destPublic);
  console.log(`Copied ${item.word}.png -> assets/symbols & public/symbols`);

  if (item.word === "sandals") {
    copyFileSync(item.src, join(SYMBOLS_DIR, "sandal.png"));
    copyFileSync(item.src, join(PUBLIC_SYMBOLS_DIR, "sandal.png"));
    console.log(`Copied sandal.png -> assets/symbols & public/symbols (singular alias)`);
  }
}

console.log(`\nAll ${BATCH_44_FILES.length} symbols in Batch 44 successfully mastered!`);
