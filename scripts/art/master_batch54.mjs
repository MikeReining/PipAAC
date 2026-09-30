import { copyFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BATCH54_WORDS = [
  "full",
  "safe",
  "dangerous",
  "easy",
  "difficult",
  "right",
  "wrong",
  "new",
  "old",
  "pretty"
];

for (const word of BATCH54_WORDS) {
  const src = `${BRAIN_DIR}/batch54_${word}.png`;
  copyFileSync(src, `${ASSETS_DIR}/${word}.png`);
  copyFileSync(src, `${PUBLIC_DIR}/${word}.png`);
  console.log(`Mastered: ${word}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);
}

console.log("\nAll 10 Batch 54 tiles mastered successfully!");
