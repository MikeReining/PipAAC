#!/usr/bin/env node
/**
 * Report WorkbookBench audio coverage for the Pip launch lexicon.
 *
 *   node scripts/catalog/coverage.mjs
 *   node scripts/catalog/coverage.mjs --tier 1
 *   node scripts/catalog/coverage.mjs --json
 */

import {
  loadLexicon,
  loadOverrides,
  loadWbbManifest,
  resolveAllWbbAudio,
  summarizeAudioResolution,
} from "./wbb_audio.mjs";

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

  if (asJson) {
    console.log(JSON.stringify({ summary, misses: misses.map((r) => r.entry.spokenText) }, null, 2));
    return;
  }

  console.log(`WorkbookBench audio coverage (${entries.length} lexicon rows)`);
  console.log(`  hits:   ${summary.hits}`);
  console.log(`  misses: ${summary.misses}`);
  if (misses.length > 0 && misses.length <= 40) {
    console.log("  missing:");
    for (const row of misses) {
      console.log(`    - ${row.entry.spokenText} (${row.reason ?? "miss"})`);
    }
  } else if (misses.length > 40) {
    console.log(`  missing: ${misses.length} words (use --json for full list)`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
