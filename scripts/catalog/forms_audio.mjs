#!/usr/bin/env node
/**
 * 021/022 — the word-form clip census.
 *
 * Form labels that share a lemma's surface reuse its utterance and clip
 * (has, him, an already speak). The rest — utt_f#### rows like
 * "wants", "going", "wakes up", "doesn't", "dogs", "mom's" — need clips.
 *
 * Census + WBB resolve for form-surface clips (`utt_f####`). Missing
 * surfaces are minted in ElevenLabs catalog voice via
 * `elevenlabs-forms-core` (see `docs/operations/ElevenLabs_Tile_Minting.md`).
 * Grok `ara` is for sentences and may become an optional extra voice —
 * it does not replace the default tile voice.
 *
 *   node scripts/catalog/forms_audio.mjs   # census + WBB resolve + write list
 *
 * Emits data/catalog/forms_audio.json — entries (covered clips) plus
 * needed/missing surfaces. build_catalog.mjs merges the entries into
 * clip rows keyed by (utterance id, surface); its strict build stays
 * blocked until every form utterance has a clip.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_AUDIO_CACHE_ROOT,
  repoRoot,
} from "./paths.mjs";
import {
  clipPayloadFromWbb,
  loadWbbManifest,
  resolveWbbAudioForEntry,
} from "./wbb_audio.mjs";
import { localPathForAudioKey, r2GetArgs, sha256File } from "./storage.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "./build_catalog.mjs";

const FORMS_AUDIO_PATH = join(repoRoot, "data/catalog/forms_audio.json");
const MAP_MD = join(repoRoot, "docs/product/Core_Coordinate_Map.md");
const LEXICON_PATH = join(repoRoot, "data/launch_lexicon.json");

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
  // Build the catalog in memory rather than reading catalog.json: new
  // form surfaces may not be shipped yet (the strict clip guard holds
  // the file until this plan covers them — this script produces it).
  const lexicon = JSON.parse(readFileSync(LEXICON_PATH, "utf8"));
  const map = parseCoordinateMapMarkdown(readFileSync(MAP_MD, "utf8"));
  const catalog = buildCatalog(lexicon, map);
  const needed = formUtterances(catalog);
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(FORMS_AUDIO_PATH, "utf8"));
  } catch {
    // no forms_audio.json yet — everything is to-do
  }
  // A plan entry only covers an utterance when the surface still matches:
  // fresh utt_f#### mints are positional, so a forms-data change can move
  // an id to a different surface — trusting the id alone would speak the
  // wrong word.
  const done = new Map();
  for (const e of existing.entries ?? []) done.set(e.utterance_id, e);
  const stale = [];
  const todo = needed.filter((u) => {
    const e = done.get(u.utterance_id);
    if (!e) return true;
    if (e.spoken_text !== u.spoken_text) {
      stale.push(`${u.utterance_id}: "${e.spoken_text}" now "${u.spoken_text}"`);
      done.delete(u.utterance_id);
      return true;
    }
    return false;
  });
  if (stale.length) console.log(`stale plan entries (surface moved): ${stale.length}`);
  for (const s of stale) console.log(`  stale ${s}`);
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

  const liveIds = new Set(needed.map((u) => u.utterance_id));
  const uncovered = needed.filter((u) => !entries.has(u.utterance_id));
  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    voice: "WWMMC6k9tdar0BthUenK",
    entries: [...entries.values()]
      .filter((e) => liveIds.has(e.utterance_id))
      .sort((a, b) => a.utterance_id.localeCompare(b.utterance_id)),
    // Mint/review queue: every needed form surface, then the subset still missing a clip
    needed: needed.map((u) => ({ utterance_id: u.utterance_id, spoken_text: u.spoken_text })),
    missing: uncovered.map((u) => ({ utterance_id: u.utterance_id, spoken_text: u.spoken_text })),
  };
  mkdirSync(dirname(FORMS_AUDIO_PATH), { recursive: true });
  writeFileSync(FORMS_AUDIO_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`wrote ${FORMS_AUDIO_PATH}: ${out.entries.length} clips, ${uncovered.length} uncovered`);
  if (uncovered.length) console.log(`  still missing: ${uncovered.map((u) => u.spoken_text).join(", ")}`);
}

main();
