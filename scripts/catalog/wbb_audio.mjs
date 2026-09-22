import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

import {
  DEFAULT_LEXICON_PATH,
  DEFAULT_OVERRIDES_PATH,
  resolveWorkbookBenchRoot,
  WBB_LOOKUP_REL,
  WBB_MANIFEST_REL,
} from "./paths.mjs";

/** @typedef {{ slot: number, tier: number, spokenText: string, partOfSpeech?: string }} LexiconEntry */

let lookupModulePromise = null;

async function loadWbbLookup() {
  if (!lookupModulePromise) {
    const wbbRoot = resolveWorkbookBenchRoot();
    const href = pathToFileURL(join(wbbRoot, WBB_LOOKUP_REL)).href;
    lookupModulePromise = import(href);
  }
  return lookupModulePromise;
}

export function loadLexicon(path = DEFAULT_LEXICON_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadOverrides(path = DEFAULT_OVERRIDES_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { bySpokenText: {} };
  }
}

export function loadWbbManifest() {
  const wbbRoot = resolveWorkbookBenchRoot();
  return JSON.parse(readFileSync(join(wbbRoot, WBB_MANIFEST_REL), "utf8"));
}

/**
 * Resolve WorkbookBench catalog audio for one Pip lexicon row.
 *
 * @param {LexiconEntry} entry
 * @param {object} manifest WorkbookBench manifest
 * @param {{ bySpokenText?: Record<string, { wbbSenseId?: string }> }} overrides
 */
export async function resolveWbbAudioForEntry(entry, manifest, overrides = {}) {
  const { findAudio, findAudioForWord } = await loadWbbLookup();
  const spoken = String(entry.spokenText ?? "").trim();
  if (!spoken) {
    return { status: "miss", reason: "empty spokenText" };
  }

  const override = overrides.bySpokenText?.[spoken] ?? overrides.bySpokenText?.[spoken.toLowerCase()];
  if (override?.wbbSenseId) {
    const clip = findAudio(override.wbbSenseId, manifest);
    if (clip) {
      return { status: "hit", wbbSenseId: override.wbbSenseId, clip, via: "override" };
    }
    return { status: "miss", reason: `override sense ${override.wbbSenseId} has no ready audio` };
  }

  const clip = findAudioForWord(spoken, manifest);
  if (!clip) {
    return { status: "miss", reason: "no ready take in WorkbookBench catalog" };
  }

  return {
    status: "hit",
    wbbSenseId: clip.senseId ?? null,
    clip,
    via: "lookup",
  };
}

/** @param {LexiconEntry[]} entries */
export async function resolveAllWbbAudio(entries, manifest, overrides = {}) {
  /** @type {Array<Awaited<ReturnType<typeof resolveWbbAudioForEntry>> & { entry: LexiconEntry }>} */
  const rows = [];
  for (const entry of entries) {
    const result = await resolveWbbAudioForEntry(entry, manifest, overrides);
    rows.push({ entry, ...result });
  }
  return rows;
}

export function summarizeAudioResolution(rows) {
  const summary = { total: rows.length, hits: 0, misses: 0 };
  for (const row of rows) {
    if (row.status === "hit") summary.hits += 1;
    else summary.misses += 1;
  }
  return summary;
}

export function clipPayloadFromWbb(clip) {
  if (!clip?.key) return null;
  return {
    key: clip.key,
    sha256: clip.verifiedSha256 ?? null,
    source: clip.source ?? null,
    voice: clip.voice ?? null,
    wbbAudioId: clip.id ?? null,
    spokenText: clip.spokenText ?? null,
  };
}
