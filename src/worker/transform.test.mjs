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
import { DatabaseSync } from "node:sqlite";
import worker from "./index.js";
import { licenseFor } from "./license.mjs";
import { TileLedger } from "./tile.js";
import { grantKey } from "./taste.mjs";

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
    async delete(key) { store.delete(key); },
  };
};

/** node:sqlite behind the DO's minimal sql.exec().toArray() surface —
 *  the same adapter tile.test.mjs drives the real ledger DO with. */
const sqlFor = (db) => ({
  exec: (q, ...params) => {
    const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
    if (reads || params.length) {
      const st = db.prepare(q);
      const rows = reads ? st.all(...params) : (st.run(...params), []);
      return { toArray: () => rows };
    }
    db.exec(q);
    return { toArray: () => [] };
  },
});

const makeEnv = (chat) => {
  const env = {
    PIP_LICENSE_SECRET: SECRET,
    VOICE: fakeBucket(),
    GROQ_CHAT: chat ?? (async (mode, text) => `${mode}: ${text}`),
  };
  const db = new DatabaseSync(":memory:");
  env.__db = db;
  env.__ledger = new TileLedger(
    { storage: { sql: sqlFor(db) }, blockConcurrencyWhile: (fn) => fn() }, env);
  env.TILE_LEDGER = {
    idFromName: () => "ledger",
    get: () => ({ fetch: (req) => env.__ledger.fetch(req) }),
  };
  return env;
};

const call = async (env, body, headers = {}) =>
  worker.fetch(new Request("https://x/api/v1/transform", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }), env);

/** An unlicensed press — no license field at all, the taste path. */
const free = (env, over = {}, headers) =>
  call(env, { user_id: UID, mode: "fix", text: "want apple", ...over }, headers);

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

test("bar shape flags reach the model call: ❓ tense, ⏪/⏩ question", async () => {
  const seen = [];
  const env = makeEnv(async (mode, text, shape) => {
    seen.push({ mode, shape });
    return "ok";
  });
  await good(env, { mode: "question", tense: "past" });
  await good(env, { mode: "past", question: true });
  await good(env, { mode: "future" });
  assert.deepEqual(seen, [
    { mode: "question", shape: { tense: "past", question: false } },
    { mode: "past", shape: { tense: "present", question: true } },
    { mode: "future", shape: { tense: "present", question: false } },
  ]);
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

/* ------------------------- 039: the free taste ------------------------ */

test("unlicensed presses ride the pool: taste.left counts 9 down to exhausted", async () => {
  const env = makeEnv();
  for (let left = 9; left >= 0; left--) {
    const r = await free(env);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.text, "fix: want apple");
    assert.equal(body.taste.left, left);
  }
  const r = await free(env);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "taste_exhausted");
});

test("licensed responses carry no taste field", async () => {
  const env = makeEnv();
  const r = await good(env, { mode: "fix" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).taste, undefined);
});

test("a failed model call spends nothing — 503 and 502 both refund", async () => {
  const env = makeEnv(async () => null);
  assert.equal((await free(env)).status, 503); // no text -> refund
  env.GROQ_CHAT = async () => { throw new Error("groq_down"); };
  assert.equal((await free(env)).status, 502); // throws -> refund
  env.GROQ_CHAT = async () => "Want an apple.";
  const r = await free(env);
  assert.equal((await r.json()).taste.left, 9); // still the first spend
});

test("a taste transform writes one speak grant for its output text", async () => {
  const env = makeEnv(async () => "Want an apple.");
  const r = await free(env);
  assert.equal(r.status, 200);
  assert.ok(env.VOICE.store.has(await grantKey(UID, "Want an apple.")));
});

test("a presented-but-bad license stays bad_license and never touches the pool", async () => {
  const env = makeEnv();
  const r = await call(env, { user_id: UID, license: "pip-life-forged", mode: "fix", text: "hi" });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "bad_license");
  const next = await free(env); // pool untouched — still the first spend
  assert.equal((await next.json()).taste.left, 9);
});

test("the last tap can only be spent once across parallel presses", async () => {
  const env = makeEnv();
  for (let i = 0; i < 9; i++) assert.equal((await free(env)).status, 200);
  const [a, b] = await Promise.all([free(env), free(env)]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 403]);
  const ok = a.status === 200 ? a : b;
  assert.equal((await ok.json()).taste.left, 0);
});

test("the per-connection cap refuses the 6th new tasting profile of the day", async () => {
  const env = makeEnv();
  const headers = { "cf-connecting-ip": "203.0.113.7" };
  const first = crypto.randomUUID();
  for (let i = 0; i < 5; i++) {
    const uid = i === 0 ? first : crypto.randomUUID();
    const r = await free(env, { user_id: uid }, headers);
    assert.equal(r.status, 200, `profile ${i + 1} should taste`);
  }
  const refused = await free(env, { user_id: crypto.randomUUID() }, headers);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, "taste_exhausted");
  // The cap counts new profiles only — an existing one keeps spending.
  assert.equal((await free(env, { user_id: first }, headers)).status, 200);
  // And another connection is unaffected.
  assert.equal((await free(env, {}, { "cf-connecting-ip": "198.51.100.4" })).status, 200);
});

test("GET /api/v1/taste reads the pool for the quiet counter", async () => {
  const env = makeEnv();
  const get = (license = "") => worker.fetch(new Request("https://x/api/v1/taste", {
    headers: { "x-pip-user": UID, "x-pip-license": license },
  }), env);
  assert.equal((await (await get()).json()).left, 10); // never spent
  await free(env);
  assert.equal((await (await get()).json()).left, 9);
  const license = await licenseFor(SECRET, UID);
  assert.equal((await (await get(license)).json()).licensed, true);
});
