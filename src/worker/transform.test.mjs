/**
 * 023 Worker route Works Test — POST /api/v1/transform.
 *
 * The Groq key and the §3 prompts live server-side; the seam records
 * what the model would be asked so no name or id can leak upstream.
 * License gate and fair-use counters match the voice endpoint, in the
 * usage-tr/ namespace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { licenseFor } from "./license.mjs";

const SECRET = "tfm-test-secret";
const UID = "11111111-2222-3333-4444-555555555555";

const fakeBucket = () => {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      return { text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)) };
    },
    async put(key, v) { store.set(key, v); },
  };
};

const makeEnv = (chat) => ({
  PIP_LICENSE_SECRET: SECRET,
  VOICE: fakeBucket(),
  GROQ_CHAT: chat ?? (async (mode, text) => `${mode}: ${text}`),
});

const call = async (env, body) =>
  worker.fetch(new Request("https://x/api/v1/transform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);

const good = async (env, over = {}) => {
  const license = await licenseFor(SECRET, UID);
  return call(env, { user_id: UID, license, mode: "past", text: "PERSON1 fall down", ...over });
};

test("transform returns the model's sentence, prompt picked by mode", async () => {
  const seen = [];
  const env = makeEnv(async (mode, text) => {
    seen.push(mode);
    return `out:${mode}`;
  });
  for (const mode of ["fix", "question", "past", "future"]) {
    const r = await good(env, { mode });
    assert.equal((await r.json()).text, `out:${mode}`);
  }
  assert.deepEqual(seen, ["fix", "question", "past", "future"]);
});

test("bad mode, long text, bad license, missing user rejected", async () => {
  const env = makeEnv();
  assert.equal((await good(env, { mode: "shout" })).status, 400);
  assert.equal((await good(env, { text: "x".repeat(161) })).status, 400);
  const lic = await licenseFor(SECRET, UID);
  assert.equal((await call(env, { user_id: UID, license: "pip-life-no", mode: "fix", text: "hi" })).status, 403);
  assert.equal((await call(env, { user_id: "zzz", license: lic, mode: "fix", text: "hi" })).status, 400);
});

test("placeholdertext is what the model sees — names never reach Groq", async () => {
  let saw = null;
  const env = makeEnv(async (mode, text) => { saw = text; return "ok"; });
  const r = await good(env, { mode: "past", text: "PERSON1 eat cookie" });
  assert.equal(r.status, 200);
  assert.equal(saw, "PERSON1 eat cookie"); // the client masks before send
});

test("fair use: transform counters live in usage-tr and can 429", async () => {
  const env = makeEnv();
  const day = new Date().toISOString().slice(0, 10);
  await env.VOICE.put(`usage-tr/${UID}/${day}`, JSON.stringify({ chars: 20000, reqs: 1 }));
  const r = await good(env);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).over, "day");
  const hits = [...env.VOICE.store.keys()].filter((k) => k.startsWith(`usage-tr-hits/${UID}/`));
  assert.equal(hits.length, 1);
});

test("a real call records chars+request in usage-tr", async () => {
  const env = makeEnv(async () => "She went to the park.");
  await good(env, { text: "she go park" });
  const day = new Date().toISOString().slice(0, 10);
  const row = JSON.parse(env.VOICE.store.get(`usage-tr/${UID}/${day}`));
  assert.equal(row.chars, 11);
  assert.equal(row.reqs, 1);
});

test("no Groq key and no seam -> 503, button speaks the bar as-is", async () => {
  const env = makeEnv();
  env.GROQ_CHAT = undefined;
  const r = await good(env);
  assert.equal(r.status, 503);
});
