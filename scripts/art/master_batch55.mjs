import { copyFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BATCH55_WORDS = [
  "cool",
  "special",
  "ready",
  "favorite",
  "weird",
  "funny",
  "morning",
  "afternoon",
  "evening",
  "night"
];

for (const word of BATCH55_WORDS) {
  const src = `${BRAIN_DIR}/batch55_norm_${word}.png`;
  copyFileSync(src, `${ASSETS_DIR}/${word}.png`);
  copyFileSync(src, `${PUBLIC_DIR}/${word}.png`);
  console.log(`Mastered: ${word}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);
}

console.log("\nAll 10 Batch 55 tiles mastered successfully!");
