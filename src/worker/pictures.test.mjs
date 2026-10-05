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
const UID3 = "77777777-8888-9999-aaaa-bbbbbbbbbbbb";
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
    async upsert(batch) {
      for (const r of batch) {
        // real Vectorize rejects ids over 64 bytes (40008)
        if (new TextEncoder().encode(r.id).length > 64) {
          throw new Error("VECTOR_UPSERT_ERROR (code = 40008): id too long");
        }
        rows.set(r.id, r);
      }
    },
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
    PICTURES_CALIB: fakeIndex(),
    PICTURE_JEV: jev ?? (async () => ({ scope: "common", kind: "None", language: "en" })),
    // Tier-1 seam: the lexical label map, mirroring the seed rows —
    // without it the real bundled map would leak production ids in.
    PICTURE_LABELS: {
      apple: [{ image_id: "img_apple", asset: "/symbols/apple.png", source: "catalog",
        caption: "apple · Food & Drink", sense: "sns_apple" }],
      applesauce: [{ image_id: "img_sauce", asset: "/symbols/applesauce.png", source: "catalog",
        caption: "applesauce · Food & Drink", sense: "sns_sauce" }],
      banana: [{ image_id: "img_banana", asset: "/symbols/banana.png", source: "catalog",
        caption: "banana · Food & Drink", sense: "sns_banana" }],
      dog: [{ image_id: "img_dog", asset: "/symbols/dog.png", source: "catalog",
        caption: "dog · Animals & Nature", sense: "sns_dog" }],
      park: [{ image_id: "img_park", asset: "/symbols/park.png", source: "catalog",
        caption: "park · Places", sense: "sns_park" }],
      // trampoline is absent — its ext row is pending, and pending art
      // never enters the label map. Its tier-1 win in tests comes from
      // the pool caption scan, same as a not-yet-indexed drawing.
      // "bat" names two senses — a homograph: never auto, always shows.
      bat: [
        { image_id: "img_bat_animal", asset: "/symbols/bat.png", source: "catalog",
          caption: "bat · Animals & Nature", sense: "sns_bat_animal", label: "bat" },
        { image_id: "img_bat_sport", asset: "/symbols/bat2.png", source: "catalog",
          caption: "bat · Toys, Play, Media & Leisure", sense: "sns_bat_sport", label: "bat" },
      ],
      // "zebra" is a label but its image is NOT in the index — spelling
      // distance alone must never suggest what the embedding can't see.
      zebra: [{ image_id: "img_zebra", asset: "/symbols/zebra.png", source: "catalog",
        caption: "zebra · Animals & Nature", sense: "sns_zebra", label: "zebra" }],
    },
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

test("response shape + calibrated cutoff gates similarity, not identity", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const r = await find(env, { text: "trampoline" });
  const body = await r.json();
  // "trampoline" IS this picture's label — tier-1 identity applies it
  // at any cutoff (§ 4.2: exact headword beats the score gate).
  assert.equal(body.auto, "ext_trampoline");
  // The founder saved 0.8 — the finder is calibrated, so a miss draws.
  assert.equal(body.calibrated, true);
  assert.equal(body.scope, "common");
  assert.equal(body.kind, "None");
  assert.equal(body.language, "en");
  const c = body.candidates[0];
  assert.equal(c.image_id, "ext_trampoline");
  for (const key of ["image_id", "asset", "source", "score"]) {
    assert.ok(key in c, key);
  }
});

test("tier-1 auto that the vector query missed still leads the candidates", async () => {
  // A newly added picture is in the label map before its vector is
  // queryable. The client applies `auto` only if it is a candidate —
  // otherwise it would spend a drawing on a word we already have.
  const env = makeEnv();
  await seedIndex(env);
  env.PICTURE_LABELS.crocs = [{
    image_id: "ext_crocs", asset: "/api/v1/pictures/img/ext_crocs", source: "extended",
    caption: "crocs · Clothes", sense: "ext_crocs",
  }];
  const body = await (await find(env, { text: "crocs" })).json();
  assert.equal(body.auto, "ext_crocs");
  assert.equal(body.candidates[0].image_id, "ext_crocs");
  assert.ok(body.candidates.length <= 4);
});

test("homograph: 'bat' never auto-applies — both senses lead the choices", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const body = await (await find(env, { text: "bat" })).json();
  assert.equal(body.auto, null);
  assert.equal(body.homograph, true);
  // The label's own images lead — the adult picks the animal or the bat.
  assert.equal(body.candidates[0].image_id, "img_bat_animal");
  assert.equal(body.candidates[1].image_id, "img_bat_sport");
  assert.equal(body.candidates[0].cosine, null); // injected — no vector score
});

/* --------------------------- typo suggestion ---------------------------- */

test("suggestion: 'bananna' offers 'banana' — nothing auto-applies", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const body = await (await find(env, { text: "bananna" })).json();
  // Not a label, not a homograph — but one edit from "banana", whose
  // picture the embedding also surfaced: suggest, never silently apply.
  assert.equal(body.auto, null);
  assert.equal(body.suggestion?.text, "banana");
  assert.equal(body.suggestion?.image_id, "img_banana");
  assert.equal(body.suggestion?.asset, "/symbols/banana.png");
});

test("suggestion guards: real words, missing pool member, scope, language", async () => {
  const env = makeEnv();
  await seedIndex(env);
  // A correctly spelled label auto-applies — no suggestion.
  const real = await (await find(env, { text: "banana" })).json();
  assert.equal(real.auto, "img_banana");
  assert.equal(real.suggestion, null);
  // "zebrra" is one edit from "zebra", but img_zebra isn't in the index
  // — the embedding never saw it, so spelling alone can't suggest.
  const nopool = await (await find(env, { text: "zebrra" })).json();
  assert.equal(nopool.suggestion, null);
  // Personal scope and non-English never touch the English label map.
  const personal = makeEnv({ jev: async () =>
    ({ scope: "personal", kind: "None", language: "en" }) });
  await seedIndex(personal);
  const pbody = await (await find(personal, { text: "bananna" })).json();
  assert.equal(pbody.suggestion, null);
  const french = makeEnv({ jev: async () =>
    ({ scope: "common", kind: "None", language: "fr", language_probs: { fr: 0.95 } }) });
  await seedIndex(french);
  const fbody = await (await find(french, { text: "bananna" })).json();
  assert.equal(fbody.language, "fr");
  assert.equal(fbody.suggestion, null);
  // A homograph shows its senses — no typo suggestion on a real word.
  const homo = await (await find(env, { text: "bat" })).json();
  assert.equal(homo.suggestion, null);
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

test("admin find: calibration index sees pending rows; app find never does", async () => {
  const env = makeEnv();
  const noAuth = await worker.fetch(new Request(
    "https://x/admin/v1/pictures/find", { method: "POST", body: "{}" }), env);
  assert.equal(noAuth.status, 401);

  const PENDING = {
    image_id: "ext_apple2", asset: "/ext-local/apple2.png", source: "extended",
    status: "pending", caption: "apple · Food · object",
  };
  const put = (index, rows) => worker.fetch(new Request(
    "https://x/admin/v1/pictures/index", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.PIP_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ index, rows }),
    }), env);
  assert.equal((await put("calibration", [...ROWS, PENDING])).status, 200);

  const r = await worker.fetch(new Request("https://x/admin/v1/pictures/find", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PIP_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ index: "calibration", items: [{ text: "apple" }] }),
  }), env);
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.equal(results.length, 1);
  const ids = results[0].candidates.map((c) => c.image_id);
  assert.ok(ids.includes("ext_apple2")); // pending rows calibrate too
  assert.equal(typeof results[0].candidates[0].cosine, "number");
  assert.equal(results[0].language, "en");

  // The app's find path reads only PICTURES — the pending row stays out.
  const app = await find(env, { text: "apple" });
  const appIds = (await app.json()).candidates.map((c) => c.image_id);
  assert.ok(!appIds.includes("ext_apple2"));

  const bad = await worker.fetch(new Request("https://x/admin/v1/pictures/find", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PIP_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ index: "nope", items: [{ text: "x" }] }),
  }), env);
  assert.equal(bad.status, 400);
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

/* --------------------------------- WT12: picks --------------------------------- */

const pick = async (env, body, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/pick", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid, license: await licenseFor(SECRET, uid), ...body,
    }),
  }), env);

test("pick: 204, anonymous row keyed by normalized text, no identity", async () => {
  const env = makeEnv();
  const r = await pick(env, { text: "  Apple ", image_id: "img_banana" });
  assert.equal(r.status, 204);
  const rows = env.__db.prepare("SELECT * FROM pic_pick").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text_norm, "apple");
  assert.equal(rows[0].image_id, "img_banana");
  assert.equal(rows[0].count, 1);
  for (const v of Object.values(rows[0])) {
    assert.ok(!String(v).includes(UID));
    assert.ok(!/pip-life-/.test(String(v)));
  }
  // a second pick for the same pair bumps the count, not the row count
  await pick(env, { text: "apple", image_id: "img_banana" });
  assert.equal(env.__db.prepare("SELECT count FROM pic_pick").all()[0].count, 2);
});

test("WT12: a pick moves the score by pick_weight*log1p(n)", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const scoreFor = async () => {
    const { candidates } = await (await find(env, { text: "apple" })).json();
    return candidates.find((c) => c.image_id === "img_banana")?.score ?? null;
  };
  const before = await scoreFor();
  await pick(env, { text: "apple", image_id: "img_banana" });
  const after1 = await scoreFor();
  await pick(env, { text: "apple", image_id: "img_banana" });
  const after2 = await scoreFor();
  const w = 0.05; // picture_finder.json pick_weight
  assert.ok(Math.abs((after1 - before) - w * Math.log1p(1)) < 1e-9);
  assert.ok(Math.abs((after2 - before) - w * Math.log1p(2)) < 1e-9);
});

test("personal pick keys on the description, never the name", async () => {
  const env = makeEnv({
    jev: async () => ({ scope: "personal", kind: "Yellow", language: "en" }),
  });
  const r = await pick(env, {
    text: "Cooper", description: "our golden retriever", image_id: "drw_abc",
  });
  assert.equal(r.status, 204);
  const rows = env.__db.prepare("SELECT text_norm FROM pic_pick").all();
  assert.equal(rows[0].text_norm, "our golden retriever");
  // the name is nowhere in the anonymous table
  assert.ok(!rows.some((row) => row.text_norm.includes("cooper")));
});

test("pick fair-use: the 201st pick in a day 429s and records nothing", async () => {
  const env = makeEnv();
  const day = new Date().toISOString().slice(0, 10);
  await env.VOICE.put(`usage-pick/${UID}/${day}`, JSON.stringify({ chars: 200 }));
  const r = await pick(env, { text: "apple", image_id: "img_apple" });
  assert.equal(r.status, 429);
  assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_pick").all()[0].c, 0);
});

test("pick gates: bad id, bad license, missing image_id — and never spends draws", async () => {
  const env = makeEnv();
  assert.equal((await pick(env, { user_id: "nope", text: "x", image_id: "i" })).status, 400);
  const r = await worker.fetch(new Request("https://x/api/v1/pictures/pick", {
    method: "POST",
    body: JSON.stringify({ user_id: UID, license: "pip-life-no", text: "x", image_id: "i" }),
  }), env);
  assert.equal(r.status, 403);
  assert.equal((await pick(env, { text: "apple" })).status, 400);
  assert.ok(await (await pick(env, { text: "apple", image_id: "img_apple" })).ok);
  assert.equal(await env.VOICE.get(`usage-draw-total/${UID}`), null);
});

/* ------------------------------- WT15–18: reject + review ------------------------------- */

const reject = async (env, body, uid = UID) =>
  worker.fetch(new Request("https://x/api/v1/pictures/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid, license: await licenseFor(SECRET, uid), ...body,
    }),
  }), env);

const adminDisagree = async (env, path, body) =>
  worker.fetch(new Request(`https://x/admin/v1/pictures/disagreements${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PIP_ADMIN_TOKEN}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);

test("WT15: a no is recorded without identity — pick, photo, draw", async () => {
  const env = makeEnv();
  const drw = `drw_${"c".repeat(64)}`;
  assert.equal((await reject(env, { text: "apple", ours: "img_apple", action: "pick", theirs: "img_banana" })).status, 204);
  assert.equal((await reject(env, { text: "apple", ours: "img_apple", action: "photo" })).status, 204);
  assert.equal((await reject(env, { text: "apple", ours: "img_apple", action: "draw", theirs: drw, description: "a shinier apple" })).status, 204);

  const rows = env.__db.prepare("SELECT * FROM pic_disagreement ORDER BY id").all();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.action), ["pick", "photo", "draw"]);
  assert.equal(rows[1].theirs, null); // a photo is counted, never seen
  assert.equal(rows[2].theirs, drw);
  assert.equal(rows[2].description, "a shinier apple");
  for (const row of rows) {
    for (const v of Object.values(row)) {
      assert.ok(!String(v).includes(UID));
      assert.ok(!/pip-life-/.test(String(v)));
    }
  }
  // demotion counter moved too
  const rc = env.__db.prepare("SELECT count FROM pic_reject WHERE text_norm='apple' AND image_id='img_apple'").all();
  assert.equal(rc[0].count, 3);
});

test("reject validation: photo carries no theirs; draw needs a drw_ id", async () => {
  const env = makeEnv();
  assert.equal((await reject(env, { text: "x", ours: "img_a", action: "photo", theirs: "img_b" })).status, 400);
  assert.equal((await reject(env, { text: "x", ours: "img_a", action: "draw", theirs: "img_b" })).status, 400);
  assert.equal((await reject(env, { text: "x", ours: "img_a", action: "nope" })).status, 400);
  // descriptions shown on the founder review page must pass § 5.3 safety
  assert.equal((await reject(env, { text: "x", ours: "img_a", action: "pick",
    theirs: "img_b", description: "hardcore porn" })).status, 422);
  assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_disagreement").all()[0].c, 0);
});

test("WT16: rejections drop our picture's score for that text only", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const scoreFor = async (text, id) => {
    const { candidates } = await (await find(env, { text })).json();
    return candidates.find((c) => c.image_id === id)?.score ?? null;
  };
  const before = await scoreFor("red apple", "img_apple");
  for (const uid of [UID, UID2]) {
    await reject(env, { text: "red apple", ours: "img_apple", action: "photo" }, uid);
  }
  const after = await scoreFor("red apple", "img_apple");
  assert.ok(Math.abs((before - after) - 0.1 * Math.log1p(2)) < 1e-9);
  // "apple" untouched — the reject row keys on its own text
  assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_reject WHERE text_norm='apple'").all()[0].c, 0);
});

test("reject fair-use: past the day limit, 429 and nothing moves", async () => {
  const env = makeEnv();
  const day = new Date().toISOString().slice(0, 10);
  await env.VOICE.put(`usage-reject/${UID}/${day}`, JSON.stringify({ chars: 200 }));
  const r = await reject(env, { text: "apple", ours: "img_apple", action: "pick", theirs: "img_banana" });
  assert.equal(r.status, 429);
  assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_disagreement").all()[0].c, 0);
});

test("WT17: personal rejections count but never reach the review page", async () => {
  const env = makeEnv({ jev: async () => ({ scope: "personal", kind: "Yellow", language: "en" }) });
  const r = await reject(env, {
    text: "Grandma Rosa", description: "grandma with grey hair",
    ours: "img_0692", action: "draw", theirs: `drw_${"d".repeat(64)}`,
  });
  assert.equal(r.status, 204);
  const row = env.__db.prepare("SELECT * FROM pic_disagreement").all()[0];
  assert.equal(row.text_norm, "grandma with grey hair"); // description, not the name
  assert.equal(row.scope, "personal");
  const { rows } = await (await adminDisagree(env, "")).json();
  assert.equal(rows.length, 0); // personal scope never listed
});

test("WT18: pin auto-applies theirs for everyone; block keeps ours listed, never auto; undo restores", async () => {
  const env = makeEnv();
  await seedIndex(env);
  const autoOf = async (text) => (await (await find(env, { text })).json()).auto;

  // pin banana for "apple" — decideAuto returns a founder pin above any score
  await adminDisagree(env, "/pin", { text_norm: "apple", theirs: "img_banana" });
  assert.equal(await autoOf("apple"), "img_banana");
  await adminDisagree(env, "/unpin", { text_norm: "apple" });
  // pin gone — tier-1 identity still applies the apple symbol even
  // though the default cutoff (1.01) keeps tier-2 similarity off.
  assert.equal(await autoOf("apple"), "img_apple");

  // block apple for "red apple": still a candidate, never auto
  await adminDisagree(env, "/pin", { text_norm: "red apple", theirs: "img_apple" });
  await adminDisagree(env, "/block", { text_norm: "red apple", theirs: "img_apple" });
  const blocked = await (await find(env, { text: "red apple" })).json();
  assert.ok(blocked.candidates.some((c) => c.image_id === "img_apple"), "still listed");
  assert.equal(blocked.auto, "img_apple"); // pin outranks block in decideAuto
  await adminDisagree(env, "/unpin", { text_norm: "red apple" });
  assert.equal(await autoOf("red apple"), null);
  await adminDisagree(env, "/unblock", { text_norm: "red apple", theirs: "img_apple" });

  // log rows exist for every ruling
  const logs = env.__db.prepare("SELECT action FROM pic_admin_log").all();
  assert.ok(logs.length >= 6);

  // a redraw queue row without the hint is refused
  assert.equal((await adminDisagree(env, "/redraw", {
    text_norm: "apple", ours: "img_apple" })).status, 400);
  assert.equal((await adminDisagree(env, "/redraw", {
    text_norm: "apple", ours: "img_apple",
    description: "a shinier apple" })).status, 204);
});

test("disagreements grouping: choices carry counts, descriptions, photo totals", async () => {
  const env = makeEnv();
  const drw = `drw_${"e".repeat(64)}`;
  await reject(env, { text: "trampoline", ours: "ext_trampoline", action: "photo" });
  await reject(env, { text: "trampoline", ours: "ext_trampoline", action: "draw", theirs: drw, description: "a red one" }, UID2);
  await reject(env, { text: "submarine", ours: "ext_x", action: "pick", theirs: "img_sub" });
  const { rows } = await (await adminDisagree(env, "")).json();
  assert.equal(rows.length, 2);
  const g = rows.find((r) => r.text_norm === "trampoline");
  assert.equal(g.rejects, 2);
  assert.equal(g.ours, "ext_trampoline");
  const draw = g.choices.find((c) => c.action === "draw");
  assert.equal(draw.theirs, drw);
  assert.equal(draw.description, "a red one");
  const photo = g.choices.find((c) => c.action === "photo");
  assert.equal(photo.count, 1);

  // dismiss hides the group until a fresh rejection lands
  await adminDisagree(env, "/dismiss", { text_norm: "trampoline", ours: "ext_trampoline" });
  const after = await (await adminDisagree(env, "")).json();
  assert.equal(after.rows.length, 1);
  await reject(env, { text: "trampoline", ours: "ext_trampoline", action: "photo" });
  const back = await (await adminDisagree(env, "")).json();
  assert.equal(back.rows.find((r) => r.text_norm === "trampoline").rejects, 1);
});

test("admin disagreements routes need the token", async () => {
  const env = makeEnv();
  const r = await worker.fetch(new Request("https://x/admin/v1/pictures/disagreements"), env);
  assert.equal(r.status, 401);
});

test("Jev null scope fails closed on pick and reject — nothing recorded", async () => {
  for (const jev of [
    async () => ({ scope: null, kind: null, language: null }),
    async () => { throw new Error("jev down"); },
  ]) {
    const env = makeEnv({ jev });
    const p = await pick(env, { text: "Cooper", description: "our dog", image_id: "img_dog" });
    assert.equal(p.status, 503);
    assert.equal((await p.json()).error, "classify_unavailable");
    assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_pick").all()[0].c, 0);

    const r = await reject(env, {
      text: "Grandma Rosa", description: "my mom's mom",
      ours: "img_0692", action: "pick", theirs: "img_x",
    });
    assert.equal(r.status, 503);
    assert.equal(env.__db.prepare("SELECT COUNT(*) c FROM pic_disagreement").all()[0].c, 0);
    const { rows } = await (await adminDisagree(env, "")).json();
    assert.equal(rows.length, 0);
  }
});
