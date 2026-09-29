/**
 * Picture lab helpers — the prompt-planner lane (spark) and the mint
 * path used by /api/lab/* in calibration_dev.mjs. The planner's system
 * prompt is data/pictures/draw_planner_prompt.md, read fresh on every
 * call so the file IS the tweak surface.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyWithJev, extractImage, loadStyleRefs, resolveApiKey,
  DEFAULT_STYLE_REF_DIR, OBJECT_STYLE_REF_DIR,
} from "../art/gen.mjs";
import {
  MUSE_MODEL, OPENROUTER_ENDPOINT, appHeaders, buildPrompt, styleRefBundle,
} from "../../src/shared/draw_prompt.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const LAB_TAKES_DIR = join(repoRoot, "out/draw_lab");
export const PLANNER_PROMPT_PATH =
  join(repoRoot, "data/pictures/draw_planner_prompt.md");
export const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";

/** The planner lanes — same draw_planner_prompt.md, same one-sentence
 *  contract, different brains. The lab runs both so speed and hint
 *  quality can be compared; whichever wins becomes the production
 *  default. qwen routes to Groq via OpenRouter's provider order, and
 *  thinking is off — a hint is not a reasoning task. */
export const PLANNER_MODELS = {
  spark: { model: "meta/muse-spark-1.3-contributor" },
  qwen: {
    model: "qwen/qwen3-32b",
    provider: { order: ["Groq"], allow_fallbacks: true },
    reasoning: { effort: "none" },
  },
};

/** What spark/qwen sees: the concept, the family's description (the
 *  subject for personal scope), and Jev's draw spec. No ids exist on
 *  this path. */
export function plannerChatBody({ lane = "spark", text, description, spec, system }) {
  const cfg = PLANNER_MODELS[lane];
  if (!cfg) throw new Error(`unknown planner lane ${lane}`);
  return {
    ...cfg,
    messages: [
      { role: "system", content: system ?? plannerSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          concept: String(text ?? ""),
          description: description || null,
          spec,
        }, null, 2),
      },
    ],
  };
}

/* ----------------------------- prompt planner ---------------------------- */

/** Re-read every call — editing the md is the whole point of the lab. */
export function plannerSystemPrompt({ path = PLANNER_PROMPT_PATH } = {}) {
  const md = readFileSync(path, "utf8");
  return md.slice(md.indexOf("---") + 3).trim();
}



/** Pull the hint sentence out of the chat response; spark may wrap it
 *  in quotes or add whitespace — strip that, keep the sentence. */
export function parseSparkHint(payload) {
  const msg = payload?.choices?.[0]?.message?.content;
  const text = String(msg ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text) throw new Error(`no prompt in response: ${JSON.stringify(payload).slice(0, 200)}`);
  return text;
}

/** The skill's banned moves (art-generator SKILL.md §4B–§4F): style
 *  words that fight the reference images, camera policing, and negative
 *  laundry lists. A hint that trips these gets flagged in the lab before
 *  a paid mint. */
export const BANNED_HINT_PATTERNS = [
  /\bflat\b/i, /\bvector\b/i, /\boutlines?\b/i, /\bstrokes?\b/i,
  /\bshad(e|ed|ing)\b/i, /\bsolid colou?rs?\b/i, /\bcontrast(y|ing)?\b/i,
  /\bclip ?art\b/i, /\bicon(ic)? style\b/i, /\bminimalist\b/i,
  /\bcentered\b/i, /\bcentred\b/i, /\bsymmetric/i, /\bfront[- ]facing\b/i,
  /\bstraight[- ]on\b/i, /\bperspective\b/i, /\bclose[- ]up\b/i,
  /\bfilling the frame\b/i, /\bfills? the frame\b/i,
  /\bno\s+\w/i, /\bwithout\b/i, /\bdo not\b/i, /\bdon't\b/i,
];

export function lintHint(hint) {
  return BANNED_HINT_PATTERNS.filter((re) => re.test(hint)).map((re) => re.source);
}

/** social_scale "zero" is Jev saying no humans belong — a hint naming a
 *  person, stick figure, or body part fights the spec. */
const HUMAN_WORDS =
  /\b(person|people|man|woman|child|children|boy|girl|kid|baby|adult|figure|stick\s*figure|hand|hands|face|arms?|legs?|feet|foot)\b/i;

export function lintSpecFit(hint, spec = {}) {
  if ((spec.social_scale ?? "solo") !== "zero") return [];
  return HUMAN_WORDS.test(hint) ? ["humans in a zero-human spec"] : [];
}

/** One planner lane → { hint, ms }. The lab calls it once per lane in
 *  parallel and shows the timings side by side. */
export async function askPlanner({
  lane = "spark", text, description, spec,
  apiKey = resolveApiKey("OPENROUTER_API_KEY"),
  fetchImpl = globalThis.fetch,
  system,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set (.env)");
  const t0 = Date.now();
  const res = await fetchImpl(OPENROUTER_CHAT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...appHeaders("picture-lab"),
    },
    body: JSON.stringify(plannerChatBody({ lane, text, description, spec, system })),
  });
  if (!res.ok) {
    throw new Error(`${lane} HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return { hint: parseSparkHint(await res.json()), ms: Date.now() - t0 };
}

/** The full Muse prompt for a subject — the buildPrompt scaffold plus a
 *  hint. The template lane passes hint=null (production behavior); the
 *  spark lane passes its sentence. Personal scope prompts from the
 *  description alone, exactly like handleDraw. */
export function composePrompt({ text, description, scope, kind, spec = {}, hint = null }) {
  return buildPrompt({
    word: scope === "personal" ? normalizeV1(description) : text,
    torso: kind && kind !== "None" ? String(kind).toLowerCase() : null,
    hint: hint ?? (scope === "personal" ? null : description),
    framing: spec.framing,
    hand: spec.hand_mode,
    social_scale: spec.social_scale,
    entity_mode: spec.entity_mode,
    packaging: spec.packaging,
  });
}

/** Jev draw spec for the lab — description rides into the state string
 *  the same way the Worker's classify carries it. */
export async function labSpec({ text, description, fetchImpl } = {}) {
  const word = description ? `${text} — ${description}` : text;
  return classifyWithJev({ word, fetchImpl });
}

/* -------------------------------- minting -------------------------------- */

const REF_DIRS = { "pip-v1": DEFAULT_STYLE_REF_DIR, "object-v1": OBJECT_STYLE_REF_DIR };

const slug = (s) =>
  normalizeV1(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "word";

export function takeFileName(word, source, ts = Date.now()) {
  return `${ts}-${slug(word)}-${source}.png`;
}

/** One paid Muse call, same body shape as the Worker's live path and
 *  gen.mjs: style refs by bundle, packshots with none. Writes the png
 *  and a .json sidecar so takes carry their prompt/spec/verdict. */
export async function mintLabTake({
  word, description, prompt, spec = {}, source,
  apiKey = resolveApiKey("OPENROUTER_API_KEY"),
  fetchImpl = globalThis.fetch,
  takesDir = LAB_TAKES_DIR,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set (.env)");
  if (!prompt) throw new Error("prompt is required");
  const bundle = styleRefBundle(spec);
  const body = {
    model: MUSE_MODEL,
    prompt,
    aspect_ratio: "1:1",
    output_format: "png",
  };
  if (bundle && REF_DIRS[bundle]) {
    body.input_references = loadStyleRefs(REF_DIRS[bundle])
      .map((r) => ({ type: "image_url", image_url: { url: r.dataUri } }));
  }
  const res = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...appHeaders("picture-lab"),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`muse HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const bytes = Buffer.from(extractImage(await res.json()));

  mkdirSync(takesDir, { recursive: true });
  const file = takeFileName(word, source);
  writeFileSync(join(takesDir, file), bytes);
  const meta = {
    word: String(word ?? ""), description: description || null,
    spec, prompt, source, file, created_at: Date.now(), verdict: null,
    ...(PLANNER_MODELS[source] ? { planner_model: PLANNER_MODELS[source].model } : {}),
  };
  writeFileSync(join(takesDir, `${file}.json`), JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

/** Newest-first take list with sidecars (png-only files without a
 *  sidecar still list, with file as the only field). */
export function listLabTakes({ takesDir = LAB_TAKES_DIR } = {}) {
  if (!existsSync(takesDir)) return [];
  return readdirSync(takesDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => {
      const side = join(takesDir, `${f}.json`);
      return existsSync(side)
        ? JSON.parse(readFileSync(side, "utf8"))
        : { file: f, word: null, source: null, prompt: null, verdict: null };
    })
    .sort((a, b) => String(b.file).localeCompare(String(a.file)));
}

export function setTakeVerdict({ file, verdict, takesDir = LAB_TAKES_DIR }) {
  if (!["good", "bad", null].includes(verdict)) throw new Error("bad_verdict");
  const side = join(takesDir, `${file}.json`);
  if (!existsSync(side)) return null;
  const meta = JSON.parse(readFileSync(side, "utf8"));
  meta.verdict = verdict;
  writeFileSync(side, JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

export function labImagePath(file, takesDir = LAB_TAKES_DIR) {
  const f = String(file ?? "");
  return /^[0-9]+-[a-z0-9-]+\.png$/.test(f) ? join(takesDir, f) : null;
}
