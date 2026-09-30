import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH56_WORDS = [
  "bedtime",
  "naptime",
  "now",
  "later",
  "soon",
  "today",
  "tomorrow",
  "yesterday",
  "before",
  "after",
];

for (const word of BATCH56_WORDS) {
  const src = `${BRAIN_DIR}/batch56_norm_${word}.png`;
  if (!existsSync(src)) {
    console.error(`Missing normalized file for ${word}: ${src}`);
    process.exit(1);
  }
  const destAssets = `assets/symbols/${word}.png`;
  const destPublic = `public/symbols/${word}.png`;

  copyFileSync(src, destAssets);
  copyFileSync(src, destPublic);
  console.log(`Mastered: ${word}.png -> assets/symbols & public/symbols`);
}

console.log("Successfully mastered all 10 Batch 56 tiles!");
