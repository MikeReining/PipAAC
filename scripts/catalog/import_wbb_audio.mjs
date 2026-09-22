#!/usr/bin/env node
/**
 * Build data/catalog/audio_import.json — Pip lexicon rows mapped to WorkbookBench R2 keys.
 *
 *   node scripts/catalog/import_wbb_audio.mjs
 *   node scripts/catalog/import_wbb_audio.mjs --tier 1
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DEFAULT_AUDIO_IMPORT_PATH } from "./paths.mjs";
import {
  clipPayloadFromWbb,
  loadLexicon,
  loadOverrides,
  loadWbbManifest,
  resolveAllWbbAudio,
  summarizeAudioResolution,
} from "./wbb_audio.mjs";
import { resolveWorkbookBenchRoot, WBB_MANIFEST_REL } from "./paths.mjs";

function filterTier(entries, tierArg) {
  if (!tierArg) return entries;
  const tier = Number(tierArg);
  return entries.filter((e) => e.tier === tier);
}

async function main() {
  const tierIdx = process.argv.indexOf("--tier");
  const tierArg = tierIdx >= 0 ? process.argv[tierIdx + 1] : null;

  const lexicon = loadLexicon();
  const entries = filterTier(lexicon.entries, tierArg);
  const manifest = loadWbbManifest();
  const overrides = loadOverrides();
  const rows = await resolveAllWbbAudio(entries, manifest, overrides);
  const summary = summarizeAudioResolution(rows);

  const wbbRoot = resolveWorkbookBenchRoot();
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workbookBenchRoot: wbbRoot,
    workbookBenchManifest: WBB_MANIFEST_REL,
    bundledVoiceId: "voi_pip_default",
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? null,
    summary,
    entries: rows.map((row) => ({
      slot: row.entry.slot,
      tier: row.entry.tier,
      spokenText: row.entry.spokenText,
      status: row.status,
      via: row.via ?? null,
      wbbSenseId: row.wbbSenseId ?? null,
      reason: row.reason ?? null,
      clip: row.clip ? clipPayloadFromWbb(row.clip) : null,
    })),
  };

  const outPath = DEFAULT_AUDIO_IMPORT_PATH;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  hits:   ${summary.hits}`);
  console.log(`  misses: ${summary.misses}`);
  if (summary.misses > 0) {
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
