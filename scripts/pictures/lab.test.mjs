/** Picture lab helpers — planner body, spark parse, take sidecars. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptLabTake, composePrompt, labImagePath, lintHint, lintSpecFit,
  listLabTakes, mintLabTake, parseSparkHint, plannerChatBody,
  plannerSystemPrompt, setTakeVerdict, takeFileName,
  LAB_TAKES_DIR, PLANNER_MODELS,
} from "./lab.mjs";
import { styleRefBundle, plannerLane, parseDrawSpec } from "../../src/shared/draw_prompt.mjs";
import { PLANNER_SYSTEM } from "../../src/shared/draw_planner.mjs";

test("plannerChatBody: lane model + system prompt from the md, spec in user msg", () => {
  const body = plannerChatBody({
    lane: "spark",
    text: "trampoline", description: "big backyard one",
    spec: { entity_mode: "organic_noun", framing: "object" },
    system: "SYS",
  });
  assert.equal(body.model, PLANNER_MODELS.spark.model);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, "SYS");
  const user = JSON.parse(body.messages[1].content);
  assert.equal(user.concept, "trampoline");
  assert.equal(user.description, "big backyard one");
  assert.equal(user.spec.entity_mode, "organic_noun");

  // The fast lane routes Qwen to Groq with thinking off — a hint is not
  // a reasoning task.
  const q = plannerChatBody({ lane: "qwen", text: "x", spec: {}, system: "s" });
  assert.equal(q.model, "qwen/qwen3-32b");
  assert.deepEqual(q.provider.order, ["Groq"]);
  assert.equal(q.reasoning.effort, "none");

  assert.throws(() => plannerChatBody({ lane: "nope", text: "x" }));
});

test("plannerSystemPrompt reads the body after the --- marker", () => {
  const sys = plannerSystemPrompt();
  assert.match(sys, /hint sentence/);
  assert.ok(!sys.includes("system prompt (v1)"));
});

test("parseSparkHint strips quotes; throws on an empty response", () => {
  assert.equal(parseSparkHint({
    choices: [{ message: { content: ' "A golden retriever sitting." ' } }],
  }), "A golden retriever sitting.");
  assert.throws(() => parseSparkHint({ choices: [{ message: { content: "  " } }] }));
});

test("lintHint flags the skill's banned moves (§4B–F)", () => {
  assert.deepEqual(lintHint("a golden retriever sitting"), []);
  assert.ok(lintHint("a flat vector icon with thick outlines").length >= 3);
  assert.ok(lintHint("a centered dog, front-facing, no people").length >= 3);
  assert.ok(lintHint("a dog in 3/4 perspective").length === 1);
});

test("composePrompt: the spark hint lands inside the buildPrompt scaffold", () => {
  const prompt = composePrompt({
    text: "trampoline", scope: "common", kind: "Yellow",
    spec: { entity_mode: "organic_noun", framing: "object", social_scale: "zero" },
    hint: "A round backyard trampoline with a black jumping mat and short metal legs.",
  });
  assert.match(prompt, /creating an image to teach the concept of: trampoline\./);
  assert.match(prompt, /reference images on a pure white background/);
  assert.match(prompt, /A round backyard trampoline with a black jumping mat/);
  // No style words appear — the refs carry style (§4D).
  assert.doesNotMatch(prompt, /flat|outline|shad|vector|perspective/i);
});

test("composePrompt: personal scope prompts from the description, never the name", () => {
  const prompt = composePrompt({
    text: "Cooper", description: "our golden retriever", scope: "personal",
    spec: { entity_mode: "organic_noun", framing: "object" },
    hint: "a golden retriever sitting",
  });
  assert.doesNotMatch(prompt, /Cooper/);
  assert.match(prompt, /our golden retriever/);
});

test("lintSpecFit: a zero-human spec rejects people words in the hint", () => {
  const zero = { social_scale: "zero" };
  assert.deepEqual(lintSpecFit("rain falling on a jacket", zero), []);
  assert.equal(lintSpecFit("a stick figure in the rain", zero).length, 1);
  assert.equal(lintSpecFit("a person in the rain", zero).length, 1);
  assert.equal(lintSpecFit("a child's hand", zero).length, 1);
  assert.deepEqual(lintSpecFit("a stick figure waving", { social_scale: "solo" }), []);
});

test("styleRefBundle: humans get pip-v1, thing-only specs get object-v1", () => {
  // The `wet` spec — a person in frame must ship the stick persona refs,
  // never pencil/bread/dog.
  assert.equal(styleRefBundle({
    entity_mode: "concept_action", framing: "object", social_scale: "solo",
  }), "pip-v1");
  assert.equal(styleRefBundle({
    entity_mode: "concept_action", framing: "full", social_scale: "pair",
  }), "pip-v1");
  assert.equal(styleRefBundle({
    entity_mode: "anatomy_relational", framing: "object", social_scale: "zero",
  }), "pip-v1"); // the silhouette lives in pip-v1
  assert.equal(styleRefBundle({
    entity_mode: "concept_action", framing: "object", social_scale: "zero",
  }), "object-v1"); // a sign/object scene, no people
  assert.equal(styleRefBundle({
    entity_mode: "organic_noun", framing: "object", social_scale: "zero",
  }), "object-v1");
  assert.equal(styleRefBundle({ entity_mode: "category_packshot" }), null);
  assert.equal(styleRefBundle({ entity_mode: "cpg_brand" }), null);
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

test("PLANNER_SYSTEM stays identical to the editable md (no SSOT drift)", () => {
  assert.equal(plannerSystemPrompt(), PLANNER_SYSTEM);
});

test("plannerLane: Jev's imagery picks the lane; unknown → reasoning lane", () => {
  assert.equal(plannerLane({ imagery: "literal" }), "gptoss");
  assert.equal(plannerLane({ imagery: "metaphor" }), "spark");
  assert.equal(plannerLane({}), "spark"); // absent → the safer model
});

test("parseDrawSpec reconciles contradictory framing vs social_scale", () => {
  const answers = (framing, social_scale) => ({
    framing: { choice: framing },
    social_scale: { choice: social_scale },
  });
  // A person framing with zero humans is impossible — the lens wins.
  assert.equal(parseDrawSpec(answers("bust", "zero")).social_scale, "solo");
  // An object/diagram lens has no humans in it.
  assert.equal(parseDrawSpec(answers("object", "solo")).social_scale, "zero");
  assert.equal(parseDrawSpec(answers("diagram", "pair")).social_scale, "zero");
  // Coherent answers pass through untouched.
  assert.equal(parseDrawSpec(answers("bust", "solo")).social_scale, "solo");
  assert.equal(parseDrawSpec(answers("contrast", "zero")).social_scale, "zero");
});

test("adoptLabTake: copies to assets/symbols, guards personal + collisions", async () => {
  const takesDir = mkdtempSync(join(tmpdir(), "lab-t-"));
  const symbolsDir = mkdtempSync(join(tmpdir(), "lab-s-"));
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from("PNG").toString("base64") }] }),
  });
  try {
    const meta = await mintLabTake({
      word: "dirty", prompt: "p", source: "gptoss", scope: "common",
      spec: {}, apiKey: "k", fetchImpl, takesDir,
    });
    const after = adoptLabTake({ file: meta.file, takesDir, symbolsDir });
    assert.equal(after.adopted.symbol, "assets/symbols/dirty.png");
    assert.ok(readFileSync(join(symbolsDir, "dirty.png")).equals(Buffer.from("PNG")));
    // idempotent — a second adopt returns, never rewrites
    assert.equal(adoptLabTake({ file: meta.file, takesDir, symbolsDir }).adopted.symbol,
      "assets/symbols/dirty.png");

    // personal takes never enter the shared catalog
    const personal = await mintLabTake({
      word: "Cooper", description: "our golden retriever",
      prompt: "p", source: "qwen", scope: "personal",
      spec: {}, apiKey: "k", fetchImpl, takesDir,
    });
    assert.throws(
      () => adoptLabTake({ file: personal.file, takesDir, symbolsDir }),
      /personal_take/);

    // an existing symbol is never silently replaced
    const dupe = await mintLabTake({
      word: "dirty", prompt: "p2", source: "custom", spec: {},
      apiKey: "k", fetchImpl, takesDir,
    });
    assert.throws(
      () => adoptLabTake({ file: dupe.file, takesDir, symbolsDir }),
      /symbol_exists:dirty/);
  } finally {
    rmSync(takesDir, { recursive: true, force: true });
    rmSync(symbolsDir, { recursive: true, force: true });
  }
});
