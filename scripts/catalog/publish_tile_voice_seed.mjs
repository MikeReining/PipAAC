#!/usr/bin/env node
/**
 * 028 slice 6 — publish a voice's minted takes into the catalog audio
 * store: copies each take into assets/catalog/ under its
 * content-addressed key, uploads it to the WBB R2 bucket, and writes the
 * per-voice audio plans build_catalog.mjs consumes:
 *
 *   data/catalog/generated_audio.<name>.json  (launch lemmas, keyed by slot)
 *   data/catalog/forms_audio.<name>.json      (form surfaces, keyed by utt_f####)
 *
 * Sources:
 *   data/samples/elevenlabs-tiles-<name>/takes/   — mint_tile_voice_seed.mjs
 *   data/samples/elevenlabs-forms-<name>/takes/   — mint_tile_voice_forms.mjs
 *
 *   node scripts/catalog/publish_tile_voice_seed.mjs --voice-key voi_eve_en --run-id eve-full-seed-2026-10-03 --dry-run
 *   node scripts/catalog/publish_tile_voice_seed.mjs --no-r2     # local files only
 *   node scripts/catalog/publish_tile_voice_seed.mjs             # Leo full publish (historic run id)
 */

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  catalogSlug,
  formsSeedBatchForVoice,
  tileSeedBatchForVoice,
  tileTakeFilename,
} from "./elevenlabs_tile_variations.mjs";
import { buildClipRecord } from "./publish_catalog_tile.mjs";
import { formSurfaceRows } from "./mint_tile_voice_forms.mjs";
import { localPathForAudioKey, r2PutArgs, sha256File } from "./storage.mjs";
import { getTileVoiceByKey } from "./tile_voices.mjs";
import { DEFAULT_AUDIO_CACHE_ROOT, repoRoot } from "./paths.mjs";

const CONCURRENCY = 8;
/** Back-compat: the shipped Leo seed used this manifest. */
const LEO_SEED_RUN_ID = "leo-final-c3-full-seed";

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

function wranglerBin() {
  return join(repoRoot, "node_modules/.bin/wrangler");
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function r2Put(key, sourcePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(wranglerBin(), r2PutArgs(key, sourcePath), {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.stdout.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`r2 put ${key}: ${err.trim().slice(0, 300)}`));
    });
  });
}

/** Run `jobs` with a fixed-size pool; throws on the first failure. */
async function pool(jobs, fn) {
  let i = 0;
  let firstErr = null;
  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length && !firstErr) {
      const job = jobs[i++];
      try {
        await fn(job);
      } catch (e) {
        firstErr = e;
      }
    }
  });
  await Promise.all(workers);
  if (firstErr) throw firstErr;
}

/** Lemma rows from the full-seed mint run (slot → take file). */
function lemmaItems(tilesBatch, runId) {
  const runPath = join(repoRoot, "data/samples", tilesBatch, "mint_runs", `${runId}.json`);
  if (!existsSync(runPath)) throw new Error(`missing mint run: ${runPath}`);
  const run = JSON.parse(readFileSync(runPath, "utf8"));
  return (run.items ?? []).map((it) => ({
    slot: it.slot,
    spokenText: it.spokenText,
    slug: it.slug ?? catalogSlug(it.spokenText),
    takePath: join(repoRoot, "data/samples", tilesBatch, "takes",
      tileTakeFilename(it.slug ?? catalogSlug(it.spokenText), "plain")),
  }));
}

/** Form surfaces → take files (elevenlabs-forms-<name> batch). */
function formItems(formsBatch) {
  return formSurfaceRows().map((r) => ({
    utterance_id: r.utterance_id,
    spokenText: r.spoken_text,
    slug: r.slug,
    takePath: join(repoRoot, "data/samples", formsBatch, "takes",
      tileTakeFilename(r.slug, "plain")),
  }));
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const noR2 = process.argv.includes("--no-r2");
  const voiceKey = argValue("--voice-key") ?? "voi_leo_en";
  const tileVoice = getTileVoiceByKey(voiceKey);
  const voiceShort = tileVoice.display_name.toLowerCase();
  const tilesBatch = tileSeedBatchForVoice(voiceKey);
  const formsBatch = formsSeedBatchForVoice(voiceKey);
  if (!tilesBatch || !formsBatch) {
    throw new Error(`no seed lanes for voice_key: ${voiceKey}`);
  }
  const runId = argValue("--run-id") ??
    (voiceKey === "voi_leo_en" ? LEO_SEED_RUN_ID : null);
  if (!runId) {
    throw new Error("--run-id required (the voice's full lemma seed mint run)");
  }
  const generatedPath = join(repoRoot, `data/catalog/generated_audio.${voiceShort}.json`);
  const formsPath = join(repoRoot, `data/catalog/forms_audio.${voiceShort}.json`);

  const lemmas = lemmaItems(tilesBatch, runId);
  const forms = formItems(formsBatch);
  const missing = [...lemmas, ...forms].filter((it) => !existsSync(it.takePath));
  if (missing.length) {
    console.error(`missing ${missing.length} take file(s):`);
    for (const m of missing.slice(0, 20)) console.error(`  ${m.takePath}`);
    process.exit(1);
  }
  console.log(`${tileVoice.display_name} publish: ${lemmas.length} lemmas + ${forms.length} forms${dryRun ? " [dry-run]" : ""}${noR2 ? " [--no-r2]" : ""}`);

  const lemmaEntries = [];
  const formEntries = [];
  const stage = (item, entries, idField) => {
    const clip = buildClipRecord(item.spokenText, item.takePath, tileVoice.voice_id);
    const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(item.takePath, dest);
    }
    entries.push(idField === "slot"
      ? { slot: item.slot, spokenText: item.spokenText, clip }
      : { utterance_id: item.utterance_id, spoken_text: item.spokenText, clip });
    return { key: clip.key, src: dest };
  };

  const uploads = [];
  for (const it of lemmas) uploads.push(stage(it, lemmaEntries, "slot"));
  for (const it of forms) uploads.push(stage(it, formEntries, "utterance"));

  if (dryRun) {
    console.log(`sample key: ${uploads[0].key} (${uploads.length} clips)`);
    return;
  }
  console.log(`staged ${uploads.length} clips into ${DEFAULT_AUDIO_CACHE_ROOT}`);
  if (!noR2) {
    let done = 0;
    await pool(uploads, async (u) => {
      await r2Put(u.key, u.src);
      if (++done % 100 === 0) console.log(`  r2 ${done}/${uploads.length}`);
    });
    console.log(`r2: ${uploads.length} objects uploaded`);
  }

  writeFileSync(generatedPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: tileVoice.voice_id,
    entries: lemmaEntries.sort((a, b) => a.slot - b.slot),
  }, null, 2)}\n`);
  writeFileSync(formsPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: tileVoice.voice_id,
    entries: formEntries.sort((a, b) => a.utterance_id.localeCompare(b.utterance_id)),
    needed: forms.map((f) => ({ utterance_id: f.utterance_id, spoken_text: f.spokenText })),
    missing: [],
  }, null, 2)}\n`);
  console.log(`wrote ${generatedPath} (${lemmaEntries.length}) and ${formsPath} (${formEntries.length})`);
  console.log("next: npm run catalog:build");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
