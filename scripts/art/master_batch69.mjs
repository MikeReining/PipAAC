import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const REPO_ROOT = "/Users/mike/dev/PipAAC";

export const MASTER_ITEMS = [
  { fileKey: "bit", target: "bit" },
  { fileKey: "time", target: "time" },
  { fileKey: "move", target: "move" },
  { fileKey: "dear", target: "dear" },
  { fileKey: "from", target: "from" },
  { fileKey: "nice", target: "nice" },
  { fileKey: "about", target: "about" },
  { fileKey: "piece", target: "piece" },
  { fileKey: "mean", target: "mean" },
  { fileKey: "balloon", target: "balloon" },
  { fileKey: "bathroom", target: "bathroom", isRefresh: true },
  { fileKey: "naptime", target: "naptime", isRefresh: true },
];

export async function masterAll() {
  console.log("=== Mastering Batch 69 Symbols & Refreshed Cards ===");
  for (const item of MASTER_ITEMS) {
    const srcPng = `${BRAIN_DIR}/batch69_norm_${item.fileKey}.png`;
    if (!existsSync(srcPng)) {
      console.error(`[ERROR] Missing source: ${srcPng}`);
      continue;
    }

    const dstAssetPng = path.join(REPO_ROOT, `assets/symbols/${item.target}.png`);

    // Copy to assets/symbols (masters only — public/symbols is generated
    // by `npm run catalog:build`, which transcodes to WebP q82 ≤512px
    // and maintains the stamp file the orphan gate checks, per 037)
    copyFileSync(srcPng, dstAssetPng);
    console.log(`Updated ${dstAssetPng}`);
  }
  console.log("\nMastering complete! Run `npm run catalog:build` to ship.");
}

if (process.argv[1]?.endsWith("master_batch69.mjs")) {
  masterAll().catch(console.error);
}
