#!/usr/bin/env node
/**
 * Download WorkbookBench catalog audio objects into assets/catalog/audio/ (offline bundle cache).
 *
 *   node scripts/catalog/materialize_audio.mjs --dry-run
 *   node scripts/catalog/materialize_audio.mjs --tier 1
 *   node scripts/catalog/materialize_audio.mjs --limit 5
 *
 * Requires Wrangler logged in with access to workbookbench-catalog R2.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_AUDIO_CACHE_ROOT, DEFAULT_AUDIO_IMPORT_PATH, repoRoot } from "./paths.mjs";
import { localPathForAudioKey, r2GetArgs, sha256File } from "./storage.mjs";

function loadImportPlan(path = DEFAULT_AUDIO_IMPORT_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function wranglerBin() {
  return join(repoRoot, "node_modules/.bin/wrangler");
}

function runR2Get(key, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) unlinkSync(dest);
  const result = spawnSync(wranglerBin(), r2GetArgs(key, dest), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `r2 get failed for ${key}: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tierIdx = process.argv.indexOf("--tier");
  const tier = tierIdx >= 0 ? Number(process.argv[tierIdx + 1]) : null;
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;

  const plan = loadImportPlan();
  let rows = plan.entries.filter((e) => e.status === "hit" && e.clip?.key);
  if (tier) rows = rows.filter((e) => e.tier === tier);
  if (limit) rows = rows.slice(0, limit);

  let fetched = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = row.clip.key;
    const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, key);
    if (existsSync(dest)) {
      if (row.clip.sha256) {
        const hash = sha256File(dest);
        if (hash === row.clip.sha256) {
          skipped += 1;
          continue;
        }
      } else {
        skipped += 1;
        continue;
      }
    }

    if (dryRun) {
      console.log(`would fetch ${key} -> ${dest}`);
      continue;
    }

    runR2Get(key, dest);
    if (row.clip.sha256) {
      const hash = sha256File(dest);
      if (hash !== row.clip.sha256) {
        throw new Error(`sha256 mismatch for ${key}: expected ${row.clip.sha256}, got ${hash}`);
      }
    }
    fetched += 1;
    console.log(`fetched ${row.spokenText} -> ${key}`);
  }

  console.log(`materialize: ${dryRun ? "dry-run" : "done"} — fetched ${fetched}, skipped ${skipped}, planned ${rows.length}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
