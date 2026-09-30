import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BATCH57_WORDS = [
  "again",
  "always",
  "never",
  "sometimes",
  "first",
  "next",
  "then",
  "last",
  "minute",
  "hour",
];

for (const word of BATCH57_WORDS) {
  const src = `${BRAIN_DIR}/batch57_norm_${word}.png`;
  if (!existsSync(src)) {
    console.error(`Missing normalized file for ${word}: ${src}`);
    process.exit(1);
  }
  const destAssets = `${ASSETS_DIR}/${word}.png`;
  const destPublic = `${PUBLIC_DIR}/${word}.png`;

  copyFileSync(src, destAssets);
  copyFileSync(src, destPublic);
  console.log(`Mastered: ${word}.png -> ${ASSETS_DIR} & ${PUBLIC_DIR}`);
}

console.log("\nAll 10 Batch 57 tiles mastered successfully!");
