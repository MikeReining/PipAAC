/**
 * Sentence lab helpers — one fragment × every magic-wand mode × both
 * candidate models, timed side by side. Calls Groq directly with the
 * production prompt strings (src/shared/transform_prompts.mjs) at
 * temperature 0 — the same request shape as POST /api/v1/transform, so
 * the lab measures what production would pay and wait for.
 *
 * Env: GROQ_API_KEY — never read .env from disk in library code;
 * the dev server / CLI loads it.
 *
 * Runs persist as JSON files in out/sentence_lab/ (one per run, like the
 * picture lab's take sidecars) so verdicts stick across sessions and the
 * qwen-vs-gptoss decision has a record.
 *
 * Cells are deterministic (temperature 0), so every response also lands in
 * out/sentence_lab/cache/ keyed by the request body: re-runs, retries, and
 * old-vs-new prompt compares only pay for cells the cache hasn't seen.
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRANSFORM_MODES, TRANSFORM_PROMPTS,
} from "../../src/shared/transform_prompts.mjs";
import { scoreCell } from "./scorer.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SENTENCE_RUNS_DIR = join(repoRoot, "out/sentence_lab");
export const SENTENCE_CACHE_DIR = join(repoRoot, "out/sentence_lab/cache");
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const MAX_INPUT_CHARS = 160; // same ceiling as transform.js

/** The transform lanes. qwen is what production ships today
 *  (src/worker/transform.js MODEL). gptoss is the candidate under test —
 *  reasoning_effort low because 023 found gpt-oss burns tokens inside
 *  reasoning before emitting text, and a tense flip is not a reasoning
 *  task. */
export const TRANSFORM_LANES = {
  qwen: { model: "qwen/qwen3.8-27b", label: "qwen3.8-27b · production" },
  gptoss: {
    model: "openai/gpt-oss-120b",
    label: "gpt-oss-120b · candidate",
    reasoning_effort: "low",
  },
};

export { TRANSFORM_MODES };

/** The request body one lane call sends — production shape plus the
 *  lane's own knobs. */
export function transformChatBody({ lane, mode, text, system }) {
  const cfg = TRANSFORM_LANES[lane];
  if (!cfg) throw new Error(`unknown transform lane ${lane}`);
  if (!TRANSFORM_PROMPTS[mode] && !system) throw new Error(`unknown mode ${mode}`);
  return {
    model: cfg.model,
    temperature: 0,
    ...(cfg.reasoning_effort ? { reasoning_effort: cfg.reasoning_effort } : {}),
    messages: [
      { role: "system", content: system ?? TRANSFORM_PROMPTS[mode] },
      { role: "user", content: text },
    ],
  };
}

/** The usable sentence out of a chat response. Qwen3 can wrap reasoning
 *  in <think>…</think> and gpt-oss can return it in message.reasoning —
 *  strip both, flag that it happened so the lab shows the tax. */
export function parseTransformReply(payload) {
  const msg = payload?.choices?.[0]?.message ?? {};
  const raw = String(msg.content ?? "");
  const think = /<think[\s>]/i.test(raw) || Boolean(msg.reasoning);
  const text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
  if (!text) {
    throw new Error(`empty reply: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return { text, think };
}

/** Cache file for one request body — sha256 keeps it collision-safe. */
const cacheFile = (cacheDir, body) => join(
  cacheDir,
  `${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}.json`,
);

const cacheRead = (file) => {
  try {
    const rec = JSON.parse(readFileSync(file, "utf8"));
    return typeof rec?.text === "string" ? rec : null;
  } catch { return null; }
};

/** One cell of the grid → { text, ms, think, usage, cached }. Real calls
 *  (no injected fetch) read/write SENTENCE_CACHE_DIR by default — pass
 *  cacheDir: null to opt out, or a dir to opt a custom fetchImpl in. */
export async function askTransform({
  lane, mode, text, system,
  apiKey = process.env.GROQ_API_KEY,
  fetchImpl = globalThis.fetch,
  cacheDir,
} = {}) {
  const key = apiKey?.trim();
  if (!key) throw new Error("GROQ_API_KEY is not set (.env)");
  const body = transformChatBody({ lane, mode, text, system });
  const cache = cacheDir === undefined
    ? (fetchImpl === globalThis.fetch ? SENTENCE_CACHE_DIR : null)
    : cacheDir;
  const file = cache ? cacheFile(cache, body) : null;
  const hit = file ? cacheRead(file) : null;
  if (hit) {
    return {
      text: hit.text, ms: 0, think: hit.think ?? false,
      usage: hit.usage ?? null, cached: true,
    };
  }
  const t0 = Date.now();
  const res = await fetchImpl(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`groq_${res.status}: ${data?.error?.message ?? res.status}`.slice(0, 200));
  }
  const { text: out, think } = parseTransformReply(data);
  if (file) {
    try {
      mkdirSync(cache, { recursive: true });
      writeFileSync(file, JSON.stringify({ text: out, think, usage: data.usage ?? null }) + "\n");
    } catch { /* a cache miss is cheap; the call itself succeeded */ }
  }
  return {
    text: out, ms: Date.now() - t0, think,
    usage: data.usage ?? null, cached: false,
  };
}

/** The whole grid for one fragment — every mode × every lane in
 *  parallel. A failing cell records its error, never sinks the run. */
export async function runTransformSuite({
  text,
  modes = TRANSFORM_MODES,
  lanes = Object.keys(TRANSFORM_LANES),
  apiKey,
  fetchImpl,
  cacheDir,
} = {}) {
  const frag = String(text ?? "").trim();
  if (!frag || frag.length > MAX_INPUT_CHARS) throw new Error("bad_text");
  const t0 = Date.now();
  const cells = await Promise.all(
    modes.flatMap((mode) => lanes.map(async (lane) => {
      try {
        return {
          mode, lane,
          ...(await askTransform({ lane, mode, text: frag, apiKey, fetchImpl, cacheDir })),
        };
      } catch (e) {
        return { mode, lane, ms: null, error: String(e?.message ?? e) };
      }
    })),
  );
  const results = {};
  for (const mode of modes) {
    results[mode] = {};
    for (const lane of lanes) results[mode][lane] = null;
  }
  for (const c of cells) {
    results[c.mode][c.lane] = c.error
      ? { ms: c.ms, error: c.error }
      : { text: c.text, ms: c.ms, think: c.think, usage: c.usage, verdict: null };
  }
  return { modes, lanes, results, ms: Date.now() - t0 };
}

/* ------------------------------- run files ------------------------------ */

const slug = (s) =>
  normalizeV1(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "frag";

export function runFileName(input, ts = Date.now()) {
  return `${ts}-${slug(input)}.json`;
}

export function runFilePath(file, runsDir = SENTENCE_RUNS_DIR) {
  const f = String(file ?? "");
  return /^[0-9]+-[a-z0-9-]+\.json$/.test(f) ? join(runsDir, f) : null;
}

/** Save the run; returns the record with its file name attached. */
export function saveRun({ input, suite, runsDir = SENTENCE_RUNS_DIR } = {}) {
  mkdirSync(runsDir, { recursive: true });
  const file = runFileName(input);
  const rec = {
    file, input, created_at: Date.now(),
    modes: suite.modes, lanes: suite.lanes,
    lane_models: Object.fromEntries(
      suite.lanes.map((l) => [l, TRANSFORM_LANES[l].model])),
    ms: suite.ms, results: suite.results,
  };
  writeFileSync(join(runsDir, file), JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

export function listRuns({ runsDir = SENTENCE_RUNS_DIR, limit = 50 } = {}) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort().reverse()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(join(runsDir, f), "utf8")));
}

/** ✓/✗ on one cell — verdict sticks to the run file. */
export function setCellVerdict({ file, mode, lane, verdict, runsDir = SENTENCE_RUNS_DIR }) {
  if (!["good", "bad", null].includes(verdict)) throw new Error("bad_verdict");
  const path = runFilePath(file, runsDir);
  if (!path || !existsSync(path)) return null;
  const rec = JSON.parse(readFileSync(path, "utf8"));
  const cell = rec.results?.[mode]?.[lane];
  if (!cell || cell.error) return null;
  cell.verdict = verdict;
  writeFileSync(path, JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

/* -------------------------------- battery ------------------------------- */

/** The regression set — every fragment × every mode, scored by the
 *  dumb stemmer (scorer.mjs): the model can't grade its own homework.
 *  prompts overrides TRANSFORM_PROMPTS per mode so a candidate set can
 *  be measured before it ever ships. Abstention (output === taps) is a
 *  pass by law; fabrication, drops, and added subjects flag red. */
export async function runBattery({
  fragments,
  prompts = {},
  lanes = ["qwen"],
  modes = TRANSFORM_MODES,
  apiKey,
  fetchImpl,
  cacheDir,
} = {}) {
  if (!Array.isArray(fragments) || !fragments.length || fragments.length > 60) {
    throw new Error("bad_fragments");
  }
  const frags = fragments.map((f) => String(f ?? "").trim()).filter(Boolean);
  if (!frags.length) throw new Error("bad_fragments");
  const t0 = Date.now();
  const cells = {};
  for (const frag of frags) {
    cells[frag] = {};
    for (const mode of modes) cells[frag][mode] = {};
  }
  /** Bounded fan-out + one retry on 429/503 — a full battery is ~165
   *  calls and Groq rate-limits the burst. Cached cells are free, so a
   *  re-run or an old-vs-new compare only pays for what changed. */
  const tasks = frags.flatMap((frag) => modes.flatMap((mode) =>
    lanes.map((lane) => ({ frag, mode, lane }))));
  let cacheHits = 0;
  const run1 = async ({ frag, mode, lane }, attempt = 0) => {
    const system = prompts[mode] ?? TRANSFORM_PROMPTS[mode];
    try {
      const r = await askTransform({ lane, mode, text: frag, system, apiKey, fetchImpl, cacheDir });
      if (r.cached) cacheHits++;
      cells[frag][mode][lane] = { ...r, score: scoreCell(frag, r.text) };
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (attempt === 0 && /groq_(429|503)/.test(msg)) {
        await new Promise((r) => setTimeout(r, 1500));
        return run1({ frag, mode, lane }, 1);
      }
      cells[frag][mode][lane] = { ms: null, error: msg };
    }
  };
  const CONCURRENCY = 8;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map((t) => run1(t)));
  }
  return { fragments: frags, modes, lanes, cells, cache_hits: cacheHits, ms: Date.now() - t0 };
}

export function batteryFileName(label = "run", ts = Date.now()) {
  return `battery-${ts}-${slug(label)}.json`;
}

export function batteryFilePath(file, runsDir = SENTENCE_RUNS_DIR) {
  const f = String(file ?? "");
  return /^battery-[0-9]+-[a-z0-9-]+\.json$/.test(f) ? join(runsDir, f) : null;
}

export function saveBattery({ label = "run", battery, runsDir = SENTENCE_RUNS_DIR } = {}) {
  mkdirSync(runsDir, { recursive: true });
  const file = batteryFileName(label);
  const rec = { file, label, created_at: Date.now(), ...battery };
  writeFileSync(join(runsDir, file), JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

export function listBatteries({ runsDir = SENTENCE_RUNS_DIR, limit = 30 } = {}) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((f) => f.startsWith("battery-") && f.endsWith(".json"))
    .sort().reverse()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(join(runsDir, f), "utf8")));
}
