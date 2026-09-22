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

export const MUSE_MODEL = "meta/muse-image";
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/images";
export const MAX_STYLE_REFS = 3;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_STYLE_REF_DIR = join(repoRoot, "assets/style-refs/pip-v1");

export function resolveApiKey() {
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/);
      if (match && match[1]) {
        return match[1].replace(/^["']|["']$/g, "");
      }
    }
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

const IRREGULAR_PLURALS = new Set([
  "dice",
  "teeth",
  "children",
  "people",
  "feet",
  "mice",
  "geese",
  "men",
  "women",
  "scissors",
  "glasses",
  "pants",
  "shorts",
  "clothes",
]);

export function isPluralWord(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (!w) return false;
  if (IRREGULAR_PLURALS.has(w)) return true;
  if (!w.endsWith("s")) return false;
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is") || w.endsWith("ics")) return false;
  return true;
}

/**
 * Builds the canonical Pip AAC icon prompt.
 * 
 * 1. Teaching framing
 * 2. Locked style clause
 * 3. No text constraint
 * 4. Plural rule (if applicable)
 * 5. Fitzgerald torso rule (for stick figures)
 * 6. Scene hint (for abstract/preposition concepts)
 */
export function buildPrompt({ word, torso = null, hint = null }) {
  const lines = [
    `We are trying to teach a child the concept of: ${word}.`,
    "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
    "Do not include any text in the image.",
  ];

  if (isPluralWord(word)) {
    lines.push("Show more than one.");
  }

  if (torso) {
    lines.push(`The stick figure's torso is solid ${torso}.`);
  }

  if (hint) {
    lines.push(hint);
  }

  return lines.join("\n");
}

export function extractImage(payload) {
  const b64 = payload?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const text = JSON.stringify(payload ?? {}).slice(0, 200);
  throw new Error(`no image in response: ${text}`);
}

export async function generateToFile({
  word,
  torso = null,
  hint = null,
  prompt = null,
  out = null,
  refDir = DEFAULT_STYLE_REF_DIR,
  fetchImpl = globalThis.fetch,
  apiKey = resolveApiKey(),
} = {}) {
  const text = prompt ?? buildPrompt({ word, torso, hint });
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("OPENROUTER_API_KEY is not set. Please export it or add to .env.");
  }

  const dest = out ?? `/tmp/${(word ?? "image").replace(/[^a-zA-Z0-9]+/g, "-")}.png`;
  const body = {
    model: MUSE_MODEL,
    prompt: text,
    aspect_ratio: "1:1",
    output_format: "png",
    input_references: loadStyleRefs(refDir).map((r) => ({
      type: "image_url",
      image_url: { url: r.dataUri },
    })),
  };

  const res = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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
    out: null,
    prompt: null,
    print: false,
    refDir: DEFAULT_STYLE_REF_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--word") out.word = argv[++i];
    else if (a === "--torso") out.torso = argv[++i];
    else if (a === "--hint") out.hint = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--ref-dir") out.refDir = argv[++i];
    else if (a === "--print-prompt") out.print = true;
    else throw new Error(`unknown flag: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompt = args.prompt ?? buildPrompt({ word: args.word, torso: args.torso, hint: args.hint });

  if (!args.word && !args.prompt) {
    console.error("Usage: node scripts/art/gen.mjs --word <word> [--torso <color>] [--hint <hint>] [--out <dest>]");
    process.exit(1);
  }

  console.log("--- prompt ---");
  console.log(prompt);
  console.log("--------------");
  if (args.print) return;

  const started = Date.now();
  const { dest, bytes } = await generateToFile({
    word: args.word,
    torso: args.torso,
    hint: args.hint,
    prompt: args.prompt,
    out: args.out,
    refDir: args.refDir,
  });
  console.log(`wrote ${dest}  ${(bytes.length / 1024).toFixed(0)}KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
