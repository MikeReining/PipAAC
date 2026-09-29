#!/usr/bin/env node
/**
 * Pip AAC — Art Generator Harness
 *
 * Generates vector-grade clipart icons for AAC tiles using the frozen 3-image
 * style bundle (assets/style-refs/pip-v1) via OpenRouter Images API (Muse Image).
 *
 * Usage:
 *   node scripts/art/gen.mjs --word run --torso green --out /tmp/run.png
 *   node scripts/art/gen.mjs --word in --hint "a simple open box with a bold pink arrow entering inside" --out /tmp/in.png
 *   node scripts/art/gen.mjs --word apple --out /tmp/apple.png
 *   node scripts/art/gen.mjs --word help --print-prompt
 */

import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const META_API_ENDPOINT = "https://api.meta.ai/v1/images/edits";
export const META_GEN_ENDPOINT = "https://api.meta.ai/v1/images/generations";
export const META_MUSE_MODEL = "muse-image-1.0";
export const MAX_STYLE_REFS = 3;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_STYLE_REF_DIR = join(repoRoot, "assets/style-refs/pip-v1");
export const OBJECT_STYLE_REF_DIR = join(repoRoot, "assets/style-refs/object-v1");
export const GLYPH_WORDS_PATH = join(repoRoot, "data/art/glyph_words.json");

/** Opaque words that get a hand-drawn glyph, never a generated picture. */
export function loadGlyphWords(path = GLYPH_WORDS_PATH) {
  return new Set(Object.keys(JSON.parse(readFileSync(path, "utf8")).words));
}

export function resolveApiKey(keyName = "OPENROUTER_API_KEY") {
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(new RegExp(`^\\s*${keyName}\\s*=\\s*(.*?)\\s*$`));
      if (match && match[1]) {
        const val = match[1].replace(/^["']|["']$/g, "").trim();
        if (val) return val;
      }
    }
  }
  if (process.env[keyName] && process.env[keyName].trim()) {
    return process.env[keyName].trim();
  }
  return null;
}



const styleRefCache = new Map();

/** Sniff true MIME type from header magic bytes */
export function sniffImageMime(filePath) {
  const head = readFileSync(filePath).subarray(0, 4);
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50) return "image/png";
  throw new Error(`unrecognized image bytes in style reference: ${filePath}`);
}

/** Load the frozen style bundle (max 3 images) as base64 data URIs */
export function loadStyleRefs(dir = DEFAULT_STYLE_REF_DIR) {
  if (styleRefCache.has(dir)) return styleRefCache.get(dir);
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`style reference directory not found: ${dir}`);
  }
  const files = entries
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg");
    })
    .sort();

  if (files.length === 0) {
    throw new Error(`style reference directory is empty: ${dir}`);
  }
  if (files.length > MAX_STYLE_REFS) {
    throw new Error(
      `style reference directory holds ${files.length} images; the frozen bundle is exactly ${MAX_STYLE_REFS}: ${dir}`,
    );
  }

  const refs = files.map((f) => ({
    file: f,
    dataUri: `data:${sniffImageMime(join(dir, f))};base64,${readFileSync(join(dir, f)).toString("base64")}`,
  }));
  styleRefCache.set(dir, refs);
  return refs;
}

import {
  isPluralWord,
  VALID_FRAMINGS,
  VALID_SOCIAL_SCALES,
  VALID_ENTITY_MODES,
  VALID_PACKAGING,
  VALID_HAND_MODES,
  formatHandMode,
  buildPrompt,
  DRAW_JEV_QUESTIONS,
  parseDrawSpec,
  MUSE_MODEL,
  OPENROUTER_ENDPOINT,
  appHeaders,
  styleRefBundle,
} from "../../src/shared/draw_prompt.mjs";
export {
  isPluralWord,
  VALID_FRAMINGS,
  VALID_SOCIAL_SCALES,
  VALID_ENTITY_MODES,
  VALID_PACKAGING,
  MUSE_MODEL,
  OPENROUTER_ENDPOINT,
  appHeaders,
  VALID_HAND_MODES,
  formatHandMode,
  buildPrompt,
};

export function extractImage(payload) {
  const b64 = payload?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const text = JSON.stringify(payload ?? {}).slice(0, 200);
  throw new Error(`no image in response: ${text}`);
}

export const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export async function classifyWithJev({
  word,
  apiKey = resolveApiKey("TYPESAFE_API_KEY"),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("TYPESAFE_API_KEY is not set. Please export it or add to .env.");
  }

  const body = {
    state: `Word to illustrate: "${word}". Context: Core AAC communication board symbol for a non-verbal child. Needs high legibility at 48x48px on an iPad grid.`,
    model: "jev-latest",
    questions: DRAW_JEV_QUESTIONS,
  };

  const res = await fetchImpl(TYPESAFE_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TypeSafe Jev HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  return { model: data.model, ...parseDrawSpec(data?.answers), raw: data };
}

export async function generateToFile({
  word,
  torso = null,
  hint = null,
  framing = null,
  hand = null,
  social_scale = null,
  entity_mode = null,
  packaging = null,
  brand = null,
  prompt = null,
  out = null,
  refDir = DEFAULT_STYLE_REF_DIR,
  lane = null,
  fetchImpl = globalThis.fetch,
  apiKey = resolveApiKey("OPENROUTER_API_KEY"),
  glyphWords = loadGlyphWords(),
} = {}) {
  if (word && glyphWords.has(String(word).trim().toLowerCase())) {
    throw new Error(`"${word}" is an opaque word: it gets a hand-drawn glyph (data/art/glyph_words.json), not a generated picture.`);
  }
  const text = prompt ?? buildPrompt({
    word,
    torso,
    hint,
    framing,
    hand,
    social_scale,
    entity_mode,
    packaging,
    brand,
  });
  const dest = out ?? `/tmp/${(word ?? "image").replace(/[^a-zA-Z0-9]+/g, "-")}.png`;
  const isPackshot = entity_mode === "category_packshot" || entity_mode === "cpg_brand";

  const metaApiKey = resolveApiKey("META_API_KEY");
  if (metaApiKey) {
    let endpoint = META_API_ENDPOINT;
    const body = {
      model: META_MUSE_MODEL,
      prompt: text,
      n: 1,
    };
    if (isPackshot) {
      endpoint = META_GEN_ENDPOINT;
    } else {
      const effectiveRefDir =
        refDir === DEFAULT_STYLE_REF_DIR
          && styleRefBundle({ entity_mode, framing, social_scale }) === "object-v1"
          ? OBJECT_STYLE_REF_DIR
          : refDir;
      body.images = loadStyleRefs(effectiveRefDir).map((r) => ({
        image_url: r.dataUri,
      }));
    }

    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${metaApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}\n${errText.slice(0, 1200)}`);
    }

    const rawBytes = extractImage(await res.json());
    const bytes = await sharp(rawBytes).png().toBuffer();
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    return { dest, bytes, prompt: text };
  }

  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("Neither META_API_KEY nor OPENROUTER_API_KEY is set. Please export one or add to .env.");
  }

  const body = {
    model: MUSE_MODEL,
    prompt: text,
    aspect_ratio: "1:1",
    output_format: "png",
  };

  if (!isPackshot) {
    const effectiveRefDir =
      refDir === DEFAULT_STYLE_REF_DIR
        && styleRefBundle({ entity_mode, framing, social_scale }) === "object-v1"
        ? OBJECT_STYLE_REF_DIR
        : refDir;

    body.input_references = loadStyleRefs(effectiveRefDir).map((r) => ({
      type: "image_url",
      image_url: { url: r.dataUri },
    }));
  }

  const res = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...appHeaders(lane) },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}\n${errText.slice(0, 1200)}`);
  }

  const bytes = extractImage(await res.json());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { dest, bytes, prompt: text };
}

export function parseArgs(argv) {
  const out = {
    word: null,
    torso: null,
    hint: null,
    framing: null,
    hand: null,
    social_scale: null,
    entity_mode: null,
    packaging: null,
    brand: null,
    out: null,
    prompt: null,
    print: false,
    classify: false,
    refDir: DEFAULT_STYLE_REF_DIR,
    lane: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--word") out.word = argv[++i];
    else if (a === "--torso") out.torso = argv[++i];
    else if (a === "--hint") out.hint = argv[++i];
    else if (a === "--mode" || a === "--entity-mode") {
      const m = argv[++i];
      if (!VALID_ENTITY_MODES.has(m)) {
        throw new Error(`invalid entity mode: ${m}. Must be one of: ${[...VALID_ENTITY_MODES].join(", ")}`);
      }
      out.entity_mode = m;
    }
    else if (a === "--packshot") out.entity_mode = "category_packshot";
    else if (a === "--cpg") out.entity_mode = "cpg_brand";
    else if (a === "--packaging") {
      const p = argv[++i];
      if (!VALID_PACKAGING.has(p)) {
        throw new Error(`invalid packaging: ${p}. Must be one of: ${[...VALID_PACKAGING].join(", ")}`);
      }
      out.packaging = p;
    }
    else if (a === "--brand") out.brand = argv[++i];
    else if (a === "--framing") {
      const f = argv[++i];
      if (!VALID_FRAMINGS.has(f)) {
        throw new Error(`invalid framing: ${f}. Must be one of: ${[...VALID_FRAMINGS].join(", ")}`);
      }
      out.framing = f;
    }
    else if (a === "--hand") {
      const h = argv[++i];
      if (!VALID_HAND_MODES.has(h)) {
        throw new Error(`invalid hand mode: ${h}. Must be one of: ${[...VALID_HAND_MODES].join(", ")}`);
      }
      out.hand = h;
    }
    else if (a === "--social-scale") {
      const s = argv[++i];
      if (!VALID_SOCIAL_SCALES.has(s)) {
        throw new Error(`invalid social scale: ${s}. Must be one of: ${[...VALID_SOCIAL_SCALES].join(", ")}`);
      }
      out.social_scale = s;
    }
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--ref-dir") out.refDir = argv[++i];
    else if (a === "--lane") out.lane = argv[++i];
    else if (a === "--print-prompt" || a === "--print") out.print = true;
    else if (a === "--classify") out.classify = true;
    else throw new Error(`unknown flag: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.word && !args.prompt) {
    console.error("Usage: node scripts/art/gen.mjs --word <word> [--mode <concept_action|organic_noun|category_packshot|cpg_brand>] [--packaging <pouch|jar|can|box|bottle|tub|bar>] [--brand <brand>] [--torso <color>] [--framing <face|bust|full|diagram|object|contrast>] [--hand <mode>] [--social-scale <zero|solo|pair|group>] [--hint <hint>] [--out <dest>] [--lane <slug>] [--classify]");
    process.exit(1);
  }

  if (args.classify && args.word) {
    console.log(`Classifying "${args.word}" with TypeSafe Jev...`);
    const cls = await classifyWithJev({ word: args.word });
    console.log(`Jev classification (${cls.model}):`);
    console.log(`  Entity mode: ${cls.entity_mode}`);
    console.log(`  Packaging: ${cls.packaging}`);
    console.log(`  Framing: ${cls.framing}`);
    console.log(`  Hand mode: ${cls.hand_mode}`);
    console.log(`  Anchor: ${cls.anchor}`);
    console.log(`  Social scale: ${cls.social_scale}`);
    if (!args.entity_mode) args.entity_mode = cls.entity_mode;
    if (!args.packaging && cls.packaging !== "none") args.packaging = cls.packaging;
    if (!args.framing) args.framing = cls.framing;
    if (!args.hand) args.hand = cls.hand_mode;
    if (!args.social_scale) args.social_scale = cls.social_scale;
  }

  const prompt = args.prompt ?? buildPrompt({
    word: args.word,
    torso: args.torso,
    hint: args.hint,
    framing: args.framing,
    hand: args.hand,
    social_scale: args.social_scale,
    entity_mode: args.entity_mode,
    packaging: args.packaging,
    brand: args.brand,
  });

  console.log("--- prompt ---");
  console.log(prompt);
  console.log("--------------");
  if (args.print) return;

  const started = Date.now();
  const { dest, bytes } = await generateToFile({
    word: args.word,
    torso: args.torso,
    hint: args.hint,
    framing: args.framing,
    hand: args.hand,
    social_scale: args.social_scale,
    entity_mode: args.entity_mode,
    packaging: args.packaging,
    brand: args.brand,
    prompt: args.prompt,
    out: args.out,
    refDir: args.refDir,
    lane: args.lane,
  });
  console.log(`wrote ${dest}  ${(bytes.length / 1024).toFixed(0)}KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


