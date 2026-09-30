/**
 * Picture lab helpers — the prompt-planner lane (spark) and the mint
 * path used by /api/lab/* in calibration_dev.mjs. The planner's system
 * prompt is data/pictures/draw_planner_prompt.md, read fresh on every
 * call so the file IS the tweak surface.
 */
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyWithJev, extractImage, loadStyleRefs, resolveApiKey,
  DEFAULT_STYLE_REF_DIR, OBJECT_STYLE_REF_DIR,
} from "../art/gen.mjs";
import {
  MUSE_MODEL, OPENROUTER_ENDPOINT, appHeaders, buildPrompt, styleRefBundle,
} from "../../src/shared/draw_prompt.mjs";
import {
  askPlanner as sharedAskPlanner, plannerChatBody as sharedPlannerChatBody,
} from "../../src/shared/draw_planner.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";

export {
  BANNED_HINT_PATTERNS, lintHint, lintSpecFit, parseSparkHint,
  PLANNER_MODELS, OPENROUTER_CHAT,
} from "../../src/shared/draw_planner.mjs";
import { PLANNER_MODELS } from "../../src/shared/draw_planner.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const LAB_TAKES_DIR = join(repoRoot, "out/draw_lab");
export const PLANNER_PROMPT_PATH =
  join(repoRoot, "data/pictures/draw_planner_prompt.md");

/* ----------------------------- prompt planner ---------------------------- */

/** Re-read every call — editing the md is the whole point of the lab.
 *  (Production uses the bundled PLANNER_SYSTEM copy; the test pins them
 *  identical.) */
export function plannerSystemPrompt({ path = PLANNER_PROMPT_PATH } = {}) {
  const md = readFileSync(path, "utf8");
  return md.slice(md.indexOf("---") + 3).trim();
}

/** Lab wrappers: same shared helpers, but the system prompt defaults to
 *  the live md re-read and the key resolves from .env. */
export function plannerChatBody({ system, ...rest } = {}) {
  return sharedPlannerChatBody({ system: system ?? plannerSystemPrompt(), ...rest });
}

export function askPlanner({
  apiKey, system, app = "picture-lab", ...rest
} = {}) {
  return sharedAskPlanner({
    apiKey: apiKey ?? resolveApiKey("OPENROUTER_API_KEY"),
    system: system ?? plannerSystemPrompt(),
    app, ...rest,
  });
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
  word, description, prompt, spec = {}, source, scope = "common",
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
    spec, prompt, source, scope, file, created_at: Date.now(), verdict: null,
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

/** "Use this one" — copy a take into assets/symbols/<slug>.png, the
 *  canonical file the catalog build ships (SKILL.md §6.4). Refuses
 *  personal-scope takes (a family's subject never enters the shared
 *  catalog) and existing symbols (no silent replace — re-roll instead). */
export function adoptLabTake({
  file, takesDir = LAB_TAKES_DIR,
  symbolsDir = join(repoRoot, "assets/symbols"),
} = {}) {
  const src = labImagePath(file, takesDir);
  const sidePath = src && join(takesDir, `${file}.json`);
  if (!src || !existsSync(src) || !existsSync(sidePath)) {
    throw new Error("not_found");
  }
  const meta = JSON.parse(readFileSync(sidePath, "utf8"));
  if (meta.scope === "personal") throw new Error("personal_take");
  if (meta.adopted) return meta; // already in the catalog pipeline
  const slugName = normalizeV1(meta.word).replace(/\s+/g, "_");
  if (!slugName) throw new Error("bad_word");
  const dest = join(symbolsDir, `${slugName}.png`);
  if (existsSync(dest)) throw new Error(`symbol_exists:${slugName}`);
  mkdirSync(symbolsDir, { recursive: true });
  copyFileSync(src, dest);
  meta.adopted = { at: Date.now(), symbol: `assets/symbols/${slugName}.png` };
  writeFileSync(sidePath, JSON.stringify(meta, null, 2) + "\n");
  return meta;
}
