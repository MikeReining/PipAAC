#!/usr/bin/env node
/**
 * Build data/samples/elevenlabs-tiles-core/recipes.json from audio_import misses.
 *
 *   node scripts/catalog/build_elevenlabs_tile_queue.mjs
 *   node scripts/catalog/build_elevenlabs_tile_queue.mjs --limit 10
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  TILE_REVIEW_BATCH,
  TILE_VARIATION_IDS,
  catalogSlug,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { DEFAULT_AUDIO_IMPORT_PATH, repoRoot } from "./paths.mjs";

const ROOT = join(repoRoot, "data/samples", TILE_REVIEW_BATCH);

function main() {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;

  const plan = JSON.parse(readFileSync(DEFAULT_AUDIO_IMPORT_PATH, "utf8"));
  const misses = plan.entries.filter((e) => e.status === "miss");
  const slice = limit != null && Number.isFinite(limit) ? misses.slice(0, limit) : misses;

  const tilesVoice = getCatalogTileVoice();
  const words = slice.map((e) => {
    const word = e.spokenText;
    const slug = catalogSlug(word);
    return {
      slot: e.slot,
      slug,
      word,
      tier: e.tier,
      variations: TILE_VARIATION_IDS.map((id) => ({
        id,
        text: tileVariationText(word, id),
      })),
    };
  });

  mkdirSync(join(ROOT, "takes"), { recursive: true });
  mkdirSync(join(ROOT, "shortlist"), { recursive: true });

  const recipes = {
    schema: "pippaac.elevenlabs-tiles-recipes.v1",
    batch: TILE_REVIEW_BATCH,
    generatedAt: new Date().toISOString(),
    defaults: {
      provider: "elevenlabs",
      voice_id: tilesVoice.voice_id,
      model: tilesVoice.model,
      voice_settings: tilesVoice.voice_settings,
    },
    words,
  };

  const outPath = join(ROOT, "recipes.json");
  writeFileSync(outPath, `${JSON.stringify(recipes, null, 2)}\n`);
  console.log(`Wrote ${outPath} (${words.length} miss slots, ${misses.length} total misses)`);
}

main();
