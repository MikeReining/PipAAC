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
    // TILE_NOW is the DO's clock seam — tests set env.__now to move
    // the trial forward to day 8 without sleeping.
    TILE_NOW: () => env.__now ?? Date.now(),
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

/** An unlicensed press — no license field at all; the trial decides. */
const free = (env, over = {}, headers) =>
  call(env, { user_id: UID, mode: "fix", text: "want apple", ...over }, headers);

const DAY = 86_400_000;
const startTrial = (env, uid = UID, headers = {}) =>
  worker.fetch(new Request("https://x/api/v1/trial/start", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ user_id: uid }),
  }), env);
const trialGet = (env, uid = UID, license = "") =>
  worker.fetch(new Request("https://x/api/v1/trial", {
    headers: { "x-pip-user": uid, "x-pip-license": license },
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

/* ---------------------- 040: the 7-day trial ---------------------- */

test("unlicensed with no trial record is bad_license — the clock starts at install", async () => {
  const env = makeEnv();
  const r = await free(env);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "bad_license");
});

test("a live trial entitles the transform — nothing is counted", async () => {
  const env = makeEnv();
  const start = await (await startTrial(env)).json();
  assert.equal(typeof start.endsAt, "number");
  for (let i = 0; i < 12; i++) {
    const r = await free(env);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).text, "fix: want apple");
  }
});

test("day 8 denies with the existing code — nothing is hidden, the press is over", async () => {
  const env = makeEnv();
  env.__now = 1_700_000_000_000;
  await startTrial(env);
  env.__now += 8 * DAY;
  const r = await free(env);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "bad_license");
});

test("the first start wins: a second start returns the same endsAt", async () => {
  const env = makeEnv();
  env.__now = 1_700_000_000_000;
  const first = await (await startTrial(env)).json();
  env.__now += 3 * DAY;
  const second = await (await startTrial(env)).json();
  assert.equal(second.endsAt, first.endsAt);
});

test("a forged license is bad_license even inside the trial", async () => {
  const env = makeEnv();
  await startTrial(env);
  const r = await call(env, { user_id: UID, license: "pip-life-forged", mode: "fix", text: "hi" });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "bad_license");
});

test("the per-connection cap refuses the 6th new profile — and refuses it nothing else", async () => {
  const env = makeEnv();
  const headers = { "cf-connecting-ip": "203.0.113.7" };
  const first = crypto.randomUUID();
  for (let i = 0; i < 5; i++) {
    const uid = i === 0 ? first : crypto.randomUUID();
    const r = await startTrial(env, uid, headers);
    assert.equal(typeof (await r.json()).endsAt, "number", `profile ${i + 1} should trial`);
  }
  const capped = await (await startTrial(env, crypto.randomUUID(), headers)).json();
  assert.equal(capped.endsAt, null);
  // The cap counts new profiles only — an existing one keeps its trial,
  // and another connection is unaffected.
  assert.equal(typeof (await (await startTrial(env, first, headers)).json()).endsAt, "number");
  assert.equal(typeof (await (await startTrial(env, crypto.randomUUID(),
    { "cf-connecting-ip": "198.51.100.4" })).json()).endsAt, "number");
  // A refused start is not recorded: a later, uncapped start can still win.
  env.__now = (env.__now ?? Date.now()) + DAY;
  assert.equal(typeof (await (await startTrial(env,
    crypto.randomUUID(), headers)).json()).endsAt, "number");
});

test("GET /api/v1/trial answers licensed or the trial's endsAt", async () => {
  const env = makeEnv();
  assert.equal((await (await trialGet(env)).json()).endsAt, null); // never started
  const { endsAt } = await (await startTrial(env)).json();
  assert.equal((await (await trialGet(env)).json()).endsAt, endsAt);
  const license = await licenseFor(SECRET, UID);
  assert.equal((await (await trialGet(env, UID, license)).json()).licensed, true);
});
