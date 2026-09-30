/**
 * Mint run manifests — spot-check queues for batch tile mints (review UI filter).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ELEVENLABS_FORMS_LEO_BATCH,
  ELEVENLABS_TILES_LEO_BATCH,
  FORMS_REVIEW_BATCH,
  TILE_REVIEW_BATCH,
  catalogSlug,
  tileTakeFilename,
} from "./elevenlabs_tile_variations.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { tileReviewUrlForRun } from "./tile_review_voices.mjs";
import { repoRoot } from "./paths.mjs";

const MINT_RUN_BATCHES = [
  TILE_REVIEW_BATCH,
  ELEVENLABS_TILES_LEO_BATCH,
  FORMS_REVIEW_BATCH,
  ELEVENLABS_FORMS_LEO_BATCH,
];

export function mintRunsDir(batch = TILE_REVIEW_BATCH) {
  return join(repoRoot, "data/samples", batch, "mint_runs");
}

export function mintRunPath(runId, batch = TILE_REVIEW_BATCH) {
  return join(mintRunsDir(batch), `${runId}.json`);
}

/**
 * @param {string} runId
 * @param {string} [batch]
 */
export function loadMintRun(runId, batch = TILE_REVIEW_BATCH) {
  const path = mintRunPath(runId, batch);
  if (!existsSync(path)) throw new Error(`unknown mint run: ${runId}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {string} [batch]
 * @returns {Array<{ runId: string, createdAt: string, itemCount: number, label?: string }>}
 */
export function listMintRuns(batch = TILE_REVIEW_BATCH) {
  const dir = mintRunsDir(batch);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    out.push({
      runId: doc.runId,
      createdAt: doc.createdAt,
      itemCount: (doc.items ?? []).length,
      label: doc.label ?? doc.runId,
    });
  }
  out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return out;
}

/**
 * @param {{ runId?: string, label?: string, note?: string, batch?: string, items: Array<{ slot: number, spokenText: string, slug?: string, takeRel?: string, publishedAt?: string | null }> }} opts
 */
export function writeMintRun(opts) {
  const batch = opts.batch ?? TILE_REVIEW_BATCH;
  const runId =
    opts.runId ??
    `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const defaultVoice = getCatalogTileVoice();
  const voice =
    opts.voice ??
    {
      label: defaultVoice.label,
      voice_id: defaultVoice.voice_id,
      model: defaultVoice.model,
    };
  const items = opts.items.map((item) => {
    const slug = item.slug ?? catalogSlug(item.spokenText);
    const takeRel =
      item.takeRel ?? `${batch}/takes/${tileTakeFilename(slug, "plain")}`;
    return {
      slot: item.slot,
      spokenText: item.spokenText,
      slug,
      takeRel,
      publishedAt: item.publishedAt ?? null,
      review: item.review ?? null,
    };
  });
  const doc = {
    schemaVersion: 1,
    runId,
    label: opts.label ?? runId,
    note: opts.note ?? null,
    batch,
    createdAt: new Date().toISOString(),
    voice: {
      label: voice.label,
      voice_id: voice.voice_id,
      model: voice.model,
    },
    items,
  };
  mkdirSync(mintRunsDir(batch), { recursive: true });
  writeFileSync(mintRunPath(runId, batch), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/**
 * @param {string} runId
 * @param {string} slug
 * @param {{ publishedAt?: string, review?: string }} patch
 */
export function patchMintRunItem(runId, slug, patch, batch = TILE_REVIEW_BATCH) {
  const doc = loadMintRun(runId, batch);
  const item = (doc.items ?? []).find((i) => i.slug === slug);
  if (!item) throw new Error(`slug not in run: ${slug}`);
  Object.assign(item, patch);
  writeFileSync(mintRunPath(runId, batch), `${JSON.stringify(doc, null, 2)}\n`);
  return item;
}

/**
 * File rows for /api/files when shipFilter=mint-run.
 * @param {string} runId
 * @param {string} batch
 * @param {string} folder
 */
export function mintRunFileList(runId, batch, folder) {
  if (folder !== "takes") return [];
  const run = loadMintRun(runId, batch);
  return (run.items ?? []).map((item) => {
    const name = tileTakeFilename(item.slug, "plain");
    return {
      name,
      slug: item.slug,
      spokenText: item.spokenText,
      slot: item.slot,
      shippedViaReview: Boolean(item.publishedAt),
      takeRel: item.takeRel,
    };
  });
}

export function findMintRunBatch(runId) {
  const id = String(runId ?? "").trim();
  if (!id) return null;
  for (const batch of MINT_RUN_BATCHES) {
    if (existsSync(mintRunPath(id, batch))) return batch;
  }
  return null;
}

/** Review URL path for a run (includes /audio-review/elevenlabs-tiles). */
export function reviewUrlQuery(runId, batch = TILE_REVIEW_BATCH) {
  return tileReviewUrlForRun(runId, batch);
}
