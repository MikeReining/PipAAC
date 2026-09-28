#!/usr/bin/env node
/**
 * Mint v4_plain lab takes for every unique ElevenLabs catalog clip (inventory list).
 *
 *   node scripts/catalog/mint_v4_lab_batch.mjs
 *   node scripts/catalog/mint_v4_lab_batch.mjs --limit 10
 *   node scripts/catalog/mint_v4_lab_batch.mjs --force
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { collectElevenLabsInventory } from "./list_elevenlabs_catalog_audio.mjs";
import {
  labTakeFilename,
  mintLabVariation,
  resolveLabWord,
  V4_LAB_BATCH,
  V4_LAB_DEFAULT_MINT_IDS,
} from "./elevenlabs_v4_lab.mjs";
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
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is required in .env");
  }

  const force = process.argv.includes("--force");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;
  const variationId = V4_LAB_DEFAULT_MINT_IDS[0];
  const takesRoot = join(repoRoot, "data/samples", V4_LAB_BATCH, "takes");

  const { summary, uniqueClips } = collectElevenLabsInventory();
  const queue = limit != null && Number.isFinite(limit) ? uniqueClips.slice(0, limit) : uniqueClips;

  console.log(
    `v4 lab batch: ${queue.length} of ${summary.uniqueClipKeys} inventory clips → ${variationId} (${V4_LAB_BATCH}/takes/)`,
  );

  let minted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of queue) {
    const spokenText = String(row.spokenText ?? "").trim();
    if (!spokenText) {
      failed++;
      console.error(`FAIL (empty spokenText): ${row.key ?? "?"}`);
      continue;
    }
    let slug;
    let word;
    try {
      const resolved = resolveLabWord(spokenText);
      slug = resolved.slug;
      word = resolved.spokenText;
    } catch (err) {
      failed++;
      console.error(
        `FAIL resolve ${spokenText}: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    const outPath = join(takesRoot, labTakeFilename(slug, variationId));
    if (!force && existsSync(outPath)) {
      skipped++;
      console.log(`skip ${slug} (exists)`);
      continue;
    }

    try {
      const r = await mintLabVariation({
        slug,
        variationId,
        spokenText: word,
      });
      minted++;
      console.log(`minted ${slug} "${word}" -> ${r.relOut} (${r.bytes} B)`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`done: minted=${minted}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
