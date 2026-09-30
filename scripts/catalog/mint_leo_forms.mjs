#!/usr/bin/env node
/**
 * 028 slice 6 — mint Leo's clips for the form surfaces (utt_f#### words
 * like "wants", "going", "doesn't"). Eve's forms went through
 * elevenlabs-forms-core; Leo mints plain takes to
 * data/samples/elevenlabs-forms-leo/takes/ — local samples only, the
 * publish step is publish_leo_seed.mjs.
 *
 *   node scripts/catalog/mint_leo_forms.mjs --dry-run
 *   node scripts/catalog/mint_leo_forms.mjs --limit 10
 *   node scripts/catalog/mint_leo_forms.mjs --all
 *
 * Surfaces come from forms_audio.json `needed` — the same census
 * build_catalog.mjs's strict gate uses.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ELEVENLABS_FORMS_LEO_BATCH,
  catalogSlug,
  tileTakeFilename,
} from "./elevenlabs_tile_variations.mjs";
import { mintTileVariation } from "./elevenlabs_tile_mint_core.mjs";
import { reviewUrlQuery, writeMintRun } from "./elevenlabs_mint_run.mjs";
import { getTileVoiceByKey } from "./tile_voices.mjs";
import { repoRoot } from "./paths.mjs";
import { tileMintTextForVariation } from "../../src/shared/tile_recipe.mjs";

const BATCH = ELEVENLABS_FORMS_LEO_BATCH;
const BATCH_ROOT = join(repoRoot, "data/samples", BATCH);
const FORMS_AUDIO_PATH = join(repoRoot, "data/catalog/forms_audio.json");

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

/** Form surfaces needing a clip, with their slug — one file per surface. */
export function leoFormRows(formsAudioPath = FORMS_AUDIO_PATH) {
  const plan = JSON.parse(readFileSync(formsAudioPath, "utf8"));
  const rows = (plan.needed ?? []).map((u) => ({
    utterance_id: u.utterance_id,
    spoken_text: u.spoken_text,
    slug: catalogSlug(u.spoken_text),
  }));
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.slug)) {
      throw new Error(`form surfaces share a take slug "${r.slug}": ${seen.get(r.slug)} / ${r.spoken_text}`);
    }
    seen.set(r.slug, r.spoken_text);
  }
  return rows;
}

function ensureLeoFormRecipes(tileVoice, rows) {
  mkdirSync(join(BATCH_ROOT, "takes"), { recursive: true });
  const words = rows.map((r) => ({
    utterance_id: r.utterance_id,
    slug: r.slug,
    word: r.spoken_text,
    variations: [{ id: "plain", text: tileMintTextForVariation(r.spoken_text, "plain") }],
  }));
  const recipes = {
    schema: "pippaac.elevenlabs-forms-recipes.v1",
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
  const voiceKey = argValue("--voice-key") ?? "voi_leo_en";
  const tileVoice = getTileVoiceByKey(voiceKey);
  const limit = Number(argValue("--limit") ?? 10);
  const offset = Number(argValue("--offset") ?? 0);
  if (!Number.isFinite(limit) || limit < 1) throw new Error("--limit must be a positive number");
  if (!Number.isFinite(offset) || offset < 0) throw new Error("--offset must be a non-negative number");

  const rows = leoFormRows();
  ensureLeoFormRecipes(tileVoice, rows);
  const slice = mintAll ? rows : rows.slice(offset, offset + limit);
  if (!slice.length) {
    console.log(`mint_leo_forms: no rows at offset ${offset} (${rows.length} surfaces)`);
    return;
  }

  console.log(
    `${tileVoice.display_name} (${voiceKey}): ${slice.length} form surface(s)` +
      (mintAll ? " [--all, skip existing]" : ` [offset ${offset}, limit ${limit}]`),
  );
  for (const r of slice) {
    console.log(`  - ${r.spoken_text} (${r.utterance_id}) → ${tileMintTextForVariation(r.spoken_text, "plain")}`);
  }
  if (dryRun) return;

  const takesRoot = join(BATCH_ROOT, "takes");
  const runItems = [];
  let minted = 0;
  let failed = 0;
  for (const r of slice) {
    const outPath = join(takesRoot, tileTakeFilename(r.slug, "plain"));
    if (existsSync(outPath)) {
      console.log(`skip mint (exists) ${r.spoken_text}`);
    } else {
      try {
        const out = await mintTileVariation({
          batch: BATCH,
          slug: r.slug,
          variationId: "plain",
          spokenText: r.spoken_text,
        });
        minted++;
        console.log(`minted ${r.spoken_text} -> ${out.relOut}`);
      } catch (err) {
        failed++;
        console.error(`FAIL ${r.spoken_text}: ${err instanceof Error ? err.message : err}`);
      }
    }
    runItems.push({ slot: r.utterance_id, spokenText: r.spoken_text, slug: r.slug });
  }

  const doc = writeMintRun({
    runId: `leo-forms-${new Date().toISOString().slice(0, 10)}`,
    batch: BATCH,
    label: `${tileVoice.display_name} forms seed (${runItems.length})`,
    note: `${tileVoice.display_name} form surfaces, plain only, not published`,
    voice: {
      label: tileVoice.display_name,
      voice_key: tileVoice.voice_key,
      voice_id: tileVoice.voice_id,
      model: tileVoice.model,
    },
    items: runItems,
  });
  console.log(`mint run: ${doc.runId} — minted=${minted} skipped=${runItems.length - minted - failed} failed=${failed}`);
  console.log(`  http://127.0.0.1:${process.env.PIP_AUDIO_REVIEW_PORT || 3747}${reviewUrlQuery(doc.runId, BATCH)}`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
