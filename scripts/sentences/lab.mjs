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
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRANSFORM_MODES, TRANSFORM_PROMPTS,
} from "../../src/shared/transform_prompts.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SENTENCE_RUNS_DIR = join(repoRoot, "out/sentence_lab");
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
export function transformChatBody({ lane, mode, text }) {
  const cfg = TRANSFORM_LANES[lane];
  if (!cfg) throw new Error(`unknown transform lane ${lane}`);
  if (!TRANSFORM_PROMPTS[mode]) throw new Error(`unknown mode ${mode}`);
  return {
    model: cfg.model,
    temperature: 0,
    ...(cfg.reasoning_effort ? { reasoning_effort: cfg.reasoning_effort } : {}),
    messages: [
      { role: "system", content: TRANSFORM_PROMPTS[mode] },
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

/** One cell of the grid → { text, ms, think, usage }. */
export async function askTransform({
  lane, mode, text,
  apiKey = process.env.GROQ_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  const key = apiKey?.trim();
  if (!key) throw new Error("GROQ_API_KEY is not set (.env)");
  const t0 = Date.now();
  const res = await fetchImpl(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(transformChatBody({ lane, mode, text })),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`groq_${res.status}: ${data?.error?.message ?? res.status}`.slice(0, 200));
  }
  const { text: out, think } = parseTransformReply(data);
  return { text: out, ms: Date.now() - t0, think, usage: data.usage ?? null };
}

/** The whole grid for one fragment — every mode × every lane in
 *  parallel. A failing cell records its error, never sinks the run. */
export async function runTransformSuite({
  text,
  modes = TRANSFORM_MODES,
  lanes = Object.keys(TRANSFORM_LANES),
  apiKey,
  fetchImpl,
} = {}) {
  const frag = String(text ?? "").trim();
  if (!frag || frag.length > MAX_INPUT_CHARS) throw new Error("bad_text");
  const t0 = Date.now();
  const cells = await Promise.all(
    modes.flatMap((mode) => lanes.map(async (lane) => {
      try {
        return { mode, lane, ...(await askTransform({ lane, mode, text: frag, apiKey, fetchImpl })) };
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
