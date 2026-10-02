import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BATCH68_WORDS = [
  { word: "say", fileKey: "say" },
  { word: "hey", fileKey: "hey" },
  { word: "well", fileKey: "well" },
  { word: "let's", fileKey: "lets", alt: "lets" },
  { word: "gone", fileKey: "gone" },
  { word: "let", fileKey: "let" },
  { word: "said", fileKey: "said" },
  { word: "way", fileKey: "way" },
  { word: "watch", fileKey: "watch" },
  { word: "try", fileKey: "try" },
];

for (const item of BATCH68_WORDS) {
  const src = `${BRAIN_DIR}/batch68_norm_${item.fileKey}.png`;
  if (!existsSync(src)) {
    console.error(`Missing normalized file for ${item.word}: ${src}`);
    process.exit(1);
  }
  const destAssets = `${ASSETS_DIR}/${item.word}.png`;
  const destPublic = `${PUBLIC_DIR}/${item.word}.png`;

  copyFileSync(src, destAssets);
  copyFileSync(src, destPublic);
  console.log(`Mastered: ${item.word}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);

  if (item.alt) {
    copyFileSync(src, `${ASSETS_DIR}/${item.alt}.png`);
    copyFileSync(src, `${PUBLIC_DIR}/${item.alt}.png`);
    console.log(`Mastered alt: ${item.alt}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);
  }
}

console.log("\nAll 10 Batch 68 tiles mastered successfully!");
