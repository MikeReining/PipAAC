/** Sentence lab helpers — lane bodies, think-tag strip, run files. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  askTransform, listRuns, parseTransformReply, runFileName, runFilePath,
  runTransformSuite, saveRun, setCellVerdict, transformChatBody,
  TRANSFORM_LANES, TRANSFORM_MODES,
} from "./lab.mjs";
import { TRANSFORM_PROMPTS, transformPrompt } from "../../src/shared/transform_prompts.mjs";
import { TRANSFORM_PROMPTS as WORKER_PROMPTS } from "../../src/worker/transform.js";

const okReply = (text, extra = {}) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: text, ...extra } }],
    usage: { completion_tokens: 7 },
  }),
});

test("worker + lab share one prompt table", () => {
  assert.deepEqual(WORKER_PROMPTS, TRANSFORM_PROMPTS);
  assert.deepEqual(TRANSFORM_MODES, ["fix", "question", "past", "future"]);
});

test("transformPrompt composes the bar's shape with the press", () => {
  // ❓ on a past bar → a past-tense question task
  assert.match(transformPrompt("question", { tense: "past" }), /past-tense question/);
  assert.match(transformPrompt("question", { tense: "future" }), /future-tense question/);
  // ❓ on a present bar → the flat question prompt
  assert.equal(transformPrompt("question", { tense: "present" }), TRANSFORM_PROMPTS.question);
  // ⏪/⏩ on an existing question → the same tensed-question task
  assert.equal(
    transformPrompt("past", { question: true }),
    transformPrompt("question", { tense: "past" }),
  );
  assert.match(transformPrompt("future", { question: true }), /future-tense question/);
  // plain presses → flat prompts; unknown mode → null
  assert.equal(transformPrompt("past"), TRANSFORM_PROMPTS.past);
  assert.equal(transformPrompt("fix", { question: true }), TRANSFORM_PROMPTS.fix);
  assert.equal(transformPrompt("shout"), null);
});

test("transformChatBody: production shape, lane knobs, prompt per mode", () => {
  const q = transformChatBody({ lane: "qwen", mode: "future", text: "go park" });
  assert.equal(q.model, "qwen/qwen3.8-27b"); // the production model
  assert.equal(q.temperature, 0);
  assert.equal(q.messages[0].content, TRANSFORM_PROMPTS.future);
  assert.equal(q.messages[1].content, "go park");
  assert.ok(!("reasoning_effort" in q));

  const g = transformChatBody({ lane: "gptoss", mode: "past", text: "x" });
  assert.equal(g.model, "openai/gpt-oss-120b");
  assert.equal(g.reasoning_effort, "low"); // 023: gpt-oss burns think tokens otherwise

  assert.throws(() => transformChatBody({ lane: "nope", mode: "fix", text: "x" }));
  assert.throws(() => transformChatBody({ lane: "qwen", mode: "nope", text: "x" }));
});

test("parseTransformReply strips think tags; flags reasoning either way", () => {
  assert.deepEqual(parseTransformReply({
    choices: [{ message: { content: "<think>hmm</think> I want to play." } }],
  }), { text: "I want to play.", think: true });
  assert.deepEqual(parseTransformReply({
    choices: [{ message: { content: "He went.", reasoning: "past of go" } }],
  }), { text: "He went.", think: true });
  assert.deepEqual(parseTransformReply({
    choices: [{ message: { content: " Will she go? " } }],
  }), { text: "Will she go?", think: false });
  assert.throws(() => parseTransformReply({
    choices: [{ message: { content: "<think>only reasoning</think>" } }],
  }));
});

test("askTransform posts to Groq with the key; returns text + ms + usage", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return okReply("I want to play.");
  };
  const out = await askTransform({
    lane: "qwen", mode: "fix", text: "want play", apiKey: "k", fetchImpl,
  });
  assert.equal(seen[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(seen[0].init.headers.Authorization, "Bearer k");
  assert.equal(JSON.parse(seen[0].init.body).model, "qwen/qwen3.8-27b");
  assert.equal(out.text, "I want to play.");
  assert.equal(out.think, false);
  assert.equal(out.usage.completion_tokens, 7);
  assert.equal(typeof out.ms, "number");

  await assert.rejects(
    () => askTransform({ lane: "qwen", mode: "fix", text: "x", apiKey: " ", fetchImpl }),
    /GROQ_API_KEY/);
  await assert.rejects(
    () => askTransform({
      lane: "qwen", mode: "fix", text: "x", apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate" } }) }),
    }), /groq_429/);
});

test("askTransform caches cells on disk; a repeat call is free", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slab-cache-"));
  try {
    let calls = 0;
    const fetchImpl = async () => { calls++; return okReply("I want to play."); };
    const args = {
      lane: "qwen", mode: "fix", text: "want play",
      apiKey: "k", fetchImpl, cacheDir: dir,
    };
    const a = await askTransform(args);
    assert.equal(a.cached, false);
    const b = await askTransform(args);
    assert.equal(b.cached, true);
    assert.equal(b.text, a.text);
    assert.equal(calls, 1);
    // a different text is a different cell — it still calls out
    await askTransform({ ...args, text: "go park" });
    assert.equal(calls, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runTransformSuite fills every mode × lane; a dead cell never sinks the run", async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.model.includes("gpt-oss") && body.messages[0].content === TRANSFORM_PROMPTS.past) {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return okReply(`${body.model} → ${body.messages[1].content}`);
  };
  const suite = await runTransformSuite({ text: "go park", apiKey: "k", fetchImpl });
  assert.equal(suite.modes.length, 4);
  for (const mode of suite.modes) {
    for (const lane of Object.keys(TRANSFORM_LANES)) {
      assert.ok(suite.results[mode][lane], `${mode}/${lane} present`);
    }
  }
  assert.match(suite.results.past.gptoss.error, /groq_500/);
  assert.equal(suite.results.past.qwen.text, "qwen/qwen3.8-27b → go park");
  await assert.rejects(() => runTransformSuite({ text: " ", apiKey: "k" }), /bad_text/);
  await assert.rejects(
    () => runTransformSuite({ text: "x".repeat(161), apiKey: "k" }), /bad_text/);
});

test("run file round-trip: save, list, per-cell verdict", () => {
  const dir = mkdtempSync(join(tmpdir(), "slab-"));
  try {
    const suite = {
      modes: ["fix"], lanes: ["qwen", "gptoss"], ms: 12,
      results: {
        fix: {
          qwen: { text: "I want to play.", ms: 100, think: false, usage: null, verdict: null },
          gptoss: { ms: 50, error: "groq_500" },
        },
      },
    };
    const rec = saveRun({ input: "Want Play!", suite, runsDir: dir });
    assert.match(rec.file, /^[0-9]+-want-play\.json$/);
    assert.equal(runFilePath(rec.file, dir), join(dir, rec.file));
    assert.equal(runFilePath("../x.json", dir), null);

    const listed = listRuns({ runsDir: dir });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].input, "Want Play!");
    assert.equal(listed[0].lane_models.qwen, "qwen/qwen3.8-27b");

    const after = setCellVerdict({
      file: rec.file, mode: "fix", lane: "qwen", verdict: "good", runsDir: dir,
    });
    assert.equal(after.results.fix.qwen.verdict, "good");
    // error cells and unknown cells can't take a verdict
    assert.equal(setCellVerdict({
      file: rec.file, mode: "fix", lane: "gptoss", verdict: "good", runsDir: dir,
    }), null);
    assert.equal(setCellVerdict({
      file: rec.file, mode: "nope", lane: "qwen", verdict: "good", runsDir: dir,
    }), null);
    assert.throws(() => setCellVerdict({
      file: rec.file, mode: "fix", lane: "qwen", verdict: "meh", runsDir: dir,
    }), /bad_verdict/);
    const onDisk = JSON.parse(readFileSync(join(dir, rec.file), "utf8"));
    assert.equal(onDisk.results.fix.qwen.verdict, "good");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
