/**
 * Promote an ear-approved form-surface MP3 into local cache, R2, and forms_audio.json.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { FORMS_REVIEW_BATCH } from "./elevenlabs_tile_variations.mjs";
import { buildClipRecord } from "./publish_catalog_tile.mjs";
import { DEFAULT_AUDIO_CACHE_ROOT, repoRoot } from "./paths.mjs";
import { recordTileShipping } from "./tile_catalog_lookup.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { localPathForAudioKey, r2PutArgs } from "./storage.mjs";

const FORMS_AUDIO_PATH = join(repoRoot, "data/catalog/forms_audio.json");

function wranglerBin() {
  return join(repoRoot, "node_modules/.bin/wrangler");
}

function runR2Put(key, sourcePath) {
  const result = spawnSync(wranglerBin(), r2PutArgs(key, sourcePath), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `r2 put failed for ${key}: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`,
    );
  }
}

/**
 * @param {string} formsPath
 * @param {string} utterance_id
 * @param {string} spokenText
 * @param {object} clip
 */
export function mergeFormsAudioFile(formsPath, utterance_id, spokenText, clip) {
  let doc = { schemaVersion: 1, entries: [], needed: [], missing: [] };
  if (existsSync(formsPath)) {
    doc = JSON.parse(readFileSync(formsPath, "utf8"));
  }
  const voice = getCatalogTileVoice();
  const byId = new Map((doc.entries ?? []).map((e) => [e.utterance_id, e]));
  byId.set(utterance_id, {
    utterance_id,
    spoken_text: spokenText,
    clip,
  });
  const entries = [...byId.values()].sort((a, b) => a.utterance_id.localeCompare(b.utterance_id));
  const needed = doc.needed ?? [];
  const covered = new Set(entries.map((e) => e.utterance_id));
  const missing = needed.filter((u) => !covered.has(u.utterance_id));
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: voice.voice_id,
    entries,
    needed,
    missing,
  };
  writeFileSync(formsPath, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/**
 * @param {{ sourceMp3Path: string, utterance_id: string, spokenText: string, slug: string, dryRun?: boolean }} opts
 */
export function publishCatalogForm({ sourceMp3Path, utterance_id, spokenText, slug, dryRun = false }) {
  if (!existsSync(sourceMp3Path)) throw new Error(`missing source mp3: ${sourceMp3Path}`);
  if (!utterance_id) throw new Error("utterance_id is required");

  const voice = getCatalogTileVoice();
  const clip = buildClipRecord(spokenText, sourceMp3Path, voice.voice_id);
  const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
  mkdirSync(dirname(dest), { recursive: true });

  if (!dryRun) {
    copyFileSync(sourceMp3Path, dest);
    runR2Put(clip.key, dest);
    mergeFormsAudioFile(FORMS_AUDIO_PATH, utterance_id, spokenText, clip);
    recordTileShipping({
      slug,
      slot: null,
      spokenText,
      clip,
      sourcePath: sourceMp3Path,
      batch: FORMS_REVIEW_BATCH,
      utterance_id,
    });
  }

  return { clip, localPath: dest, utterance_id, dryRun };
}
