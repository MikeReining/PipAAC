/**
 * 030 slice 3 Works Tests — POST /api/v1/pictures/draw (+ /allowance).
 *
 *  WT5  reuse is free: find never touches draw counters
 *  WT6  a miss decrements once; the same subject from another license hits
 *  WT7  redraw needs a new description (same subject → hit, new desc → mint)
 *  WT9  empty allowance → 402 before any vendor call
 *  WT10 unsafe → 422 before Jev or synth
 *  also: single flight, stub default, ledger/prompt carry no identity,
 *        drawn rows enter the index, /allowance reads tier from the relay
 *
 * env.DRAW_SYNTH stands in for Muse; env.PICTURE_JEV for TypeSafe; the
 * shared TileLedger DO holds the real ledger over node:sqlite.
 */
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "./index.js";
import { licenseFor } from "./license.mjs";
import { TileLedger } from "./tile.js";
import { drawKey, drawSubject } from "../shared/picture_index.mjs";

const SECRET = "draw-test-secret";
const UID = "11111111-2222-3333-4444-555555555555";
const UID2 = "99999999-aaaa-bbbb-cccc-dddddddddddd";
const te = (s) => new TextEncoder().encode(s);

const fakeBucket = () => {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      return {
        body: v instanceof Uint8Array ? v : te(v),
        arrayBuffer: async () => (v instanceof Uint8Array ? v : te(v)).buffer,
        text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)),
      };
    },
    async put(key, v) { store.set(key, v); },
  };
};

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

const fakeIndex = () => {
  const rows = new Map();
  return {
    rows,
    async upsert(batch) { for (const r of batch) rows.set(r.id, r); },
    async query() { return { matches: [] }; },
    async describe() { return { vectorCount: rows.size }; },
  };
};

const PNG_BYTES = te("PNG:drawn");

const makeEnv = ({ jev, synth, entitlement = "free", waitMs } = {}) => {
  const env = {
    PIP_LICENSE_SECRET: SECRET,
    PIP_ADMIN_TOKEN: "admin-test-token",
    VOICE: fakeBucket(),
    EXT_ART: fakeBucket(),
    AI: {
      calls: [],
      async run(model, input) {
        this.calls.push({ model, input });
        return { data: (Array.isArray(input.text) ? input.text : [input.text]).map(() => [0.1, 0.2]) };
      },
    },
    PICTURES: fakeIndex(),
    PICTURES_CALIB: fakeIndex(),
    PICTURE_JEV: jev ?? (async () => ({
      scope: "common", kind: "None", language: "en",
      draw: {
        entity_mode: "organic_noun", packaging: "none", framing: "object",
        hand_mode: "resting_ball", anchor: "none", social_scale: "zero",
      },
    })),
    // env.DRAW_SYNTH(prompt, refs) per § 5.3
    DRAW_SYNTH: synth === undefined ? async () => PNG_BYTES : synth,
    DRAW_STUB: "1",
    RELAY: {
      idFromName: () => "relay",
      get: () => ({
        fetch: () => Promise.resolve(new Response(JSON.stringify({ entitlement }))),
      }),
    },
  };
  if (waitMs !== undefined) env.PIC_DRAW_WAIT_MS = waitMs;
  const db = new DatabaseSync(":memory:");
  const ctx = { storage: { sql: sqlFor(db) }, blockConcurrencyWhile: (fn) => fn() };
  env.__db = db;
  env.__ledger = new TileLedger(ctx, env);
  env.TILE_LEDGER = {
    idFromName: () => "ledger",
    get: () => ({ fetch: (req) => env.__ledger.fetch(req) }),
  };
  return env;
};

const draw = async (env, body, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/draw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid, license: await licenseFor(SECRET, uid), ...body,
    }),
  }), env);

const allowance = async (env, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/allowance", {
    headers: { "x-pip-user": uid, "x-pip-license": await licenseFor(SECRET, uid) },
  }), env);

const keyFor = async (scope, text, description = "") =>
  drawKey("pip-v1", drawSubject({ scope, text, description }));

test("WT6: a miss calls synth once and decrements by exactly one", async () => {
  let calls = 0;
  const env = makeEnv({ synth: async () => (calls++, PNG_BYTES) });
  const r = await draw(env, { text: "trampoline" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-draw-cache"), "mint");
  assert.equal(r.headers.get("x-drawings-left"), "4");
  assert.equal(calls, 1);

  // The ledger row knows the subject, never the user (§ 8).
  const row = env.__db.prepare("SELECT * FROM pic_drawing").all()[0];
  assert.equal(row.status, "ready");
  assert.equal(row.text, "trampoline");
  for (const v of Object.values(row)) {
    assert.ok(!String(v).includes(UID));
    assert.ok(!/pip-life-/.test(String(v)));
  }
  const mint = env.__db.prepare("SELECT * FROM pic_mint").all();
  assert.equal(mint.length, 1); // one image call, one ledger event
});

test("WT6: same subject from another license is a free hit", async () => {
  let calls = 0;
  const env = makeEnv({ synth: async () => (calls++, PNG_BYTES) });
  await draw(env, { text: "trampoline" }, UID);
  const r = await draw(env, { text: "trampoline" }, UID2);
  assert.equal(r.headers.get("x-draw-cache"), "hit");
  assert.equal(calls, 1); // still one synth
  const left = await (await allowance(env, UID2)).json();
  assert.equal(left.left, 5); // UID2 never spent
});

test("WT7: same subject hits; a new description is a new drawing", async () => {
  let calls = 0;
  const env = makeEnv({ synth: async () => (calls++, PNG_BYTES) });
  await draw(env, { text: "trampoline", description: "backyard one" });
  const again = await draw(env, { text: "trampoline", description: "backyard one" });
  assert.equal(again.headers.get("x-draw-cache"), "hit");
  assert.equal(calls, 1);
  const fresh = await draw(env, { text: "trampoline", description: "indoor rebounder" });
  assert.equal(fresh.headers.get("x-draw-cache"), "mint");
  assert.equal(fresh.headers.get("x-drawings-left"), "3");
  assert.equal(calls, 2);
});

test("personal scope: prompt + ledger carry the description, never the name", async () => {
  const seen = [];
  const env = makeEnv({
    jev: async () => ({ scope: "personal", kind: "Yellow", language: "en", draw: {
      entity_mode: "organic_noun", packaging: "none", framing: "object",
      hand_mode: "resting_ball", anchor: "none", social_scale: "zero" } }),
    synth: async (prompt) => (seen.push(prompt), PNG_BYTES),
  });
  const r = await draw(env, { text: "Cooper", description: "our golden retriever" });
  assert.equal(r.status, 200);
  assert.ok(seen[0].includes("our golden retriever"));
  assert.ok(!seen[0].includes("Cooper"));
  const row = env.__db.prepare("SELECT text FROM pic_drawing").all()[0];
  assert.equal(row.text, "our golden retriever");
  // The ledger key is shared: "Max — our golden retriever" hits the same drawing.
  const r2 = await draw(env, { text: "Max", description: "our golden retriever" });
  assert.equal(r2.headers.get("x-draw-cache"), "hit");
});

test("WT9: empty allowance returns 402 before any vendor call", async () => {
  let calls = 0, jevCalls = 0;
  const env = makeEnv({
    synth: async () => (calls++, PNG_BYTES),
    jev: async () => (jevCalls++, { scope: "common", kind: "None", language: "en", draw: {} }),
  });
  await env.VOICE.put(`usage-draw-total/${UID}`, JSON.stringify({ used: 5 }));
  const r = await draw(env, { text: "trampoline" });
  assert.equal(r.status, 402);
  assert.equal(calls, 0);
  assert.equal(jevCalls, 0);
});

test("allowance endpoint + lifetime tier from the relay", async () => {
  const env = makeEnv({ entitlement: "lifetime" });
  const before = await (await allowance(env)).json();
  assert.deepEqual(before, { left: 300, total: 300 });
  await draw(env, { text: "trampoline" });
  const after = await (await allowance(env)).json();
  assert.equal(after.left, 299);
});

test("WT10: unsafe text returns 422 before Jev or synth", async () => {
  let calls = 0, jevCalls = 0;
  const env = makeEnv({
    synth: async () => (calls++, PNG_BYTES),
    jev: async () => (jevCalls++, { scope: "common", draw: {} }),
  });
  const r = await draw(env, { text: "suicide" });
  assert.equal(r.status, 422);
  assert.equal(calls, 0);
  assert.equal(jevCalls, 0);
  // description side too, and whole-word only ("Essex" is fine)
  assert.equal((await draw(env, { text: "word", description: "hardcore porn" })).status, 422);
  assert.equal((await draw(env, { text: "Essex county" })).status, 200);
});

test("WT5: find and a hit cost nothing — reuse is free", async () => {
  const env = makeEnv();
  const lic = await licenseFor(SECRET, UID);
  const f = await worker.fetch(new Request("https://x/api/v1/pictures/find", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: UID, license: lic, text: "apple" }),
  }), env);
  assert.equal(f.status, 200);
  assert.equal((await drawUsed(env, UID)), 0);
  await draw(env, { text: "trampoline" });
  const hit = await draw(env, { text: "trampoline" });
  assert.equal((await drawUsed(env, UID)), 1); // hit did not spend
  assert.equal(hit.headers.get("x-draw-cache"), "hit");
});
const drawUsed = async (env, uid) => {
  const obj = await env.VOICE.get(`usage-draw-total/${uid}`);
  return obj ? JSON.parse(await obj.text()).used : 0;
};

test("default stub: no seam and no live key mints a placeholder, still counts", async () => {
  const env = makeEnv({ synth: null });
  env.DRAW_SYNTH = undefined;
  const r = await draw(env, { text: "trampoline" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-draw-cache"), "stub");
  assert.equal(r.headers.get("x-drawings-left"), "4");
  const key = await keyFor("common", "trampoline");
  assert.ok(env.VOICE.store.has(`drawing/${key}.png`));
});

test("no stub flag and no live key: the claim fails closed at 502", async () => {
  const env = makeEnv({ synth: null });
  env.DRAW_SYNTH = undefined;
  env.DRAW_STUB = undefined;
  const r = await draw(env, { text: "trampoline" });
  assert.equal(r.status, 502);
  const row = env.__db.prepare("SELECT status, retry_after FROM pic_drawing").all()[0];
  assert.equal(row.status, "failed");
  assert.ok(row.retry_after > Date.now());
  assert.equal(await drawUsed(env, UID), 0); // a failed mint never spends
});

test("drawn rows enter the picture index as source drawn", async () => {
  const env = makeEnv();
  await draw(env, { text: "trampoline", description: "big backyard one" });
  const key = await keyFor("common", "trampoline", "big backyard one");
  const row = env.PICTURES.rows.get(`drw_${key}`);
  assert.ok(row, "drw_ row upserted");
  assert.equal(row.metadata.source, "drawn");
  assert.equal(row.metadata.status, "approved");
  assert.match(row.metadata.caption, /trampoline/);
});

test("single flight: a second claim waits, then fails closed at the bound", async () => {
  const env = makeEnv({ waitMs: 50 });
  const key = await keyFor("common", "trampoline");
  // Someone else holds the mint — the loser waits for a row that never
  // finishes inside its bound.
  env.__db.prepare(
    `INSERT INTO pic_drawing (key, text, description, status, claimed_at, created_at)
     VALUES (?, 'trampoline', '', 'minting', ?, ?)`).run(key, Date.now(), Date.now());
  const r = await draw(env, { text: "trampoline" });
  assert.equal(r.status, 502);
});

test("draw gates: bad ids, bad license, unsafe order before allowance", async () => {
  const env = makeEnv();
  assert.equal((await draw(env, { user_id: "nope", text: "x" })).status, 400);
  const r = await worker.fetch(new Request("https://x/api/v1/pictures/draw", {
    method: "POST",
    body: JSON.stringify({ user_id: UID, license: "pip-life-no", text: "x" }),
  }), env);
  assert.equal(r.status, 403);
  // 422 beats 402 — unsafe never spends a check
  await env.VOICE.put(`usage-draw-total/${UID}`, JSON.stringify({ used: 5 }));
  assert.equal((await draw(env, { text: "fuck" })).status, 422);
});

test("no identity in the vendor seam arguments", async () => {
  const seen = [];
  const env = makeEnv({ synth: async (...args) => (seen.push(JSON.stringify(args)), PNG_BYTES) });
  await draw(env, { text: "trampoline", description: "blue one" });
  for (const s of seen) {
    assert.ok(!s.includes(UID));
    assert.ok(!/pip-life-/.test(s));
  }
});

test("admin recent: 401 without token, newest drawings first", async () => {
  const env = makeEnv();
  const noAuth = await worker.fetch(new Request(
    "https://x/admin/v1/pictures/recent"), env);
  assert.equal(noAuth.status, 401);
  await draw(env, { text: "trampoline" });
  await draw(env, { text: "submarine" });
  const r = await worker.fetch(new Request("https://x/admin/v1/pictures/recent",
    { headers: { authorization: `Bearer ${env.PIP_ADMIN_TOKEN}` } }), env);
  const { rows } = await r.json();
  assert.equal(rows.length, 2);
  assert.ok(rows[0].created_at >= rows[1].created_at);
  assert.equal(rows[0].status, "ready");
});
