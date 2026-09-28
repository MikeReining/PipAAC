#!/usr/bin/env node
/**
 * Inventory catalog clips minted via ElevenLabs (not original WBB / Bitsboard).
 *
 *   node scripts/catalog/list_elevenlabs_catalog_audio.mjs
 *   node scripts/catalog/list_elevenlabs_catalog_audio.mjs --json
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { repoRoot } from "./paths.mjs";

const CATALOG_PATH = join(repoRoot, "data/catalog/catalog.json");
const GENERATED_PATH = join(repoRoot, "data/catalog/generated_audio.json");
const FORMS_PATH = join(repoRoot, "data/catalog/forms_audio.json");
const TILE_SHIPPING = join(repoRoot, "data/samples/elevenlabs-tiles-core/shipping.json");
const FORMS_SHIPPING = join(repoRoot, "data/samples/elevenlabs-forms-core/shipping.json");

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function fromCatalogClips() {
  const doc = loadJson(CATALOG_PATH);
  const list = Array.isArray(doc?.clips) ? doc.clips : [];
  return list
    .filter((c) => c?.source === "elevenlabs" && c?.status === "ready")
    .map((c) => ({
      layer: "catalog.clips",
      spokenText: c.recorded_text ?? c.spokenText,
      key: c.key,
      utterance_id: c.utterance_id,
      sha256: c.sha256,
    }));
}

function fromGeneratedAudio() {
  const doc = loadJson(GENERATED_PATH);
  return (doc?.entries ?? []).map((e) => ({
    layer: "generated_audio.json",
    slot: e.slot,
    spokenText: e.spokenText,
    key: e.clip?.key,
    sha256: e.clip?.sha256,
    voice: e.clip?.voice,
  }));
}

function fromFormsAudio() {
  const doc = loadJson(FORMS_PATH);
  return (doc?.entries ?? [])
    .filter((e) => e?.clip?.source === "elevenlabs")
    .map((e) => ({
      layer: "forms_audio.json",
      utterance_id: e.utterance_id,
      spokenText: e.spoken_text ?? e.spokenText,
      key: e.clip?.key,
      sha256: e.clip?.sha256,
    }));
}

function shippingSlugs(path, label) {
  const doc = loadJson(path);
  return Object.entries(doc?.bySlug ?? {}).map(([slug, row]) => ({
    layer: label,
    slug,
    spokenText: row.spokenText,
    key: row.clip?.key,
    slot: row.slot,
    utterance_id: row.utterance_id,
  }));
}

/** @returns {{ summary: Record<string, number>, uniqueClips: object[], tileShipping: object[], formsShipping: object[] }} */
export function collectElevenLabsInventory() {
  const catalogEleven = fromCatalogClips();
  const generated = fromGeneratedAudio();
  const forms = fromFormsAudio();
  const tileShip = shippingSlugs(TILE_SHIPPING, "elevenlabs-tiles shipping.json");
  const formsShip = shippingSlugs(FORMS_SHIPPING, "elevenlabs-forms shipping.json");

  const byKey = new Map();
  for (const row of [...catalogEleven, ...generated, ...forms]) {
    if (!row.key) continue;
    if (!byKey.has(row.key)) byKey.set(row.key, row);
  }

  const summary = {
    catalogClipsElevenlabs: catalogEleven.length,
    generatedAudioEntries: generated.length,
    formsAudioElevenlabs: forms.length,
    uniqueClipKeys: byKey.size,
    tileShippingRows: tileShip.length,
    formsShippingRows: formsShip.length,
  };

  const uniqueClips = [...byKey.values()].sort((a, b) =>
    String(a.spokenText).localeCompare(String(b.spokenText)),
  );

  return { summary, uniqueClips, tileShipping: tileShip, formsShipping: formsShip };
}

function main() {
  const asJson = process.argv.includes("--json");
  const { summary, uniqueClips, tileShipping, formsShipping } = collectElevenLabsInventory();

  if (asJson) {
    console.log(JSON.stringify({ summary, uniqueClips, tileShipping, formsShipping }, null, 2));
    return;
  }

  console.log("ElevenLabs catalog audio inventory (truth: clip.source === elevenlabs in catalog + sidecars)\n");
  console.log(`  catalog.json clips (elevenlabs): ${summary.catalogClipsElevenlabs}`);
  console.log(`  generated_audio.json (launch gap-fill): ${summary.generatedAudioEntries}`);
  console.log(`  forms_audio.json (elevenlabs):     ${summary.formsAudioElevenlabs}`);
  console.log(`  unique audio keys (deduped):       ${summary.uniqueClipKeys}`);
  console.log(`  tile review shipping.json rows:    ${summary.tileShippingRows}`);
  console.log(`  forms review shipping.json rows:   ${summary.formsShippingRows}`);
  console.log("\nRegeneration target: uniqueClips list (--json). WBB/Bitsboard hits are everything else in audio_import.");
  console.log("Next: v4 lab listen → production publish path when ready (founder ear + explicit approve).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
