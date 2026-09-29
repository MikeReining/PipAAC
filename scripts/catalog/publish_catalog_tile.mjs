/**
 * Promote an ear-approved tile MP3 into the local catalog cache, generated_audio.json, and WBB R2.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import {
  DEFAULT_AUDIO_CACHE_ROOT,
  DEFAULT_GENERATED_AUDIO_PATH,
  repoRoot,
} from "./paths.mjs";
import { recordTileShipping } from "./tile_catalog_lookup.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { localPathForAudioKey, r2PutArgs, sha256File } from "./storage.mjs";

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
 * @param {string} spokenText
 * @param {string} mp3Path
 * @param {string} voiceId
 */
export function buildClipRecord(spokenText, mp3Path, voiceId) {
  const sha = sha256File(mp3Path);
  const slug = catalogSlug(spokenText);
  const key = `audio/${slug}/${sha.slice(0, 12)}.mp3`;
  return {
    key,
    sha256: sha,
    source: "elevenlabs",
    voice: voiceId,
    spokenText,
  };
}

/**
 * @param {string} generatedPath
 * @param {number} slot
 * @param {string} spokenText
 * @param {object} clip
 */
export function mergeGeneratedAudioFile(generatedPath, slot, spokenText, clip) {
  let doc = { schemaVersion: 1, entries: [] };
  if (existsSync(generatedPath)) {
    doc = JSON.parse(readFileSync(generatedPath, "utf8"));
  }
  const voice = getCatalogTileVoice().voice_id;
  const bySlot = new Map((doc.entries ?? []).map((e) => [e.slot, e]));
  bySlot.set(slot, { slot, spokenText, clip });
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice,
    entries: [...bySlot.values()].sort((a, b) => a.slot - b.slot),
  };
  writeFileSync(generatedPath, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/**
 * @param {{ sourceMp3Path: string, slot: number, spokenText: string, dryRun?: boolean }} opts
 */
export function publishCatalogTile({ sourceMp3Path, slot, spokenText, dryRun = false }) {
  if (!existsSync(sourceMp3Path)) throw new Error(`missing source mp3: ${sourceMp3Path}`);
  if (!Number.isFinite(slot)) throw new Error("slot is required");

  const voice = getCatalogTileVoice();
  const clip = buildClipRecord(spokenText, sourceMp3Path, voice.voice_id);
  const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
  const destDir = dirname(dest);
  if (existsSync(destDir)) {
    try {
      if (lstatSync(destDir).isSymbolicLink()) unlinkSync(destDir);
    } catch {
      // leave real dirs alone
    }
  }
  mkdirSync(destDir, { recursive: true });

  if (!dryRun) {
    copyFileSync(sourceMp3Path, dest);
    runR2Put(clip.key, dest);
    mergeGeneratedAudioFile(DEFAULT_GENERATED_AUDIO_PATH, slot, spokenText, clip);
    recordTileShipping({
      slug: catalogSlug(spokenText),
      slot,
      spokenText,
      clip,
      sourcePath: sourceMp3Path,
    });
  }

  return { clip, localPath: dest, slot, dryRun };
}
