#!/usr/bin/env node
/**
 * Eleven v4 expressive sentence probe — one emotion / round at a time.
 * Samples: data/samples/elevenlabs-expressive-probe/
 *
 *   npm run catalog:expressive-probe:mint -- --round faces
 *   npm run catalog:expressive-probe:mint -- --round happy-v2 --force
 *
 * Listen: npm run catalog:audio:review → /audio-review/elevenlabs-expressive
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { buildGrokTtsBody, synthesizeGrokVoice } from "./grok_tts.mjs";
import { synthesizeElevenLabs, voiceSettingsForModel } from "./elevenlabs_tts.mjs";
import { repoRoot } from "./paths.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import {
  ELEVEN_EXPRESSIVE_FEELINGS,
  ELEVEN_EXPRESSIVE_WINNERS,
  elevenExpressiveMintText,
  elevenSentenceLine,
} from "../../src/shared/expressive_eleven.mjs";
import { applyEmotionalProsody } from "../../src/worker/prosody.mjs";

export {
  ELEVEN_EXPRESSIVE_WINNERS,
  elevenSentenceLine,
} from "../../src/shared/expressive_eleven.mjs";

export const EXPRESSIVE_PROBE_BATCH = "elevenlabs-expressive-probe";
export const EXPRESSIVE_PROBE_MODEL = "eleven_v4";

const DEFAULT_SENTENCE = "I want an apple";

export const EXPRESSIVE_COMPARE_FEELINGS = ELEVEN_EXPRESSIVE_FEELINGS;

/** @typedef {{ id: string, label: string, lineFeeling: "neutral"|"happy"|"sad"|"angry", prefix: string }} ProbeVariantDef */

/**
 * One round = one emotion focus. Each variant is a single prepended tag/prose direction + sentence line.
 * @type {Record<string, { roundId: string, title: string, variants: ProbeVariantDef[] }>}
 */
export const EXPRESSIVE_PROBE_ROUNDS = {
  faces: {
    roundId: "faces-v1",
    title: "Four faces (first probe)",
    variants: [
      { id: "neutral", label: "Neutral", lineFeeling: "neutral", prefix: "" },
      { id: "happy_excited", label: "Happy [excited]", lineFeeling: "happy", prefix: "[excited] " },
      { id: "sad_crying", label: "Sad [crying]", lineFeeling: "sad", prefix: "[crying] " },
      { id: "angry_shout", label: "Angry [shouting]", lineFeeling: "angry", prefix: "[shouting] " },
    ],
  },
  "happy-v2": {
    roundId: "happy-v2",
    title: "Happy only — prose / voice-quality tags",
    variants: [
      { id: "neutral_ref", label: "Reference neutral", lineFeeling: "neutral", prefix: "" },
      { id: "tag_happy", label: "[happy] (Enhance list)", lineFeeling: "happy", prefix: "[happy] " },
      {
        id: "prose_warm",
        label: "Warm conversational (doc example)",
        lineFeeling: "happy",
        prefix: "[warm, conversational tone, faint amusement] ",
      },
      {
        id: "prose_cheerful",
        label: "Cheerful bright voice (prose) — winner happy-v2",
        lineFeeling: "happy",
        prefix: "[cheerful, bright voice] ",
      },
    ],
  },
  "sad-v2": {
    roundId: "sad-v2",
    title: "Sad only — prose / voice-quality tags",
    variants: [
      { id: "neutral_ref", label: "Reference neutral", lineFeeling: "neutral", prefix: "" },
      { id: "tag_sad", label: "[sad] (Enhance list) — winner sad-v2", lineFeeling: "sad", prefix: "[sad] " },
      {
        id: "prose_sympathetic",
        label: "Sympathetic (customer-service doc)",
        lineFeeling: "sad",
        prefix: "[sympathetic] ",
      },
      {
        id: "prose_subdued",
        label: "Softly subdued (prose)",
        lineFeeling: "sad",
        prefix: "[softly, subdued voice] ",
      },
      {
        id: "prose_reflective",
        label: "Quiet reflective (doc narration)",
        lineFeeling: "sad",
        prefix: "[quiet, reflective tone] ",
      },
    ],
  },
  "angry-v2": {
    roundId: "angry-v2",
    title: "Angry only — prose / voice-quality tags",
    variants: [
      { id: "neutral_ref", label: "Reference neutral", lineFeeling: "neutral", prefix: "" },
      { id: "tag_angry", label: "[angry] (Enhance list)", lineFeeling: "angry", prefix: "[angry] " },
      {
        id: "tag_shouting",
        label: "[shouting] (faces-v1 — was fairly good)",
        lineFeeling: "angry",
        prefix: "[shouting] ",
      },
      {
        id: "prose_frustrated",
        label: "Frustrated — winner angry-v2",
        lineFeeling: "angry",
        prefix: "[frustrated] ",
      },
      {
        id: "prose_firm",
        label: "Firm irritated (prose)",
        lineFeeling: "angry",
        prefix: "[firm, irritated voice] ",
      },
    ],
  },
};

/**
 * @param {string} sentence
 * @param {ProbeVariantDef} def
 */
export function elevenTextForProbeVariant(sentence, def) {
  const line = elevenSentenceLine(sentence, def.lineFeeling);
  return `${def.prefix}${line}`.trim();
}

/** @param {"happy"|"sad"|"angry"} feeling */
export function elevenWinnerText(sentence, feeling) {
  return elevenExpressiveMintText(sentence, feeling);
}

/** Legacy single-tag mapping (faces round). */
export function elevenV4ExpressiveText(sentence, feeling = "neutral") {
  const map = {
    neutral: EXPRESSIVE_PROBE_ROUNDS.faces.variants[0],
    happy: EXPRESSIVE_PROBE_ROUNDS.faces.variants[1],
    sad: EXPRESSIVE_PROBE_ROUNDS.faces.variants[2],
    angry: EXPRESSIVE_PROBE_ROUNDS.faces.variants[3],
  };
  const def = map[feeling];
  if (!def) throw new Error(`unknown feeling: ${feeling}`);
  return elevenTextForProbeVariant(sentence, def);
}

export const EXPRESSIVE_PROBE_FEELINGS = ["neutral", "happy", "sad", "angry"];

export function sentenceSlug(sentence) {
  const slug = catalogSlug(sentence);
  return slug || "sentence";
}

export function probeTakeFilename(sentence, variantId) {
  return `${sentenceSlug(sentence)}_${variantId}.mp3`;
}

export function probeManifestPath(samplesRoot = join(repoRoot, "data/samples")) {
  return join(samplesRoot, EXPRESSIVE_PROBE_BATCH, "probe.json");
}

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

export function loadProbeManifest(samplesRoot = join(repoRoot, "data/samples")) {
  const path = probeManifestPath(samplesRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export const COMPARE_ROUND_KEY = "compare-v1";

export function resolveProbeRound(roundKey) {
  const key = roundKey ?? "faces";
  if (key === COMPARE_ROUND_KEY) {
    return {
      roundId: COMPARE_ROUND_KEY,
      title: "Grok Ara vs Pip — three winning feelings",
    };
  }
  const round = EXPRESSIVE_PROBE_ROUNDS[key];
  if (!round) {
    const keys = [...Object.keys(EXPRESSIVE_PROBE_ROUNDS), COMPARE_ROUND_KEY];
    throw new Error(`unknown --round ${key} (try: ${keys.join(", ")})`);
  }
  return round;
}

function catalogGrokPrimaryVoice() {
  const path = join(repoRoot, "data/catalog/voices.json");
  const doc = JSON.parse(readFileSync(path, "utf8"));
  return doc.primary ?? { voice_id: "ara", label: "Grok Ara", language: "en" };
}

/**
 * @param {{ sentence?: string, samplesRoot?: string, force?: boolean }} [opts]
 */
export async function mintExpressiveCompare(opts = {}) {
  const root = opts.samplesRoot ?? join(repoRoot, "data/samples");
  mkdirSync(join(root, EXPRESSIVE_PROBE_BATCH, "takes"), { recursive: true });

  const sentence = String(opts.sentence ?? DEFAULT_SENTENCE).trim();
  const force = Boolean(opts.force);
  const eve = getCatalogTileVoice();
  const grokVoice = catalogGrokPrimaryVoice();
  const model = EXPRESSIVE_PROBE_MODEL;
  const slug = sentenceSlug(sentence);

  const variants = [];
  for (const feeling of EXPRESSIVE_COMPARE_FEELINGS) {
    const grokText = applyEmotionalProsody(sentence, feeling);
    const elevenText = elevenWinnerText(sentence, feeling);

    for (const row of [
      {
        id: `${feeling}_grok`,
        provider: "grok",
        label: `${feeling} — Grok ${grokVoice.label ?? "Ara"}`,
        synthText: grokText,
        mint: async () => {
          const body = buildGrokTtsBody(grokText, {
            voiceId: grokVoice.voice_id ?? "ara",
            language: grokVoice.language ?? "en",
          });
          return synthesizeGrokVoice(body);
        },
      },
      {
        id: `${feeling}_eleven`,
        provider: "elevenlabs",
        label: `${feeling} — Pip`,
        synthText: elevenText,
        mint: async () =>
          synthesizeElevenLabs({
            text: elevenText,
            voiceId: eve.voice_id,
            model,
            voiceSettings: voiceSettingsForModel(model, eve.voice_settings ?? {}),
          }),
      },
    ]) {
      const filename = `${slug}_compare_${row.id}.mp3`;
      const relOut = `${EXPRESSIVE_PROBE_BATCH}/takes/${filename}`;
      const outPath = join(root, relOut);
      if (!force && existsSync(outPath)) {
        variants.push({
          id: row.id,
          feeling,
          provider: row.provider,
          label: row.label,
          synthText: row.synthText,
          takeRel: relOut,
          skipped: true,
        });
        continue;
      }
      const buf = await row.mint();
      writeFileSync(outPath, buf);
      variants.push({
        id: row.id,
        feeling,
        provider: row.provider,
        label: row.label,
        synthText: row.synthText,
        takeRel: relOut,
        bytes: buf.length,
        skipped: false,
      });
    }
  }

  const doc = {
    schema: "pippaac.elevenlabs-expressive-probe.v1",
    batch: EXPRESSIVE_PROBE_BATCH,
    layout: "compare",
    roundKey: COMPARE_ROUND_KEY,
    roundId: COMPARE_ROUND_KEY,
    title: "Grok Ara vs Pip — three winning feelings",
    generatedAt: new Date().toISOString(),
    sentence,
    grokVoice: {
      label: grokVoice.label ?? "Grok Ara",
      voice_id: grokVoice.voice_id ?? "ara",
    },
    voice: {
      label: eve.label ?? "Pip",
      voice_id: eve.voice_id,
      model,
    },
    variants,
  };
  writeFileSync(probeManifestPath(root), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/**
 * @param {{ sentence?: string, roundKey?: string, samplesRoot?: string, force?: boolean }} [opts]
 */
export async function mintExpressiveProbe(opts = {}) {
  const root = opts.samplesRoot ?? join(repoRoot, "data/samples");
  const batchRoot = join(root, EXPRESSIVE_PROBE_BATCH);
  mkdirSync(join(batchRoot, "takes"), { recursive: true });

  const sentence = String(opts.sentence ?? DEFAULT_SENTENCE).trim();
  const round = resolveProbeRound(opts.roundKey);
  const voice = getCatalogTileVoice();
  const model = EXPRESSIVE_PROBE_MODEL;
  const force = Boolean(opts.force);

  const variants = [];
  for (const def of round.variants) {
    const elevenText = elevenTextForProbeVariant(sentence, def);
    const filename = probeTakeFilename(sentence, def.id);
    const relOut = `${EXPRESSIVE_PROBE_BATCH}/takes/${filename}`;
    const outPath = join(root, relOut);
    if (!force && existsSync(outPath)) {
      variants.push({
        id: def.id,
        label: def.label,
        lineFeeling: def.lineFeeling,
        elevenText,
        takeRel: relOut,
        skipped: true,
      });
      continue;
    }
    const buf = await synthesizeElevenLabs({
      text: elevenText,
      voiceId: voice.voice_id,
      model,
      voiceSettings: voiceSettingsForModel(model, voice.voice_settings ?? {}),
    });
    writeFileSync(outPath, buf);
    variants.push({
      id: def.id,
      label: def.label,
      lineFeeling: def.lineFeeling,
      elevenText,
      takeRel: relOut,
      bytes: buf.length,
      skipped: false,
    });
  }

  const doc = {
    schema: "pippaac.elevenlabs-expressive-probe.v1",
    batch: EXPRESSIVE_PROBE_BATCH,
    roundKey: opts.roundKey ?? "faces",
    roundId: round.roundId,
    title: round.title,
    generatedAt: new Date().toISOString(),
    sentence,
    voice: {
      label: voice.label ?? "Pip",
      voice_id: voice.voice_id,
      model,
      voice_settings: voice.voice_settings ?? {},
    },
    variants,
  };
  writeFileSync(probeManifestPath(root), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const sentence = argValue("--sentence") ?? DEFAULT_SENTENCE;
  const roundKey = argValue("--round") ?? "faces";
  const round = resolveProbeRound(roundKey);

  if (roundKey === COMPARE_ROUND_KEY) {
    const grokVoice = catalogGrokPrimaryVoice();
    console.log(`Expressive compare — Grok ${grokVoice.voice_id} vs Pip (${EXPRESSIVE_PROBE_MODEL})`);
    console.log(`Round: ${roundKey} — ${round.title}`);
    console.log(`Sentence: "${sentence}"`);
    for (const feeling of EXPRESSIVE_COMPARE_FEELINGS) {
      console.log(`  ${feeling} grok:   ${applyEmotionalProsody(sentence, feeling)}`);
      console.log(`  ${feeling} eleven: ${elevenWinnerText(sentence, feeling)}`);
    }
    if (dryRun) return;
    const doc = await mintExpressiveCompare({ sentence, force });
    for (const v of doc.variants) {
      console.log(v.skipped ? `skip ${v.id} (exists)` : `minted ${v.id} -> ${v.takeRel}`);
    }
    const port = process.env.PIP_AUDIO_REVIEW_PORT || 3747;
    console.log(`Listen: http://127.0.0.1:${port}/audio-review/elevenlabs-expressive`);
    return;
  }

  console.log(`Eleven v4 expressive probe — ${getCatalogTileVoice().label} (${EXPRESSIVE_PROBE_MODEL})`);
  console.log(`Round: ${roundKey} — ${round.title}`);
  console.log(`Sentence: "${sentence}"`);
  for (const def of round.variants) {
    console.log(`  ${def.id}: ${elevenTextForProbeVariant(sentence, def)}`);
  }
  if (dryRun) return;

  const doc = await mintExpressiveProbe({ sentence, roundKey, force });
  for (const v of doc.variants) {
    console.log(v.skipped ? `skip ${v.id} (exists)` : `minted ${v.id} -> ${v.takeRel}`);
  }
  const port = process.env.PIP_AUDIO_REVIEW_PORT || 3747;
  console.log(`Listen: http://127.0.0.1:${port}/audio-review/elevenlabs-expressive`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
