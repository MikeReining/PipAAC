/**
 * ElevenLabs voice selector — three candidates per round, pick one (extra catalog voices).
 * Samples: data/samples/elevenlabs-voice-selector/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { synthesizeElevenLabs, voiceSettingsForModel } from "./elevenlabs_tts.mjs";
import { repoRoot } from "./paths.mjs";
import { getCatalogTileVoice } from "./voices.mjs";

export const VOICE_SELECTOR_BATCH = "elevenlabs-voice-selector";
export const VOICE_SELECTOR_VARIATION = "v4_plain";

const TAKE_RE = /^(.+)__([a-z0-9]+)_v4_plain\.mp3$/i;

export function roundConfigPath(samplesRoot = join(repoRoot, "data/samples")) {
  return join(samplesRoot, VOICE_SELECTOR_BATCH, "round.json");
}

export function decisionsPath(samplesRoot = join(repoRoot, "data/samples")) {
  return join(samplesRoot, VOICE_SELECTOR_BATCH, "decisions.json");
}

export function loadRoundConfig(samplesRoot) {
  const path = roundConfigPath(samplesRoot);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(doc.candidates) || doc.candidates.length !== 3) {
    throw new Error("round.json must list exactly 3 candidates");
  }
  if (!Array.isArray(doc.probes) || doc.probes.length < 1) {
    throw new Error("round.json must list probes");
  }
  return doc;
}

export function loadDecisions(samplesRoot) {
  const path = decisionsPath(samplesRoot);
  if (!existsSync(path)) {
    return { schemaVersion: 1, roundId: null, pickedCandidateId: null, pickedVoiceId: null, at: null };
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {{ roundId: string, pickedCandidateId: string, pickedVoiceId: string, intentLabel?: string }} pick
 */
export function saveDecision(pick, samplesRoot) {
  const path = decisionsPath(samplesRoot);
  mkdirSync(join(samplesRoot, VOICE_SELECTOR_BATCH), { recursive: true });
  const out = {
    schemaVersion: 1,
    roundId: pick.roundId,
    intentLabel: pick.intentLabel ?? null,
    pickedCandidateId: pick.pickedCandidateId,
    pickedVoiceId: pick.pickedVoiceId,
    at: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/**
 * @param {string} slug
 * @param {string} candidateId e.g. c1
 */
export function probeTakeFilename(slug, candidateId) {
  return `${slug}__${candidateId}_${VOICE_SELECTOR_VARIATION}.mp3`;
}

/**
 * @param {string} filename
 */
export function parseProbeTakeFilename(filename) {
  const base = String(filename ?? "").replace(/\.mp3$/i, "");
  const m = TAKE_RE.exec(`${base}.mp3`);
  if (!m) return null;
  return { slug: m[1], candidateId: m[2] };
}

export function isVoiceSelectorBatch(batch) {
  return batch === VOICE_SELECTOR_BATCH;
}

/**
 * @param {{ slug: string, spokenText: string, candidateId: string, voiceId: string, samplesRoot?: string }} opts
 */
export async function mintVoiceSelectorProbe({
  slug,
  spokenText,
  candidateId,
  voiceId,
  samplesRoot,
}) {
  const root = samplesRoot ?? join(repoRoot, "data/samples");
  const round = loadRoundConfig(root);
  const model = round.model ?? "eleven_v4";
  const tiles = getCatalogTileVoice();
  const text = String(spokenText ?? slug.replace(/_/g, " ")).trim();
  const relOut = `${VOICE_SELECTOR_BATCH}/takes/${probeTakeFilename(slug, candidateId)}`;
  const outPath = join(root, relOut);
  mkdirSync(join(root, VOICE_SELECTOR_BATCH, "takes"), { recursive: true });
  const buf = await synthesizeElevenLabs({
    text,
    voiceId,
    model,
    voiceSettings: voiceSettingsForModel(model, tiles.voice_settings ?? {}),
  });
  writeFileSync(outPath, buf);
  return { relOut, outPath, text, bytes: buf.length, candidateId, voiceId };
}

/** @param {string} probe spoken label */
export function probeSlug(probe) {
  return catalogSlug(probe);
}
