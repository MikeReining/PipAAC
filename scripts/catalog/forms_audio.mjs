#!/usr/bin/env node
/**
 * 021 slice 2 — voice clips for the grammar-form utterances.
 *
 * Form labels that share a lemma's surface reuse its utterance and clip
 * (has, him, an already speak). The new surfaces — utt_f#### rows like
 * "wants", "going", "wakes up", "doesn't" — need clips in the SAME
 * voice. WorkbookBench first (its catalog has most -ing forms), then
 * ElevenLabs with the identical voice id and settings the base words
 * were baked with (founder-authorized 2026-09-25).
 *
 *   node scripts/catalog/forms_audio.mjs            # plan + WBB resolve/materialize
 *   node scripts/catalog/forms_audio.mjs --generate # also synthesize the misses
 *
 * Emits data/catalog/forms_audio.json — build_catalog.mjs merges it
 * into clip rows keyed by utterance id. Idempotent: a covered
 * utterance is never re-synthesized (TTS output isn't deterministic).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_AUDIO_CACHE_ROOT,
  repoRoot,
  resolveWorkbookBenchRoot,
} from "./paths.mjs";
import {
  clipPayloadFromWbb,
  loadWbbManifest,
  resolveWbbAudioForEntry,
} from "./wbb_audio.mjs";
import { localPathForAudioKey, r2GetArgs, sha256File } from "./storage.mjs";

const CATALOG_PATH = join(repoRoot, "data/catalog/catalog.json");
const FORMS_AUDIO_PATH = join(repoRoot, "data/catalog/forms_audio.json");

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

const slug = (text) =>
  text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** The form-only utterances — utt_f#### rows minted by the forms pass. */
function formUtterances(catalog) {
  const uttById = new Map(catalog.utterances.map((u) => [u.id, u]));
  const needed = new Map();
  for (const l of catalog.labels) {
    if (l.kind !== "form") continue;
    const u = uttById.get(l.utterance_id);
    if (u?.id.startsWith("utt_f")) needed.set(u.id, u.spoken_text);
  }
  return [...needed.entries()]
    .map(([utterance_id, spoken_text]) => ({ utterance_id, spoken_text }))
    .sort((a, b) => a.utterance_id.localeCompare(b.utterance_id));
}

function r2Get(key, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const r = spawnSync(join(repoRoot, "node_modules/.bin/wrangler"), r2GetArgs(key, dest), {
    cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(`r2 get ${key}: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  }
}

async function main() {
  const generate = process.argv.includes("--generate");
  loadEnv();
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const needed = formUtterances(catalog);
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(FORMS_AUDIO_PATH, "utf8"));
  } catch {
    // no forms_audio.json yet — everything is to-do
  }
  const done = new Map((existing.entries ?? []).map((e) => [e.utterance_id, e]));
  const todo = needed.filter((u) => !done.has(u.utterance_id));
  console.log(`form utterances: ${needed.length} needed, ${done.size} covered, ${todo.length} to resolve`);

  const manifest = loadWbbManifest();
  const hits = [];
  const misses = [];
  for (const u of todo) {
    const res = await resolveWbbAudioForEntry(
      { slot: u.utterance_id, tier: 0, spokenText: u.spoken_text }, manifest);
    (res.status === "hit" ? hits : misses).push({ ...u, res });
  }
  console.log(`WorkbookBench: ${hits.length} hits, ${misses.length} misses`);
  for (const h of hits) console.log(`  wbb  ${h.spoken_text} -> ${h.res.clip.key}`);
  for (const m of misses) console.log(`  gen  ${m.spoken_text}`);

  const entries = new Map(done);
  for (const h of hits) {
    const clip = clipPayloadFromWbb(h.res.clip);
    const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
    try {
      r2Get(clip.key, dest);
    } catch (err) {
      console.log(`  SKIP ${h.spoken_text}: ${String(err).slice(0, 120)}`);
      misses.push({ ...h, res: { status: "miss", reason: "r2 get failed" } });
      continue;
    }
    clip.sha256 = clip.sha256 ?? sha256File(dest);
    entries.set(h.utterance_id, { ...h, clip });
  }

  if (generate && misses.length) {
    const wbbRoot = resolveWorkbookBenchRoot();
    const tts = await import(pathToFileURL(join(wbbRoot, "scripts/catalog/tts.mjs")).href);
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");
    for (const m of [...misses]) {
      if (entries.has(m.utterance_id)) continue; // an r2 failure stays a miss
      const text = m.spoken_text;
      const buf = await tts.synthesize({ text, voiceId });
      const tmp = join(DEFAULT_AUDIO_CACHE_ROOT, "audio", slug(text), ".tmp.mp3");
      mkdirSync(dirname(tmp), { recursive: true });
      writeFileSync(tmp, buf);
      const sha = sha256File(tmp);
      const realKey = `audio/${slug(text)}/${sha.slice(0, 12)}.mp3`;
      const dest = localPathForAudioKey(DEFAULT_AUDIO_CACHE_ROOT, realKey);
      writeFileSync(dest, buf);
      writeFileSync(tmp, "");
      entries.set(m.utterance_id, {
        ...m,
        clip: { key: realKey, sha256: sha, source: "elevenlabs", voice: voiceId, spokenText: text },
      });
      console.log(`  made ${text} -> ${realKey}`);
    }
  }

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: process.env.ELEVENLABS_VOICE_ID ?? null,
    entries: [...entries.values()].sort((a, b) =>
      a.utterance_id.localeCompare(b.utterance_id)),
  };
  mkdirSync(dirname(FORMS_AUDIO_PATH), { recursive: true });
  writeFileSync(FORMS_AUDIO_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  const uncovered = needed.filter((u) => !entries.has(u.utterance_id));
  console.log(`wrote ${FORMS_AUDIO_PATH}: ${entries.size} clips, ${uncovered.length} uncovered`);
  if (uncovered.length) console.log(`  still missing: ${uncovered.map((u) => u.spoken_text).join(", ")}`);
}

main();
