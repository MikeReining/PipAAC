/**
 * Tile voice library (`data/catalog/tile_voices.json`) — Pip, Leo, etc.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./paths.mjs";

export const TILE_VOICES_PATH = join(repoRoot, "data/catalog/tile_voices.json");

export function loadTileVoices(path = TILE_VOICES_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** @param {string} voiceKey e.g. voi_leo_en */
export function getTileVoiceByKey(voiceKey, doc = loadTileVoices()) {
  const row = (doc.voices ?? []).find((v) => v.voice_key === voiceKey);
  if (!row) throw new Error(`unknown tile voice_key: ${voiceKey}`);
  return row;
}
