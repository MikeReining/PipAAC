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

export const VALID_FRAMINGS = new Set(["face", "bust", "full", "diagram", "object"]);

export const VALID_HAND_MODES = new Set([
  "resting_ball",
  "pointing_mitten",
  "grip_mitten",
  "pincer_grasp",
  "open_palm_up",
  "press_down",
]);

export function formatHandMode(mode) {
  switch (mode) {
    case "resting_ball":
      return "The stick figure's hands are simple featureless circles with no fingers.";
    case "pointing_mitten":
      return "One hand is in a pointing mitten pose with a single extended pointer finger.";
    case "grip_mitten":
      return "The hands are mitten-shaped grips holding the object.";
    case "pincer_grasp":
      return "The hand shows a pincer grasp with thumb and index finger touching.";
    case "open_palm_up":
      return "Both hands are open cupped palms facing upward to receive.";
    case "press_down":
      return "The hand has an open flat palm pressing downward.";
    default:
      return null;
  }
}

/**
 * Builds the canonical Pip AAC icon prompt.
 * 
 * 1. Teaching framing
 * 2. Locked style clause
 * 3. No text constraint
 * 4. Plural rule (if applicable)
 * 5. Framing lens clause (face, bust, full, diagram, object)
 * 6. Fitzgerald torso rule (for stick figures with torso visible)
 * 7. Hand mode clause (for stick figures with hands visible)
 * 8. Scene hint (for abstract/preposition concepts)
 */
export function buildPrompt({ word, torso = null, hint = null, framing = null, hand = null }) {
  const lines = [
    `We are trying to teach a child the concept of: ${word}.`,
    "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
    "Do not include any text in the image.",
  ];

  if (isPluralWord(word)) {
    lines.push("Show more than one.");
  }

  if (framing === "face") {
    lines.push("Close-up shot of a stick figure face filling the frame. Head only, no body, no legs.");
  } else if (framing === "bust") {
    lines.push("Close-up shot of the stick figure from the chest up. Upper body and hands only, no legs.");
  } else if (framing === "full") {
    lines.push("Full body stick figure with complete posture and legs.");
  } else if (framing === "diagram") {
    lines.push("A clean graphic diagram with no human figures.");
  } else if (framing === "object") {
    lines.push("A clean standalone object with no human figures.");
  }

  if (torso && framing !== "face" && framing !== "diagram" && framing !== "object") {
    lines.push(`The stick figure's torso is solid ${torso}.`);
  }

  if (hand && framing !== "face" && framing !== "diagram" && framing !== "object") {
    const handClause = formatHandMode(hand);
    if (handClause) lines.push(handClause);
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
    questions: {
      framing: {
        type: "choice",
        instructions: "Best visual framing lens for this AAC word",
        criteria: {
          face: "Extreme close-up of facial expression only (emotions, feelings)",
          bust: "Upper chest, head, hands (fine motor, manual action, chest gestures)",
          full: "Full body stick figure with complete legs (locomotion, posture, walking)",
          diagram: "Graphic spatial diagram with box and arrow, no humans (prepositions)",
          object: "Standalone inanimate object or universal sign (nouns, stop sign)",
        },
      },
      hand_mode: {
        type: "choice",
        instructions: "Optimal hand depiction for this action",
        criteria: {
          resting_ball: "Featureless smooth circle (passive, swinging, no fine fingers)",
          pointing_mitten: "Fist with single extended pointer finger (pointing, deictic)",
          grip_mitten: "Thumb and curled fingers grasping a physical prop",
          pincer_grasp: "Thumb and index finger touching to hold tiny item",
          open_palm_up: "Two open cupped palms facing upward to receive/beg/plead",
          press_down: "Flat palm or finger pressing downward onto a surface/button",
        },
      },
      proloquo_anchor: {
        type: "choice",
        instructions: "What physical anchor or visual crutch is needed to prevent semantic ambiguity?",
        criteria: {
          directional_arrow: "A bold directional arrow indicating movement direction (e.g. green arrival arrow for come, forward arrow for go)",
          action_button: "A large round pushbutton or checkmark switch being pressed (for abstract actions like do)",
          interlocking_blocks: "Two distinct toy blocks snapping together with mating studs (for make/build)",
          shelf_retrieval: "Reaching up to take an object off a shelf or surface with retrieval arrow (for get/take)",
          receiving_palms: "Open cupped palms held outward to receive an item (for need/want)",
          none: "No extra physical anchor needed; human posture or face is sufficient",
        },
      },
    },
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
  return {
    model: data.model,
    framing: data?.answers?.framing?.choice ?? "full",
    hand_mode: data?.answers?.hand_mode?.choice ?? "resting_ball",
    anchor: data?.answers?.proloquo_anchor?.choice ?? "none",
    raw: data,
  };
}

export async function generateToFile({
  word,
  torso = null,
  hint = null,
  framing = null,
  hand = null,
  prompt = null,
  out = null,
  refDir = DEFAULT_STYLE_REF_DIR,
  fetchImpl = globalThis.fetch,
  apiKey = resolveApiKey("OPENROUTER_API_KEY"),
} = {}) {
  const text = prompt ?? buildPrompt({ word, torso, hint, framing, hand });
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
    framing: null,
    hand: null,
    out: null,
    prompt: null,
    print: false,
    classify: false,
    refDir: DEFAULT_STYLE_REF_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--word") out.word = argv[++i];
    else if (a === "--torso") out.torso = argv[++i];
    else if (a === "--hint") out.hint = argv[++i];
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
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--ref-dir") out.refDir = argv[++i];
    else if (a === "--print-prompt") out.print = true;
    else if (a === "--classify") out.classify = true;
    else throw new Error(`unknown flag: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.word && !args.prompt) {
    console.error("Usage: node scripts/art/gen.mjs --word <word> [--torso <color>] [--framing <face|bust|full|diagram|object>] [--hand <mode>] [--hint <hint>] [--out <dest>] [--classify]");
    process.exit(1);
  }

  if (args.classify && args.word) {
    console.log(`Classifying "${args.word}" with TypeSafe Jev...`);
    const cls = await classifyWithJev({ word: args.word });
    console.log(`Jev classification (${cls.model}):`);
    console.log(`  Framing: ${cls.framing}`);
    console.log(`  Hand mode: ${cls.hand_mode}`);
    console.log(`  Anchor: ${cls.anchor}`);
    if (!args.framing) args.framing = cls.framing;
    if (!args.hand) args.hand = cls.hand_mode;
  }

  const prompt = args.prompt ?? buildPrompt({
    word: args.word,
    torso: args.torso,
    hint: args.hint,
    framing: args.framing,
    hand: args.hand,
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


