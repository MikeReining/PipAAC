#!/usr/bin/env node
/**
 * Sync the worker-served data payloads into public/ so they ship as
 * static assets instead of bundle imports (2026-09-30: a static import
 * of ~57 MB of JSON was parsed by every isolate and crash-looped the
 * TileLedger DO over the 128 MB memory limit).
 *
 *   node scripts/prediction/sync_data_assets.mjs
 *   node scripts/prediction/sync_data_assets.mjs --check   # diff only
 *
 * catalog.json is copied by build_catalog.mjs itself; this script owns
 * the prediction tables and feeling_voice. form_table ships gzipped —
 * the 45 MB source exceeds the per-asset limit; the worker serves it
 * with content-encoding so fetch().json() decodes transparently.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** [source, public target, gzip?] */
const ASSETS = [
  ["data/prediction/phrase_table.en.json", "public/phrase_table.en.json", false],
  ["data/prediction/form_table.en.json", "public/form_table.en.json.gz", true],
  ["data/catalog/feeling_voice.json", "public/feeling_voice.json", false],
];

const check = process.argv.includes("--check");
let stale = 0;

for (const [src, dest, gz] of ASSETS) {
  const srcPath = path.join(repoRoot, src);
  const destPath = path.join(repoRoot, dest);
  if (!existsSync(srcPath)) {
    console.error(`missing source: ${src}`);
    stale++;
    continue;
  }
  const source = readFileSync(srcPath);
  // zlib leaves the gzip header mtime zeroed — the .gz is deterministic.
  const want = gz ? gzipSync(source, { level: 9 }) : source;
  const have = existsSync(destPath) ? readFileSync(destPath) : null;
  if (have && have.equals(want)) continue;
  stale++;
  if (!check) {
    writeFileSync(destPath, want);
    console.log(`wrote ${dest} (${want.length} bytes)`);
  } else {
    console.error(`stale: ${dest}`);
  }
}

if (check) {
  if (stale) {
    console.error("data assets stale — run scripts/prediction/sync_data_assets.mjs");
    process.exit(1);
  }
  console.log("data assets OK");
}
