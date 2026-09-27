#!/usr/bin/env node
/**
 * Report WorkbookBench audio coverage for the Pip launch lexicon.
 *
 *   node scripts/catalog/coverage.mjs
 *   node scripts/catalog/coverage.mjs --tier 1
 *   node scripts/catalog/coverage.mjs --json
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_GENERATED_AUDIO_PATH,
  repoRoot,
} from "./paths.mjs";
import {
  loadLexicon,
  loadOverrides,
  loadWbbManifest,
  resolveAllWbbAudio,
  summarizeAudioResolution,
} from "./wbb_audio.mjs";

const TILE_SHIPPING_PATH = join(repoRoot, "data/samples/elevenlabs-tiles-core/shipping.json");

function generatedSlotSet() {
  if (!existsSync(DEFAULT_GENERATED_AUDIO_PATH)) return new Set();
  const doc = JSON.parse(readFileSync(DEFAULT_GENERATED_AUDIO_PATH, "utf8"));
  return new Set((doc.entries ?? []).map((e) => e.slot));
}

function shippedViaReviewCount() {
  if (!existsSync(TILE_SHIPPING_PATH)) return 0;
  const doc = JSON.parse(readFileSync(TILE_SHIPPING_PATH, "utf8"));
  return Object.keys(doc.bySlug ?? {}).length;
}

function filterTier(entries, tierArg) {
  if (!tierArg) return entries;
  const tier = Number(tierArg);
  return entries.filter((e) => e.tier === tier);
}

async function main() {
  const tierIdx = process.argv.indexOf("--tier");
  const tierArg = tierIdx >= 0 ? process.argv[tierIdx + 1] : null;
  const asJson = process.argv.includes("--json");

  const lexicon = loadLexicon();
  const entries = filterTier(lexicon.entries, tierArg);
  const manifest = loadWbbManifest();
  const overrides = loadOverrides();
  const rows = await resolveAllWbbAudio(entries, manifest, overrides);
  const summary = summarizeAudioResolution(rows);

  const misses = rows.filter((r) => r.status === "miss");
  const genSlots = generatedSlotSet();
  const missRowsWithGen = misses.filter((r) => genSlots.has(r.entry.slot));
  const effectiveHits = summary.hits + missRowsWithGen.length;
  const shipped = shippedViaReviewCount();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          summary,
          effective: {
            hits: effectiveHits,
            misses: entries.length - effectiveHits,
            generatedGapFill: missRowsWithGen.length,
            shippedViaReview: shipped,
          },
          wbbMisses: misses.map((r) => r.entry.spokenText),
          wbbMissesWithoutGenerated: misses
            .filter((r) => !genSlots.has(r.entry.slot))
            .map((r) => r.entry.spokenText),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`WorkbookBench audio coverage (${entries.length} lexicon rows)`);
  console.log(`  hits:   ${summary.hits}`);
  console.log(`  misses: ${summary.misses} (WBB manifest only — see generated_audio.json)`);
  console.log(
    `  effective launch coverage: ${effectiveHits}/${entries.length} (${missRowsWithGen.length} misses filled via generated_audio.json)`,
  );
  if (shipped > 0) {
    console.log(`  ear-shipped via elevenlabs-tiles review: ${shipped} (shipping.json)`);
  }
  const stillOpen = misses.filter((r) => !genSlots.has(r.entry.slot));
  if (stillOpen.length > 0) {
    console.log(`  still need generated clip: ${stillOpen.length} (use --json)`);
  }
  if (stillOpen.length > 0 && stillOpen.length <= 40) {
    console.log("  missing generated clip:");
    for (const row of stillOpen) {
      console.log(`    - ${row.entry.spokenText} (${row.reason ?? "miss"})`);
    }
  } else if (stillOpen.length > 40) {
    console.log(`  missing generated clip: ${stillOpen.length} words (use --json)`);
  } else if (misses.length > 0) {
    console.log(`  WBB miss labels (${misses.length}): all have generated_audio clips`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
