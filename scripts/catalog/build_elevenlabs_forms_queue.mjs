#!/usr/bin/env node
/**
 * Build data/samples/elevenlabs-forms-core/recipes.json from forms_audio.json missing.
 *
 *   node scripts/catalog/build_elevenlabs_forms_queue.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  FORMS_REVIEW_BATCH,
  TILE_VARIATION_IDS,
  catalogSlug,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { repoRoot } from "./paths.mjs";

const FORMS_AUDIO_PATH = join(repoRoot, "data/catalog/forms_audio.json");

function main() {
  const plan = JSON.parse(readFileSync(FORMS_AUDIO_PATH, "utf8"));
  const missing = plan.missing ?? [];
  if (missing.length === 0) {
    console.log("build_elevenlabs_forms_queue: no missing form surfaces");
    return;
  }

  const tilesVoice = getCatalogTileVoice();
  const words = missing.map((row) => {
    const word = row.spoken_text;
    const slug = catalogSlug(word);
    return {
      utterance_id: row.utterance_id,
      slug,
      word,
      variations: TILE_VARIATION_IDS.map((id) => ({
        id,
        text: tileVariationText(word, id),
      })),
    };
  });

  const root = join(repoRoot, "data/samples", FORMS_REVIEW_BATCH);
  mkdirSync(join(root, "takes"), { recursive: true });
  mkdirSync(join(root, "shortlist"), { recursive: true });

  const recipes = {
    schema: "pippaac.elevenlabs-forms-recipes.v1",
    batch: FORMS_REVIEW_BATCH,
    generatedAt: new Date().toISOString(),
    defaults: {
      provider: "elevenlabs",
      voice_id: tilesVoice.voice_id,
      model: tilesVoice.model,
      voice_settings: tilesVoice.voice_settings,
    },
    words,
  };

  const outPath = join(root, "recipes.json");
  writeFileSync(outPath, `${JSON.stringify(recipes, null, 2)}\n`);
  console.log(`Wrote ${outPath} (${words.length} form surfaces)`);
}

main();
