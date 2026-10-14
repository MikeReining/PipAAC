import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";
const POLISHED_DIR = join(BRAIN_DIR, "batch78_polished");

const SYMBOLS = [
  "already",
  "twenty",
  "monster",
  "place",
  "bridge",
  "tail",
  "coffee",
  "bump",
  "part",
  "rock",
  "party",
];

console.log("Copying polished Batch 78 symbols to assets/symbols/...");
for (const word of SYMBOLS) {
  const src = join(POLISHED_DIR, `${word}.png`);
  if (!existsSync(src)) {
    throw new Error(`Missing source file: ${src}`);
  }
  const dest = join(SYMBOLS_DIR, `${word}.png`);
  copyFileSync(src, dest);
  console.log(`Copied: ${word}.png -> ${dest}`);
}

const ALIASES = [
  { dest: "been.svg", src: "was.svg" },
  { dest: "lots_of.png", src: "lot.png" },
  { dest: "lots of.png", src: "lot.png" },
  { dest: "anything.png", src: "any.png" },
  { dest: "all_gone.png", src: "gone.png" },
  { dest: "all gone.png", src: "gone.png" },
  { dest: "myself.png", src: "me.png" },
];

console.log("\nCopying Batch 78 aliases to assets/symbols/...");
for (const { dest, src } of ALIASES) {
  const srcPath = join(SYMBOLS_DIR, src);
  if (!existsSync(srcPath)) {
    throw new Error(`Missing alias source: ${srcPath}`);
  }
  const destPath = join(SYMBOLS_DIR, dest);
  copyFileSync(srcPath, destPath);
  console.log(`Aliased: ${dest} -> ${src}`);
}

console.log("\nBatch 78 mastering complete!");
