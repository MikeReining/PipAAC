/** Picture lab helpers — planner body, spark parse, take sidecars. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  labImagePath, listLabTakes, mintLabTake, parseSparkPrompt,
  plannerSystemPrompt, setTakeVerdict, sparkChatBody, takeFileName,
  LAB_TAKES_DIR, SPARK_MODEL,
} from "./lab.mjs";

test("sparkChatBody: spark model, system prompt from the md, spec in user msg", () => {
  const body = sparkChatBody({
    text: "trampoline", description: "big backyard one",
    spec: { entity_mode: "organic_noun", framing: "object" },
    system: "SYS",
  });
  assert.equal(body.model, SPARK_MODEL);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, "SYS");
  const user = JSON.parse(body.messages[1].content);
  assert.equal(user.concept, "trampoline");
  assert.equal(user.description, "big backyard one");
  assert.equal(user.spec.entity_mode, "organic_noun");
});

test("plannerSystemPrompt reads the body after the --- marker", () => {
  const sys = plannerSystemPrompt();
  assert.match(sys, /You write image prompts/);
  assert.ok(!sys.includes("system prompt (v0)"));
});

test("parseSparkPrompt strips quotes; throws on an empty response", () => {
  assert.equal(parseSparkPrompt({
    choices: [{ message: { content: ' "Draw a dog." ' } }],
  }), "Draw a dog.");
  assert.throws(() => parseSparkPrompt({ choices: [{ message: { content: "  " } }] }));
});

test("takeFileName + takes list + verdict round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "lab-"));
  try {
    const name = takeFileName("Peanut Butter", "spark", 1234);
    assert.match(name, /^1234-peanut-butter-spark\.png$/);
    assert.equal(labImagePath(name, dir), join(dir, name));
    assert.equal(labImagePath("../etc/passwd", dir), null);
    assert.equal(labImagePath("x.png", dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mintLabTake: muse body shape, refs by bundle, sidecar written", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lab-"));
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("PNG").toString("base64") }] }),
    };
  };
  try {
    const meta = await mintLabTake({
      word: "trampoline", description: null,
      prompt: "draw a trampoline", source: "template",
      spec: { entity_mode: "category_packshot", packaging: "box" }, // → no refs
      apiKey: "k", fetchImpl, takesDir: dir,
    });
    const sent = seen[0];
    assert.equal(sent.url, "https://openrouter.ai/api/v1/images");
    assert.equal(sent.body.model, "meta/muse-image");
    assert.equal(sent.body.prompt, "draw a trampoline");
    assert.ok(!("input_references" in sent.body)); // packshot → no refs
    const side = JSON.parse(readFileSync(join(dir, `${meta.file}.json`), "utf8"));
    assert.equal(side.prompt, "draw a trampoline");
    assert.equal(side.source, "template");
    assert.equal(side.verdict, null);

    // the take lists + takes a verdict
    const takes = listLabTakes({ takesDir: dir });
    assert.equal(takes.length, 1);
    const after = setTakeVerdict({ file: meta.file, verdict: "good", takesDir: dir });
    assert.equal(after.verdict, "good");
    assert.equal(listLabTakes({ takesDir: dir })[0].verdict, "good");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mintLabTake: object bundle attaches style refs like the Worker", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lab-"));
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("PNG").toString("base64") }] }),
    };
  };
  try {
    await mintLabTake({
      word: "dog", prompt: "draw a dog", source: "spark",
      spec: { entity_mode: "organic_noun", framing: "object" }, // → object-v1 refs
      apiKey: "k", fetchImpl, takesDir: dir,
    });
    const refs = seen[0].input_references;
    assert.equal(refs.length, 3);
    assert.ok(refs.every((r) => r.image_url.url.startsWith("data:image/")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
