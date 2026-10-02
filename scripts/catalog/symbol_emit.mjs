/**
 * 037 symbol emission — the half of the catalog build that owns
 * public/symbols/. Raster masters transcode to <=512px WebP (aspect
 * preserved, never enlarged); SVGs copy byte-for-byte. The stamp file at
 * data/catalog/symbols_build.json records {masterSha256, params} per
 * shipped key so rebuilds skip unchanged files and --check stays
 * read-only — deliberately no byte-compare of encoder output, since
 * libwebp bytes can differ across sharp builds.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./paths.mjs";

const SYMBOLS_ROOT = join(repoRoot, "assets/symbols");
const PUBLIC_SYMBOLS_ROOT = join(repoRoot, "public/symbols");
const SYMBOLS_STAMP = join(repoRoot, "data/catalog/symbols_build.json");
const SYMBOL_EDGE = 512;
const SYMBOL_QUALITY = 82;
/* Per-file edge overrides (037 § 2A): when the tile-size review calls a
 * shipped WebP illegible, bump that file's edge here — never a global
 * resolution bump. Keyed by master filename stem ("goldfish_crackers"). */
const SYMBOL_EDGE_OVERRIDES = new Map();

const symbolParamsFor = (job) =>
  job.key.endsWith(".svg")
    ? "svg"
    : `webp-q${SYMBOL_QUALITY}-e${SYMBOL_EDGE_OVERRIDES.get(job.stem) ?? SYMBOL_EDGE}`;

/**
 * Write shipped symbol files (non-check runs). Incremental: a matching
 * stamp entry with the file present is skipped, so rebuilds don't
 * re-encode 700 images. Re-encodes when the master or the params change.
 * `sharp` loads lazily — importing this module for its pure functions
 * must not need the native lib.
 */
export async function emitSymbols(jobs) {
  mkdirSync(PUBLIC_SYMBOLS_ROOT, { recursive: true });
  const stamp = existsSync(SYMBOLS_STAMP)
    ? JSON.parse(readFileSync(SYMBOLS_STAMP, "utf8")).files ?? {}
    : {};
  let sharp = null;
  let encoded = 0, copied = 0, kept = 0;
  const files = {};
  for (const job of jobs) {
    const params = symbolParamsFor(job);
    const out = join(repoRoot, "public", job.key);
    files[job.key] = { masterSha256: job.masterSha256, params };
    if (stamp[job.key]?.masterSha256 === job.masterSha256
        && stamp[job.key]?.params === params && existsSync(out)) {
      kept++;
      continue;
    }
    if (job.key.endsWith(".svg")) {
      copyFileSync(join(SYMBOLS_ROOT, job.masterFile), out);
      copied++;
    } else {
      const edge = SYMBOL_EDGE_OVERRIDES.get(job.stem) ?? SYMBOL_EDGE;
      sharp ??= (await import("sharp")).default;
      await sharp(join(SYMBOLS_ROOT, job.masterFile))
        .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: SYMBOL_QUALITY })
        .toFile(out);
      encoded++;
    }
  }
  writeFileSync(SYMBOLS_STAMP, `${JSON.stringify({ files }, null, 2)}\n`, "utf8");
  console.log(`symbols: ${encoded} encoded, ${copied} copied, ${kept} unchanged`);
}

/**
 * `--check` half of emitSymbols (037 § 2): fails when a referenced
 * symbol's stamp is missing, stale, or wrong-paramed; when the shipped
 * file is missing; or when public/symbols/ holds a file the catalog
 * doesn't reference (orphans, stray .pngs from bypass scripts).
 */
export function checkSymbolEmission(jobs) {
  const failures = [];
  const stamp = existsSync(SYMBOLS_STAMP)
    ? JSON.parse(readFileSync(SYMBOLS_STAMP, "utf8")).files ?? null
    : null;
  if (!stamp) failures.push(`${SYMBOLS_STAMP} missing — run catalog:build`);
  const expected = new Set(jobs.map((j) => j.key.split("/").pop()));
  for (const job of jobs) {
    const entry = stamp?.[job.key];
    if (!entry) {
      failures.push(`stamp missing ${job.key}`);
    } else {
      if (entry.masterSha256 !== job.masterSha256) {
        failures.push(`stale stamp ${job.key} — master changed`);
      }
      if (entry.params !== symbolParamsFor(job)) {
        failures.push(`stale params ${job.key} — ${entry.params} → ${symbolParamsFor(job)}`);
      }
    }
    if (!existsSync(join(repoRoot, "public", job.key))) {
      failures.push(`missing shipped file ${job.key}`);
    }
  }
  if (existsSync(PUBLIC_SYMBOLS_ROOT)) {
    for (const file of readdirSync(PUBLIC_SYMBOLS_ROOT)) {
      if (!expected.has(file)) {
        failures.push(`orphan public/symbols/${file} — not catalog-referenced`);
      }
    }
  }
  return failures;
}
