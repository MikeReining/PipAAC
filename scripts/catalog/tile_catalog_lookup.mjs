/**
 * Catalog tile lookup (audio_import + generated_audio), review shipping log, R2/local clip resolve.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { catalogSlug, TILE_REVIEW_BATCH } from "./elevenlabs_tile_variations.mjs";
import {
  DEFAULT_AUDIO_CACHE_ROOT,
  DEFAULT_AUDIO_IMPORT_PATH,
  DEFAULT_GENERATED_AUDIO_PATH,
  repoRoot,
} from "./paths.mjs";
import { localPathForAudioKey, r2GetArgs } from "./storage.mjs";

export function shippingPathForBatch(batch = TILE_REVIEW_BATCH) {
  return join(repoRoot, "data/samples", batch, "shipping.json");
}

const R2_PROBE_CACHE = join(repoRoot, ".cache", "tile-r2-probe");

function wranglerBin() {
  return join(repoRoot, "node_modules/.bin/wrangler");
}

export function normalizeSpokenQuery(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

let importIndexCache = null;

function buildImportIndex() {
  if (importIndexCache) return importIndexCache;
  const plan = loadJson(DEFAULT_AUDIO_IMPORT_PATH);
  const byNorm = new Map();
  const bySlug = new Map();
  for (const e of plan?.entries ?? []) {
    const norm = normalizeSpokenQuery(e.spokenText);
    const slug = catalogSlug(e.spokenText);
    byNorm.set(norm, e);
    bySlug.set(slug, e);
  }
  importIndexCache = { byNorm, bySlug };
  return importIndexCache;
}

export function loadShippingDoc(batch = TILE_REVIEW_BATCH) {
  const doc = loadJson(shippingPathForBatch(batch));
  if (!doc) return { schemaVersion: 1, bySlug: {} };
  return doc;
}

export function saveShippingDoc(doc, batch = TILE_REVIEW_BATCH) {
  const path = shippingPathForBatch(batch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
}

/** Record a successful review publish (R2 + generated_audio or forms_audio). */
export function recordTileShipping({
  slug,
  slot,
  spokenText,
  clip,
  sourcePath,
  batch = TILE_REVIEW_BATCH,
  utterance_id = null,
}) {
  const doc = loadShippingDoc(batch);
  doc.bySlug = doc.bySlug ?? {};
  doc.bySlug[slug] = {
    slot,
    utterance_id,
    spokenText,
    clip,
    sourcePath,
    publishedAt: new Date().toISOString(),
  };
  saveShippingDoc(doc, batch);
  return doc.bySlug[slug];
}

export function isSlugShippedViaReview(slug, batch = TILE_REVIEW_BATCH) {
  return Boolean(loadShippingDoc(batch).bySlug?.[slug]);
}

export function shippedSlugSet(batch = TILE_REVIEW_BATCH) {
  return new Set(Object.keys(loadShippingDoc(batch).bySlug ?? {}));
}

function clipFromGenerated(slot) {
  const gen = loadJson(DEFAULT_GENERATED_AUDIO_PATH);
  const row = (gen?.entries ?? []).find((e) => e.slot === slot);
  return row?.clip ?? null;
}

/**
 * Resolve a launch-lexicon word to import row + best-known catalog clip.
 * @param {string} query free text or slug
 */
export function lookupCatalogWord(query) {
  const raw = String(query ?? "").trim();
  if (!raw) throw new Error("query is required");

  const { byNorm, bySlug } = buildImportIndex();
  const norm = normalizeSpokenQuery(raw);
  const slug = catalogSlug(raw);

  let importRow = byNorm.get(norm) ?? bySlug.get(slug);
  if (!importRow) {
    for (const [s, row] of bySlug) {
      if (s.includes(slug) || slug.includes(s)) {
        importRow = row;
        break;
      }
    }
  }
  if (!importRow) {
    throw new Error(`no catalog row for "${raw}" — try the exact tile label`);
  }

  const resolvedSlug = catalogSlug(importRow.spokenText);
  const shipping = loadShippingDoc().bySlug?.[resolvedSlug];
  const shippedViaReview = Boolean(shipping);

  let catalogClip =
    shipping?.clip ??
    (importRow.status === "hit" ? importRow.clip : null) ??
    clipFromGenerated(importRow.slot);

  return {
    query: raw,
    slug: resolvedSlug,
    spokenText: importRow.spokenText,
    slot: importRow.slot,
    importStatus: importRow.status,
    catalogClip,
    shippedViaReview,
    shipping: shipping ?? null,
  };
}

export function runR2Get(key, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  const result = spawnSync(wranglerBin(), r2GetArgs(key, destPath), {
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

export function localCatalogAudioPath(key) {
  if (!key) return null;
  return localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, key);
}

export function catalogAudioLocalExists(key) {
  const p = localCatalogAudioPath(key);
  return p && existsSync(p);
}

/** Download from R2 if missing locally; returns absolute path. */
export function ensureCatalogAudioLocal(key) {
  if (!key) throw new Error("key is required");
  const dest = localCatalogAudioPath(key);
  if (existsSync(dest)) return dest;
  runR2Get(key, dest);
  return dest;
}

/** Best-effort remote check (wrangler get into probe cache). */
export function probeR2ObjectExists(key) {
  if (!key) return false;
  if (catalogAudioLocalExists(key)) return true;
  const probePath = join(R2_PROBE_CACHE, key);
  if (existsSync(probePath)) return true;
  try {
    runR2Get(key, probePath);
    return existsSync(probePath);
  } catch {
    return false;
  }
}

export function enrichFileListForTiles(batch, folder, files, slugFromMp3Fn) {
  const shipped = shippedSlugSet(batch);
  return files.map((f) => {
    const slug = slugFromMp3Fn(f.name);
    const shippedViaReview = shipped.has(slug);
    return { ...f, slug, shippedViaReview };
  });
}

export function filterFilesByShip(files, shipFilter) {
  if (!shipFilter || shipFilter === "all") return files;
  if (shipFilter === "needs-ship") return files.filter((f) => !f.shippedViaReview);
  if (shipFilter === "shipped") return files.filter((f) => f.shippedViaReview);
  throw new Error('shipFilter must be all, needs-ship, or shipped');
}
