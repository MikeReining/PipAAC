#!/usr/bin/env node
/**
 * Mint ElevenLabs tile takes for every word in elevenlabs-tiles-core/recipes.json.
 *
 *   node scripts/catalog/mint_elevenlabs_tile_batch.mjs
 *   node scripts/catalog/mint_elevenlabs_tile_batch.mjs --emphasis
 *   node scripts/catalog/mint_elevenlabs_tile_batch.mjs --force
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TILE_REVIEW_BATCH,
  TILE_VARIATION_IDS,
  tileTakeFilename,
} from "./elevenlabs_tile_variations.mjs";
import {
  TILE_AUTO_MINT_VARIATIONS,
  mintTileVariation,
  recipesPathForBatch,
} from "./elevenlabs_tile_mint_core.mjs";
import { reviewUrlQuery, writeMintRun } from "./elevenlabs_mint_run.mjs";
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
  const force = process.argv.includes("--force");
  const includeEmphasis = process.argv.includes("--emphasis");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;

  const batchIdx = process.argv.indexOf("--batch");
  const batch = batchIdx >= 0 ? process.argv[batchIdx + 1] : TILE_REVIEW_BATCH;
  const recordMintRun = process.argv.includes("--mint-run");
  const labelIdx = process.argv.indexOf("--mint-run-label");
  const mintRunLabel = labelIdx >= 0 ? process.argv[labelIdx + 1] : null;

  const recipes = JSON.parse(readFileSync(recipesPathForBatch(batch), "utf8"));
  const words = limit != null && Number.isFinite(limit) ? recipes.words.slice(0, limit) : recipes.words;
  const variations = includeEmphasis ? TILE_VARIATION_IDS : TILE_AUTO_MINT_VARIATIONS;
  const takesRoot = join(repoRoot, "data/samples", batch, "takes");

  let minted = 0;
  let skipped = 0;
  let failed = 0;
  /** @type {Map<string, { slot: number, spokenText: string, slug: string }>} */
  const runWords = new Map();

  for (const row of words) {
    for (const variationId of variations) {
      const outPath = join(takesRoot, tileTakeFilename(row.slug, variationId));
      if (!force && existsSync(outPath)) {
        skipped++;
        if (recordMintRun && variationId === "plain") {
          runWords.set(row.slug, {
            slot: row.slot,
            spokenText: row.word,
            slug: row.slug,
          });
        }
        continue;
      }
      try {
        const r = await mintTileVariation({
          batch,
          slug: row.slug,
          variationId,
          spokenText: row.word,
        });
        minted++;
        console.log(`minted ${row.slug} ${variationId} -> ${r.relOut} (${r.bytes} B)`);
        if (recordMintRun && variationId === "plain") {
          runWords.set(row.slug, {
            slot: row.slot,
            spokenText: row.word,
            slug: row.slug,
          });
        }
      } catch (err) {
        failed++;
        console.error(`FAIL ${row.slug} ${variationId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (recordMintRun && runWords.size > 0) {
    const run = writeMintRun({
      batch,
      label: mintRunLabel ?? `Batch mint (${runWords.size} words)`,
      note: "plain takes — review before publish",
      items: [...runWords.values()],
    });
    const port = process.env.PIP_AUDIO_REVIEW_PORT || 3747;
    console.log(`mint run: ${run.runId}`);
    console.log(`review: http://127.0.0.1:${port}${reviewUrlQuery(run.runId, batch)}`);
  }

  console.log(`batch done (${batch}): ${words.length} words, minted=${minted}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
