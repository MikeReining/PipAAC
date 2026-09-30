import { copyFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BATCH53_WORDS = [
  "narrow",
  "hard",
  "wet",
  "dry",
  "clean",
  "dirty",
  "smooth",
  "broken",
  "fixed",
  "empty"
];

for (const word of BATCH53_WORDS) {
  const src = `${BRAIN_DIR}/batch53_${word}.png`;
  copyFileSync(src, `${ASSETS_DIR}/${word}.png`);
  copyFileSync(src, `${PUBLIC_DIR}/${word}.png`);
  console.log(`Mastered: ${word}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);
}

console.log("\nAll 10 Batch 53 tiles mastered successfully!");
