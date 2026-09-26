/**
 * 024 slice 1 Works Test — POST /api/v1/voice/speak.
 *
 * - eligible sentence: synth once, stored in R2, replayed as hit
 * - case/spacing collapse to one cache key
 * - a rare name keeps the sentence private: spoken, never stored
 * - per-license counters count fresh synthesis only; the day/minute
 *   caps answer 429 so the client falls back to word clips
 * - Grok never sees an id: the synth stub records its arguments
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { licenseFor } from "./license.mjs";

const SECRET = "voice-test-secret";
const UID = "11111111-2222-3333-4444-555555555555";

const fakeBucket = () => {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      return {
        body: typeof v === "string" ? new TextEncoder().encode(v) : v,
        text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)),
      };
    },
    async put(key, v) { store.set(key, v); },
  };
};

const makeEnv = ({ synth } = {}) => ({
  PIP_LICENSE_SECRET: SECRET,
  VOICE: fakeBucket(),
  VOICE_SYNTH: synth ?? (async (text) => new TextEncoder().encode(`AUDIO:${text}`)),
});

const speak = async (env, body) =>
  worker.fetch(new Request("https://x/api/v1/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);

const good = async (env, over = {}) => {
  const license = await licenseFor(SECRET, UID);
  return speak(env, { user_id: UID, license, text: "i want a cookie", ...over });
};

test("eligible sentence synthesizes once then serves from R2", async () => {
  const env = makeEnv();
  let calls = 0;
  env.VOICE_SYNTH = async (text) => { calls++; return new TextEncoder().encode(`AUDIO:${text}`); };

  const r1 = await good(env);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("x-voice-cache"), "miss");
  assert.equal(await r1.text(), "AUDIO:i want a cookie");
  assert.equal(calls, 1);
  assert.equal(env.VOICE.store.size >= 2, true); // audio + usage ledger

  const r2 = await good(env);
  assert.equal(r2.headers.get("x-voice-cache"), "hit");
  assert.equal(await r2.text(), "AUDIO:i want a cookie");
  assert.equal(calls, 1); // cache hit — no second synth, no count
});

test("cache key normalizes case and spaces, keeps punctuation", async () => {
  const env = makeEnv();
  await good(env, { text: "Is that  MINE?" });
  const r = await good(env, { text: "is that mine?" });
  assert.equal(r.headers.get("x-voice-cache"), "hit");
});

test("a rare-name sentence is spoken but never shared", async () => {
  const env = makeEnv();
  let calls = 0;
  env.VOICE_SYNTH = async () => { calls++; return new Uint8Array([1, 2, 3]); };

  const r1 = await good(env, { text: "Aoife McGinley hit me" });
  assert.equal(r1.headers.get("x-voice-cache"), "private");
  for (const key of env.VOICE.store.keys()) {
    assert.equal(key.startsWith("speak/"), false); // nothing cached
  }
  const r2 = await good(env, { text: "Aoife McGinley hit me" });
  assert.equal(r2.headers.get("x-voice-cache"), "private");
  assert.equal(calls, 2); // synthesized again — only her device caches it
});

test("license gate: bad license 403, bad shapes 400", async () => {
  const env = makeEnv();
  const r1 = await speak(env, { user_id: UID, license: "pip-life-wrong", text: "i want a cookie" });
  assert.equal(r1.status, 403);
  const r2 = await speak(env, { user_id: "not-a-uuid", license: "x", text: "i want a cookie" });
  assert.equal(r2.status, 400);
  const r3 = await good(env, { text: "a".repeat(121) });
  assert.equal(r3.status, 400);
  const r4 = await good(env, { voice: "nobody" });
  assert.equal(r4.status, 400);
});

test("fair use: burst cap 429s and logs a hit; counters count synthesis", async () => {
  const env = makeEnv();
  const uid = UID;
  const day = new Date().toISOString().slice(0, 10);
  const minute = Math.floor(Date.now() / 60000);
  // Pre-load the minute bucket at the cap.
  await env.VOICE.put(`usage-min/${uid}/${minute}`, JSON.stringify({ reqs: 20 }));
  const r = await good(env, { text: `unique sentence ${Math.random()}` });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).over, "minute");
  const hits = [...env.VOICE.store.keys()].filter((k) => k.startsWith(`usage-hits/${uid}/`));
  assert.equal(hits.length, 1);
});

test("fair use: day char budget 429s past 8000 chars", async () => {
  const env = makeEnv();
  const day = new Date().toISOString().slice(0, 10);
  await env.VOICE.put(`usage/${UID}/${day}`, JSON.stringify({ chars: 7990, reqs: 1 }));
  const r = await good(env);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).over, "day");
});

test("per-license day counter grows by synthesized chars only", async () => {
  const env = makeEnv();
  await good(env, { text: "i want a cookie" });      // 15 chars, synth
  await good(env, { text: "i want a cookie" });      // hit — not counted
  await good(env, { text: "i want a cookie too" });  // 19 chars, synth
  const day = new Date().toISOString().slice(0, 10);
  const row = JSON.parse(env.VOICE.store.get(`usage/${UID}/${day}`));
  assert.equal(row.chars, 34);
  assert.equal(row.reqs, 2);
});

test("no Grok key and no stub -> 503, client falls back to clips", async () => {
  const env = makeEnv({ synth: null });
  env.VOICE_SYNTH = undefined;
  const r = await good(env);
  assert.equal(r.status, 503);
});
