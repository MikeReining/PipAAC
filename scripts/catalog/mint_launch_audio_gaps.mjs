#!/usr/bin/env node
/**
 * Mint (and optionally publish) ElevenLabs plain takes for launch lexicon
 * rows that have no ready clip in the built catalog — default tile voice (Eve).
 *
 *   node scripts/catalog/mint_launch_audio_gaps.mjs
 *   node scripts/catalog/mint_launch_audio_gaps.mjs --dry-run
 *   node scripts/catalog/mint_launch_audio_gaps.mjs --no-publish   # default: mint only + mint run
 *   node scripts/catalog/mint_launch_audio_gaps.mjs --publish      # also publish each plain take
 *   node scripts/catalog/mint_launch_audio_gaps.mjs --limit 10
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  TILE_REVIEW_BATCH,
  catalogSlug,
  tileTakeFilename,
} from "./elevenlabs_tile_variations.mjs";
import { mintTileVariation } from "./elevenlabs_tile_mint_core.mjs";
import { publishCatalogTile } from "./publish_catalog_tile.mjs";
import { reviewUrlQuery, writeMintRun } from "./elevenlabs_mint_run.mjs";
import { loadLexicon } from "./wbb_audio.mjs";
import { repoRoot } from "./paths.mjs";

const CATALOG_PATH = join(repoRoot, "data/catalog/catalog.json");

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

/** Launch lemma rows in catalog.json with no ready clip. */
export function listLaunchClipGaps(catalogPath = CATALOG_PATH) {
  const lexicon = loadLexicon();
  const cat = JSON.parse(readFileSync(catalogPath, "utf8"));
  const readyUtt = new Set(
    (cat.clips ?? []).filter((c) => c.status === "ready").map((c) => c.utterance_id),
  );
  const ownerSlotByNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    ownerSlotByNorm.set(n, Math.min(ownerSlotByNorm.get(n) ?? Infinity, e.slot));
  }
  const gaps = [];
  for (const e of lexicon.entries) {
    const owner = ownerSlotByNorm.get(normalizeV1(e.spokenText));
    if (owner !== e.slot) continue;
    const uttId = `utt_${String(owner).padStart(4, "0")}`;
    if (readyUtt.has(uttId)) continue;
    gaps.push({
      slot: e.slot,
      spokenText: e.spokenText,
      slug: catalogSlug(e.spokenText),
      utterance_id: uttId,
    });
  }
  gaps.sort((a, b) => a.slot - b.slot);
  return gaps;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const doPublish = process.argv.includes("--publish");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;

  let gaps = listLaunchClipGaps();
  if (limit != null && Number.isFinite(limit)) gaps = gaps.slice(0, limit);

  if (gaps.length === 0) {
    console.log("mint_launch_audio_gaps: no launch rows missing ready clips");
    return;
  }

  console.log(`launch clip gaps: ${gaps.length} word(s) (tile voice / Eve)`);
  for (const g of gaps) {
    console.log(`  - ${g.spokenText} (slot ${g.slot})`);
  }
  if (dryRun) return;

  const takesRoot = join(repoRoot, "data/samples", TILE_REVIEW_BATCH, "takes");
  let minted = 0;
  let published = 0;
  let failed = 0;
  const runItems = [];

  for (const g of gaps) {
    const plainPath = join(takesRoot, tileTakeFilename(g.slug, "plain"));
    try {
      if (!existsSync(plainPath)) {
        const r = await mintTileVariation({
          slug: g.slug,
          variationId: "plain",
          spokenText: g.spokenText,
        });
        minted++;
        console.log(`minted ${g.spokenText} -> ${r.relOut}`);
      } else {
        console.log(`skip mint (exists) ${g.spokenText}`);
      }
      let publishedAt = null;
      if (doPublish) {
        publishCatalogTile({
          sourceMp3Path: plainPath,
          slot: g.slot,
          spokenText: g.spokenText,
        });
        published++;
        publishedAt = new Date().toISOString();
        console.log(`published ${g.spokenText} slot ${g.slot}`);
      }
      runItems.push({
        slot: g.slot,
        spokenText: g.spokenText,
        slug: g.slug,
        publishedAt,
      });
    } catch (err) {
      failed++;
      console.error(`FAIL ${g.spokenText}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (runItems.length > 0) {
    const run = writeMintRun({
      label: `Launch clip gaps (${runItems.length})`,
      note: doPublish ? "mint+publish" : "mint only — publish from review UI",
      items: runItems,
    });
    console.log(`mint run: ${run.runId}`);
    console.log(`review: http://127.0.0.1:${process.env.PIP_AUDIO_REVIEW_PORT || 3747}${reviewUrlQuery(run.runId)}`);
  }

  console.log(`done: minted=${minted}, published=${published}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
