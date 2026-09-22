#!/usr/bin/env node
/**
 * Generate audio for lexicon rows the WorkbookBench catalog missed, using
 * ElevenLabs with the same voice id and settings WBB bakes with
 * (eleven_v3, stability 0.4, similarity 0.8, speaker boost).
 *
 *   node scripts/catalog/generate_missing_audio.mjs
 *
 * Writes assets/catalog/audio/<word>/<sha12>.mp3 and emits
 * data/catalog/generated_audio.json for build_catalog.mjs to merge.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_AUDIO_CACHE_ROOT,
  DEFAULT_AUDIO_IMPORT_PATH,
  DEFAULT_GENERATED_AUDIO_PATH,
  repoRoot,
  resolveWorkbookBenchRoot,
} from "./paths.mjs";
import { sha256File } from "./storage.mjs";

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    // .env absent — rely on real env
  }
}

function slug(spokenText) {
  return spokenText.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function main() {
  loadEnv();
  const wbbRoot = resolveWorkbookBenchRoot();
  const tts = await import(pathToFileURL(join(wbbRoot, "scripts/catalog/tts.mjs")).href);
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

  const plan = JSON.parse(readFileSync(DEFAULT_AUDIO_IMPORT_PATH, "utf8"));
  const misses = plan.entries.filter((e) => e.status === "miss");
  if (misses.length === 0) {
    console.log("generate_missing_audio: no misses");
  }

  const entries = [];
  for (const miss of misses) {
    const text = miss.spokenText;
    const buf = await tts.synthesize({ text, voiceId });
    const dir = join(DEFAULT_AUDIO_CACHE_ROOT, "audio", slug(text));
    mkdirSync(dir, { recursive: true });
    // content-addressed like the WBB keys: sha256 prefix is the filename
    const tmp = join(dir, ".tmp.mp3");
    writeFileSync(tmp, buf);
    const sha = sha256File(tmp);
    const key = `audio/${slug(text)}/${sha.slice(0, 12)}.mp3`;
    const dest = join(DEFAULT_AUDIO_CACHE_ROOT, key);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    writeFileSync(tmp, ""); // clear tmp
    entries.push({
      slot: miss.slot,
      spokenText: text,
      clip: {
        key,
        sha256: sha,
        source: "elevenlabs",
        voice: voiceId,
        spokenText: text,
      },
    });
    console.log(`generated ${text} -> ${key}`);
  }

  const existing = JSON.parse(readFileSync(DEFAULT_GENERATED_AUDIO_PATH, "utf8").toString() || "{}");
  const bySlot = new Map((existing.entries ?? []).map((e) => [e.slot, e]));
  for (const e of entries) bySlot.set(e.slot, e);
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: voiceId,
    entries: [...bySlot.values()].sort((a, b) => a.slot - b.slot),
  };
  mkdirSync(dirname(DEFAULT_GENERATED_AUDIO_PATH), { recursive: true });
  writeFileSync(DEFAULT_GENERATED_AUDIO_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`Wrote ${DEFAULT_GENERATED_AUDIO_PATH} (${out.entries.length} generated)`);
}

main();
