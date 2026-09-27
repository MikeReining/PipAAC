#!/usr/bin/env node
/**
 * Publish every *_recommended.mp3 in elevenlabs-tiles-core/shortlist to catalog + R2.
 *
 *   node scripts/catalog/publish_elevenlabs_shortlist.mjs
 *   node scripts/catalog/publish_elevenlabs_shortlist.mjs --dry-run
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { slugFromMp3 } from "./audio_review_dev.mjs";
import { TILE_REVIEW_BATCH } from "./elevenlabs_tile_variations.mjs";
import { publishCatalogTile } from "./publish_catalog_tile.mjs";
import { lookupCatalogWord } from "./tile_catalog_lookup.mjs";
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
  const dryRun = process.argv.includes("--dry-run");
  const shortDir = join(repoRoot, "data/samples", TILE_REVIEW_BATCH, "shortlist");
  if (!existsSync(shortDir)) throw new Error(`missing ${shortDir}`);

  const files = readdirSync(shortDir)
    .filter((f) => f.endsWith("_recommended.mp3"))
    .sort();

  let ok = 0;
  let failed = 0;
  for (const name of files) {
    const slug = slugFromMp3(name);
    const sourceMp3Path = join(shortDir, name);
    try {
      const { slot, spokenText } = lookupCatalogWord(slug);
      const result = publishCatalogTile({ sourceMp3Path, slot, spokenText, dryRun });
      ok++;
      console.log(`${dryRun ? "[dry-run] " : ""}published ${spokenText} (slot ${slot}) -> ${result.clip.key}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`done: ${ok} published, ${failed} failed, ${files.length} shortlist files`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
