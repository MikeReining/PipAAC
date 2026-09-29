/**
 * 030 slice 1 Works Tests — POST /api/v1/pictures/find (+ /find-batch).
 *
 *  WT1 spacing        "apple sauce" top-1 is applesauce
 *  WT2 languages      Apfel / manzana / pomme top-1 is apple, one embed
 *                     call, no translation step anywhere
 *  WT3 modifiers      "red apple" → apple; "i want applesauce" → top 4
 *  find gates         bad ids, license, text, bindings, fair use
 *  no identity        vendor seams never see user/device/license
 *  admin index        401, embed+upsert through the real route
 *
 * env.AI and env.PICTURES are in-memory stubs standing in for Workers
 * AI and Vectorize — the worker's embed → query → rescore → auto path
 * runs for real, and the shared TileLedger DO backs rank signals over
 * node:sqlite.
 */
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "./index.js";
import { licenseFor } from "./license.mjs";
import { TileLedger } from "./tile.js";

const SECRET = "pic-test-secret";
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
        arrayBuffer: async () =>
          (v instanceof Uint8Array ? v : te(v)).buffer,
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

/* ------------------------- deterministic embeddings ------------------------- */

/** Meaning stub: token-bag vectors where adjacent-word concatenations
 *  weigh double ("apple sauce" ≈ "applesauce") and a synonym map carries
 *  the multilingual rows the real bge-m3 owns (WT2). 64 dims, one dim
 *  per known token, junk dims for unknowns — the point is the plumbing,
 *  not the semantics. */
const DIMS = 64;
const SYN = new Map(Object.entries({
  apfel: "apple", manzana: "apple", pomme: "apple", hund: "dog",
}));
const DIM_OF = new Map();
let nextDim = 0;
function dimFor(token) {
  if (!DIM_OF.has(token)) {
    DIM_OF.set(token, nextDim < 40 ? nextDim++ : 40 + (token.charCodeAt(0) % 24));
  }
  return DIM_OF.get(token);
}
function fakeEmbed(text) {
  const words = String(text).toLowerCase().match(/[a-zäöüßé]+/g) ?? [];
  const v = new Array(DIMS).fill(0);
  for (const w of words) v[dimFor(SYN.get(w) ?? w)] += 1;
  for (let i = 0; i + 1 < words.length; i++) {
    v[dimFor(words[i] + words[i + 1])] += 2;
  }
  return v;
}
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const fakeIndex = () => {
  const rows = new Map();
  return {
    rows,
    async upsert(batch) { for (const r of batch) rows.set(r.id, r); },
    async query(values, { topK = 4 } = {}) {
      return {
        matches: [...rows.values()]
          .map((r) => ({ id: r.id, score: cosine(values, r.values), metadata: r.metadata }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK),
      };
    },
    async describe() { return { vectorCount: rows.size }; },
  };
};

/* ---------------------------------- env ---------------------------------- */

const ROWS = [
  { image_id: "img_apple", asset: "/symbols/apple.png", source: "catalog",
    status: "approved", caption: "apple · Food & Drink" },
  { image_id: "img_sauce", asset: "/symbols/applesauce.png", source: "catalog",
    status: "approved", caption: "applesauce · Food & Drink" },
  { image_id: "img_banana", asset: "/symbols/banana.png", source: "catalog",
    status: "approved", caption: "banana · Food & Drink" },
  { image_id: "img_dog", asset: "/symbols/dog.png", source: "catalog",
    status: "approved", caption: "dog · Animals & Nature" },
  { image_id: "img_park", asset: "/symbols/park.png", source: "catalog",
    status: "approved", caption: "park · Places" },
  { image_id: "ext_trampoline", asset: "/api/v1/pictures/img/ext_trampoline",
    source: "extended", status: "approved", caption: "trampoline · Toys & Play · object" },
];

const makeEnv = ({ jev } = {}) => {
  const env = {
    PIP_LICENSE_SECRET: SECRET,
    PIP_ADMIN_TOKEN: "admin-test-token",
    VOICE: fakeBucket(),
    EXT_ART: fakeBucket(),
    AI: {
      calls: [],
      async run(model, input) {
        this.calls.push({ model, input });
        const texts = Array.isArray(input.text) ? input.text : [input.text];
        return { data: texts.map(fakeEmbed) };
      },
    },
    PICTURES: fakeIndex(),
    PICTURE_JEV: jev ?? (async () => ({ scope: "common", kind: "None", language: "en" })),
  };
  const db = new DatabaseSync(":memory:");
  const ctx = {
    storage: { sql: sqlFor(db) },
    blockConcurrencyWhile: (fn) => fn(),
  };
  env.__db = db;
  env.__ledger = new TileLedger(ctx, env);
  env.TILE_LEDGER = {
    idFromName: () => "ledger",
    get: () => ({ fetch: (req) => env.__ledger.fetch(req) }),
  };
  return env;
};

const seedIndex = async (env) => {
  const res = await worker.fetch(new Request("https://x/admin/v1/pictures/index", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PIP_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ index: "main", rows: ROWS }),
  }), env);
  assert.equal(res.status, 200);
  return res;
};

const find = async (env, body, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/find", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid, license: await licenseFor(SECRET, uid), ...body,
    }),
  }), env);

const findBatch = async (env, body, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/find-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid, license: await licenseFor(SECRET, uid), ...body,
    }),
  }), env);

/* --------------------------------- WT 1/2/3 --------------------------------- */

test("WT1 spacing: 'apple sauce' top-1 is applesauce", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const r = await find(env, { text: "apple sauce" });
  assert.equal(r.status, 200);
  const { candidates } = await r.json();
  assert.equal(candidates[0].image_id, "img_sauce");
  assert.equal(candidates[0].asset, "/symbols/applesauce.png");
});

test("WT2 other languages: Apfel/manzana/pomme top-1 apple, no translation call", async () => {
  const langs = [["Apfel", "de"], ["manzana", "es"], ["pomme", "fr"]];
  for (const [word, lang] of langs) {
    const jevCalls = [];
    const env = makeEnv({
      jev: async ({ text }) => {
        jevCalls.push(text);
        return { scope: "common", kind: "None", language: lang,
          language_probs: { [lang]: 0.9 } };
      },
    });
    await seedIndex(env);
    env.AI.calls.length = 0;
    const r = await find(env, { text: word });
    const { candidates, language } = await r.json();
    assert.equal(candidates[0].image_id, "img_apple", word);
    assert.equal(language, lang);
    // One embedding call, one Jev classify — nothing else (no translate).
    assert.equal(env.AI.calls.length, 1);
    assert.equal(jevCalls.length, 1);
  }
});

test("WT3 modifiers and phrases: 'red apple' → apple; 'i want applesauce' → top 4", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const red = await (await find(env, { text: "red apple" })).json();
  assert.equal(red.candidates[0].image_id, "img_apple");
  const phrase = await (await find(env, { text: "i want applesauce" })).json();
  assert.ok(phrase.candidates.length <= 4);
  assert.ok(phrase.candidates.some((c) => c.image_id === "img_sauce"));
});

test("response shape + default cutoff means auto is never set", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const r = await find(env, { text: "trampoline" });
  const body = await r.json();
  assert.equal(body.auto, null); // AUTO_CUTOFF defaults to 1.01
  assert.equal(body.scope, "common");
  assert.equal(body.kind, "None");
  assert.equal(body.language, "en");
  const c = body.candidates[0];
  assert.equal(c.image_id, "ext_trampoline");
  for (const key of ["image_id", "asset", "source", "score"]) {
    assert.ok(key in c, key);
  }
});

/* ---------------------------------- gates ---------------------------------- */

test("gates: bad ids, bad license, bad text, missing bindings", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const lic = await licenseFor(SECRET, UID);
  const bad1 = await find(env, { user_id: undefined, license: lic, text: "x" });
  assert.equal(bad1.status, 400);
  const bad2 = await worker.fetch(new Request("https://x/api/v1/pictures/find", {
    method: "POST",
    body: JSON.stringify({ user_id: UID, license: "pip-life-nope", text: "x" }),
  }), env);
  assert.equal(bad2.status, 403);
  assert.equal((await find(env, { text: "" })).status, 400);
  assert.equal((await find(env, { text: "x".repeat(81) })).status, 400);

  const bare = { PIP_LICENSE_SECRET: SECRET };
  const unbound = await worker.fetch(new Request("https://x/api/v1/pictures/find", {
    method: "POST",
    body: JSON.stringify({ user_id: UID, license: lic, text: "x" }),
  }), bare);
  assert.equal(unbound.status, 503);
});

test("fair use: burst cap returns 429 and no vendor calls after", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const minute = Math.floor(Date.now() / 60000);
  await env.VOICE.put(`usage-pic-min/${UID}/${minute}`,
    JSON.stringify({ reqs: 30 }));
  env.AI.calls.length = 0;
  const r = await find(env, { text: "apple" });
  assert.equal(r.status, 429);
  assert.equal(env.AI.calls.length, 0);
});

/* ------------------------------ find-batch ------------------------------ */

test("find-batch: per-item results, bad item flagged, batch embed", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const r = await findBatch(env, {
    items: [{ text: "apple sauce" }, { text: "banana" }, { text: "  " }],
  });
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.equal(results.length, 3);
  assert.equal(results[0].candidates[0].image_id, "img_sauce");
  assert.equal(results[1].candidates[0].image_id, "img_banana");
  assert.equal(results[2].error, "bad_text");
  assert.equal((await findBatch(env, { items: [] })).status, 400);
  const many = { items: Array.from({ length: 51 }, () => ({ text: "x" })) };
  assert.equal((await findBatch(env, many)).status, 400);
});

/* ------------------------------- no identity ------------------------------- */

test("no identity: vendor seams never see user/device/license material", async () => {
  const seen = [];
  const env = makeEnv({
    jev: async (args) => {
      seen.push(JSON.stringify(args));
      return { scope: "common", kind: "None", language: "en" };
    },
  });
  await seedIndex(env);
  await find(env, { text: "apple", description: "red one" });
  for (const s of seen) {
    assert.equal(s.includes(UID), false);
    assert.equal(/pip-life-/.test(s), false);
  }
  for (const call of env.AI.calls) {
    const s = JSON.stringify(call);
    assert.equal(s.includes(UID), false);
    assert.equal(/pip-life-/.test(s), false);
  }
});

/* -------------------------------- admin index ------------------------------- */

test("admin index: 401 without token; upsert embeds and stores; info counts", async () => {
  const env = makeEnv();
  const noAuth = await worker.fetch(new Request(
    "https://x/admin/v1/pictures/index", { method: "POST", body: "{}" }), env);
  assert.equal(noAuth.status, 401);

  await seedIndex(env);
  assert.equal(env.PICTURES.rows.size, ROWS.length);
  const row = env.PICTURES.rows.get("img_apple");
  assert.equal(row.metadata.caption, "apple · Food & Drink");
  assert.equal(row.metadata.source, "catalog");

  const info = await (await worker.fetch(new Request(
    "https://x/admin/v1/pictures/index/info",
    { headers: { authorization: `Bearer ${env.PIP_ADMIN_TOKEN}` } }), env)).json();
  assert.equal(info.main.vectorCount, ROWS.length);
});

test("img route: ext_* streams from EXT_ART, drw_* from VOICE, 403/404 gates", async () => {
  const env = makeEnv();
  const lic = await licenseFor(SECRET, UID);
  env.EXT_ART.store.set("symbols/extended/trampoline.png", te("PNG:ext"));
  env.VOICE.store.set(`drawing/${"a".repeat(64)}.png`, te("PNG:drw"));
  const get = (id, headers = { "x-pip-user": UID, "x-pip-license": lic }) =>
    worker.fetch(new Request(`https://x/api/v1/pictures/img/${id}`, { headers }), env);

  const noAuth = await get("ext_trampoline", {});
  assert.equal(noAuth.status, 400);
  const badLic = await get("ext_trampoline", { "x-pip-user": UID, "x-pip-license": "pip-life-x" });
  assert.equal(badLic.status, 403);

  const ext = await get("ext_trampoline");
  assert.equal(ext.status, 200);
  assert.equal(await ext.text(), "PNG:ext");
  const drw = await get(`drw_${"a".repeat(64)}`);
  assert.equal(drw.status, 200);
  assert.equal(await drw.text(), "PNG:drw");
  assert.equal((await get("drw_zzzz")).status, 404);
  assert.equal((await get("img_0001")).status, 404);
});
