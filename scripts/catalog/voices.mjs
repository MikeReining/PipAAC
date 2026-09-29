/**
 * Committed catalog voice IDs (primary Grok + backup ElevenLabs).
 * API keys stay in the environment only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./paths.mjs";

export const CATALOG_VOICES_PATH = join(repoRoot, "data/catalog/voices.json");

export function loadCatalogVoices(path = CATALOG_VOICES_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function getPrimaryVoice(doc = loadCatalogVoices()) {
  return doc.primary;
}

export function getBackupVoice(doc = loadCatalogVoices()) {
  return doc.backup;
}

export function getCatalogTileVoice(doc = loadCatalogVoices()) {
  const tiles = doc.tiles;
  if (!tiles?.voice_id) {
    throw new Error("data/catalog/voices.json is missing tiles.voice_id");
  }
  if (!tiles?.model) {
    throw new Error("data/catalog/voices.json is missing tiles.model");
  }
  return tiles;
}
