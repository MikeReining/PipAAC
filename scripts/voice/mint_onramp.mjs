#!/usr/bin/env node
/**
 * Mint the welcome/demo prompt clips (public/shared/onramp_audio.mjs) in
 * the product voice — the exact production sentence recipe: Eleven v4,
 * voice/settings from data/catalog/tile_voices.json (voi_default_en),
 * elevenSentenceLine terminal punctuation.
 *
 *   node scripts/voice/mint_onramp.mjs            mint all missing takes
 *   node scripts/voice/mint_onramp.mjs --only a-child,tour-want
 *   node scripts/voice/mint_onramp.mjs --ship     copy takes -> public/audio/onramp/
 *
 * Takes land in data/samples/onramp/takes/ (gitignored) for the founder
 * listen (AGENTS.md: mint locally, then wait for the ear). --ship is the
 * "approved" move only.
 *
 * Key: ELEVENLABS_API_KEY from env, .env, or .dev.vars.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONRAMP_CLIPS, onrampClipPath } from "../../public/shared/onramp_audio.mjs";
import { elevenSentenceLine } from "../../src/shared/expressive_eleven.mjs";
import { synthesizeElevenLabs } from "../catalog/elevenlabs_tts.mjs";
import tileVoices from "../../data/catalog/tile_voices.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TAKES = path.join(ROOT, "data/samples/onramp/takes");

function loadKey() {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return process.env.ELEVENLABS_API_KEY.trim();
  for (const f of [".env", ".dev.vars"]) {
    try {
      const m = fs.readFileSync(path.join(ROOT, f), "utf8")
        .match(/^ELEVENLABS_API_KEY=(.*)$/m);
      if (m?.[1]?.trim()) return m[1].trim();
    } catch { /* next file */ }
  }
  throw new Error("ELEVENLABS_API_KEY not found in env, .env, or .dev.vars");
}

const args = process.argv.slice(2);
const only = args.includes("--only")
  ? new Set(args[args.indexOf("--only") + 1].split(","))
  : null;
const ship = args.includes("--ship");
const force = args.includes("--force");

const voice = tileVoices.voices.find((v) => v.voice_key === "voi_default_en" && v.status === "active");
if (!voice) throw new Error("voi_default_en missing or inactive in tile_voices.json");

if (ship) {
  let n = 0;
  for (const key of Object.keys(ONRAMP_CLIPS)) {
    const src = path.join(TAKES, `${key}.mp3`);
    const dst = path.join(ROOT, "public", onrampClipPath(key));
    if (!fs.existsSync(src)) { console.error(`missing take: ${key}`); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    n++;
  }
  console.log(`shipped ${n}/${Object.keys(ONRAMP_CLIPS).length} clips to public/audio/onramp/`);
  process.exit(0);
}

fs.mkdirSync(TAKES, { recursive: true });
const apiKey = loadKey();
for (const [key, text] of Object.entries(ONRAMP_CLIPS)) {
  if (only && !only.has(key)) continue;
  const out = path.join(TAKES, `${key}.mp3`);
  if (fs.existsSync(out) && !force) { console.log(`skip ${key} (exists)`); continue; }
  const mintText = elevenSentenceLine(text, "neutral");
  const audio = await synthesizeElevenLabs({
    text: mintText, voiceId: voice.voice_id, model: voice.model,
    voiceSettings: voice.voice_settings, apiKey,
  });
  fs.writeFileSync(out, audio);
  console.log(`minted ${key}  <- "${mintText}"`);
}
console.log(`takes: ${TAKES}`);
