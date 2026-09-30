#!/usr/bin/env node
/**
 * Mint Leo (or other tile_voices.json) plain takes for launch lexicon rows —
 * local samples only; does not publish to Eve catalog / R2.
 *
 *   node scripts/catalog/mint_tile_voice_seed.mjs --limit 10
 *   node scripts/catalog/mint_tile_voice_seed.mjs --limit 10 --offset 10
 *   node scripts/catalog/mint_tile_voice_seed.mjs --dry-run
 *   node scripts/catalog/mint_tile_voice_seed.mjs --all --run-id leo-final-c3-full-seed
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ELEVENLABS_TILES_LEO_BATCH,
  TILE_VARIATION_IDS,
  catalogSlug,
  tileTakeFilename,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";
import { mintTileVariation } from "./elevenlabs_tile_mint_core.mjs";
import { reviewUrlQuery, writeMintRun } from "./elevenlabs_mint_run.mjs";
import { listLaunchLemmaRows } from "./launch_lexicon_rows.mjs";
import { getTileVoiceByKey } from "./tile_voices.mjs";
import { repoRoot } from "./paths.mjs";
import { tileMintTextForVariation } from "../../src/shared/tile_recipe.mjs";

const DEFAULT_VOICE_KEY = "voi_leo_en";
const BATCH = ELEVENLABS_TILES_LEO_BATCH;
const BATCH_ROOT = join(repoRoot, "data/samples", BATCH);

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

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function ensureLeoRecipes(tileVoice, rows) {
  mkdirSync(join(BATCH_ROOT, "takes"), { recursive: true });
  const words = rows.map((r) => ({
    slot: r.slot,
    slug: r.slug,
    word: r.spokenText,
    variations: TILE_VARIATION_IDS.map((id) => ({
      id,
      text: tileVariationText(r.spokenText, id),
    })),
  }));
  const recipes = {
    schema: "pippaac.elevenlabs-tiles-recipes.v1",
    batch: BATCH,
    generatedAt: new Date().toISOString(),
    defaults: {
      provider: "elevenlabs",
      voice_id: tileVoice.voice_id,
      model: tileVoice.model,
      voice_settings: tileVoice.voice_settings,
      voice_key: tileVoice.voice_key,
      display_name: tileVoice.display_name,
    },
    words,
  };
  writeFileSync(join(BATCH_ROOT, "recipes.json"), `${JSON.stringify(recipes, null, 2)}\n`);
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const mintAll = process.argv.includes("--all");
  const voiceKey = argValue("--voice-key") ?? DEFAULT_VOICE_KEY;
  const tileVoice = getTileVoiceByKey(voiceKey);
  const limitRaw = argValue("--limit");
  const offsetRaw = argValue("--offset");
  const limit = limitRaw != null ? Number(limitRaw) : 10;
  const offset = offsetRaw != null ? Number(offsetRaw) : 0;
  const runId =
    argValue("--run-id") ??
    (mintAll
      ? `leo-seed-full-${new Date().toISOString().slice(0, 10)}`
      : `leo-seed-${new Date().toISOString().slice(0, 10)}-o${offset}-n${limit}`);

  const wordsArg = argValue("--words");
  const force = process.argv.includes("--force");

  if (mintAll && wordsArg?.trim()) {
    throw new Error("use either --all or --words, not both");
  }

  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive number");
  }
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error("--offset must be a non-negative number");
  }

  const allRows = listLaunchLemmaRows();
  ensureLeoRecipes(tileVoice, allRows);

  let slice;
  if (wordsArg?.trim()) {
    const want = wordsArg.split(",").map((s) => s.trim()).filter(Boolean);
    const byNorm = new Map(allRows.map((r) => [r.spokenText.toLowerCase(), r]));
    slice = [];
    for (const w of want) {
      const row = byNorm.get(w.toLowerCase());
      if (!row) throw new Error(`launch lexicon has no owner row for: ${w}`);
      slice.push(row);
    }
  } else if (mintAll) {
    slice = allRows;
  } else {
    slice = allRows.slice(offset, offset + limit);
  }
  if (slice.length === 0) {
    console.log(`mint_tile_voice_seed: no rows at offset ${offset} (launch size ${allRows.length})`);
    return;
  }

  console.log(
    `${tileVoice.display_name} (${voiceKey}): minting ${slice.length} launch word(s)` +
      (wordsArg ? ` [--words]` : mintAll ? ` [--all, skip existing]` : ` [offset ${offset}, limit ${limit}]`),
  );
  for (const r of slice) {
    const elevenText = tileMintTextForVariation(r.spokenText, "plain");
    console.log(`  - ${r.spokenText} (slot ${r.slot}) → ${elevenText}`);
  }
  if (dryRun) return;

  if (process.argv.includes("--publish")) {
    throw new Error("Leo seed mints are listen-only — publish with publish_leo_seed.mjs (028 slice 6)");
  }

  const takesRoot = join(BATCH_ROOT, "takes");
  const runItems = [];
  let minted = 0;

  for (const r of slice) {
    const plainPath = join(takesRoot, tileTakeFilename(r.slug, "plain"));
    if (force || !existsSync(plainPath)) {
      const out = await mintTileVariation({
        batch: BATCH,
        slug: r.slug,
        variationId: "plain",
        spokenText: r.spokenText,
      });
      minted++;
      console.log(`minted ${r.spokenText} -> ${out.relOut}`);
    } else {
      console.log(`skip mint (exists) ${r.spokenText}`);
    }
    runItems.push({
      slot: r.slot,
      spokenText: r.spokenText,
      slug: r.slug,
    });
  }

  const doc = writeMintRun({
    runId,
    batch: BATCH,
    label: wordsArg
      ? `${tileVoice.display_name} tricky probe (${slice.length})`
      : mintAll
        ? `${tileVoice.display_name} full launch seed (${slice.length})`
        : `${tileVoice.display_name} seed ${offset + 1}–${offset + slice.length}`,
    note: `Pilot seed — ${tileVoice.display_name}, plain only, not published`,
    voice: {
      label: tileVoice.display_name,
      voice_key: tileVoice.voice_key,
      voice_id: tileVoice.voice_id,
      model: tileVoice.model,
    },
    items: runItems,
  });

  const rel = reviewUrlQuery(doc.runId, BATCH);
  console.log(`Review in catalog:audio:review → Voice: Leo, Show: mint run, run ${doc.runId}`);
  console.log(`  http://127.0.0.1:${process.env.PIP_AUDIO_REVIEW_PORT || 3747}${rel}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
