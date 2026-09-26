#!/usr/bin/env node
/**
 * Mint one ElevenLabs catalog-voice take for the tile review batch.
 *
 *   node scripts/catalog/mint_elevenlabs_tile.mjs --slug all_done --variation plain
 *   node scripts/catalog/mint_elevenlabs_tile.mjs --slug all_done --all
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TILE_VARIATION_IDS } from "./elevenlabs_tile_variations.mjs";
import { mintTileVariation } from "./elevenlabs_tile_mint_core.mjs";
import { repoRoot } from "./paths.mjs";

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnv();
  const slugIdx = process.argv.indexOf("--slug");
  const slug = slugIdx >= 0 ? process.argv[slugIdx + 1] : null;
  if (!slug) throw new Error("--slug <catalog_slug> is required");

  if (process.argv.includes("--all")) {
    for (const id of TILE_VARIATION_IDS) {
      const r = await mintTileVariation({ slug, variationId: id });
      console.log(`minted ${r.text} -> ${r.relOut} (${r.bytes} bytes)`);
    }
    return;
  }

  const varIdx = process.argv.indexOf("--variation");
  const variation = varIdx >= 0 ? process.argv[varIdx + 1] : "plain";
  if (!TILE_VARIATION_IDS.includes(variation)) {
    throw new Error(`--variation must be one of: ${TILE_VARIATION_IDS.join(", ")}`);
  }
  const r = await mintTileVariation({ slug, variationId: variation });
  console.log(`minted ${r.text} -> ${r.relOut} (${r.bytes} bytes)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
