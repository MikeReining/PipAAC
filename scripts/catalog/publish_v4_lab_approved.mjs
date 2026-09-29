#!/usr/bin/env node
/**
 * Publish ear-approved v4_plain takes from elevenlabs-v4-lab to R2 + sidecars.
 *
 *   node scripts/catalog/publish_v4_lab_approved.mjs
 *   node scripts/catalog/publish_v4_lab_approved.mjs --dry-run
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  labTakeFilename,
  resolveLabWord,
  V4_LAB_BATCH,
} from "./elevenlabs_v4_lab.mjs";
import { loadReviewDoc } from "./elevenlabs_v4_lab_review.mjs";
import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { collectElevenLabsInventory } from "./list_elevenlabs_catalog_audio.mjs";
import { publishCatalogForm } from "./publish_catalog_form.mjs";
import { publishCatalogTile } from "./publish_catalog_tile.mjs";
import { DEFAULT_GENERATED_AUDIO_PATH, repoRoot } from "./paths.mjs";
import { lookupCatalogWord, normalizeSpokenQuery } from "./tile_catalog_lookup.mjs";

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

function formsEntryByNorm() {
  if (!existsSync(FORMS_AUDIO_PATH)) return new Map();
  const doc = JSON.parse(readFileSync(FORMS_AUDIO_PATH, "utf8"));
  const byNorm = new Map();
  for (const e of doc.entries ?? []) {
    byNorm.set(normalizeSpokenQuery(e.spoken_text), e);
  }
  return byNorm;
}

function generatedEntryByNorm() {
  if (!existsSync(DEFAULT_GENERATED_AUDIO_PATH)) return new Map();
  const doc = JSON.parse(readFileSync(DEFAULT_GENERATED_AUDIO_PATH, "utf8"));
  const byNorm = new Map();
  for (const e of doc.entries ?? []) {
    byNorm.set(normalizeSpokenQuery(e.spokenText), e);
  }
  return byNorm;
}

function inventoryBySlug() {
  const bySlug = new Map();
  for (const row of collectElevenLabsInventory().uniqueClips) {
    const slug = catalogSlug(row.spokenText);
    if (!bySlug.has(slug)) bySlug.set(slug, row);
  }
  return bySlug;
}

/**
 * @param {string} slug
 * @param {string} spokenText
 */
function resolvePublishTarget(slug, spokenText) {
  const norm = normalizeSpokenQuery(spokenText);
  const form = formsEntryByNorm().get(norm);
  if (form?.utterance_id) {
    return {
      kind: "form",
      utterance_id: form.utterance_id,
      spokenText: form.spoken_text,
      slug,
    };
  }
  const gen = generatedEntryByNorm().get(norm);
  if (gen?.slot != null) {
    return { kind: "tile", slot: gen.slot, spokenText: gen.spokenText };
  }
  try {
    const hit = lookupCatalogWord(spokenText);
    return { kind: "tile", slot: hit.slot, spokenText: hit.spokenText };
  } catch {
    // fall through
  }
  const inv = inventoryBySlug().get(slug);
  if (inv?.utterance_id?.startsWith("utt_f")) {
    return {
      kind: "form",
      utterance_id: inv.utterance_id,
      spokenText: inv.spokenText,
      slug,
    };
  }
  throw new Error(`no publish route for "${spokenText}" (${slug})`);
}

function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const samples = join(repoRoot, "data/samples");
  const takesDir = join(samples, V4_LAB_BATCH, "takes");
  const doc = loadReviewDoc(samples);
  const inv = inventoryBySlug();

  const approved = Object.entries(doc.bySlug ?? {})
    .filter(([, row]) => row?.status === "approved")
    .map(([slug]) => slug)
    .sort();

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of approved) {
    const mp3 = join(takesDir, labTakeFilename(slug, "v4_plain"));
    if (!existsSync(mp3)) {
      skipped++;
      console.error(`SKIP ${slug}: missing ${labTakeFilename(slug, "v4_plain")}`);
      continue;
    }
    let spokenText = inv.get(slug)?.spokenText;
    if (!spokenText) {
      try {
        spokenText = resolveLabWord(slug).spokenText;
      } catch {
        spokenText = slug.replace(/_/g, " ");
      }
    }
    if (!inv.has(slug) && !["an", "car", "his"].includes(slug)) {
      console.warn(`WARN ${slug}: not in elevenlabs inventory (publishing anyway)`);
    }
    try {
      const target = resolvePublishTarget(slug, spokenText);
      if (target.kind === "form") {
        const result = publishCatalogForm({
          sourceMp3Path: mp3,
          utterance_id: target.utterance_id,
          spokenText: target.spokenText,
          slug: target.slug ?? slug,
          dryRun,
        });
        ok++;
        console.log(
          `${dryRun ? "[dry-run] " : ""}form ${target.spokenText} (${target.utterance_id}) -> ${result.clip.key}`,
        );
      } else {
        const result = publishCatalogTile({
          sourceMp3Path: mp3,
          slot: target.slot,
          spokenText: target.spokenText,
          dryRun,
        });
        ok++;
        console.log(
          `${dryRun ? "[dry-run] " : ""}tile ${target.spokenText} (slot ${target.slot}) -> ${result.clip.key}`,
        );
      }
    } catch (err) {
      failed++;
      console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `done: ${ok} published, ${skipped} skipped (no mp3), ${failed} failed, ${approved.length} approved`,
  );
  if (failed > 0) process.exit(1);
}

main();
