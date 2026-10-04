/**
 * 028 slice 1 Works Tests — POST /api/v1/voice/tile.
 *
 *  2 dedupe — one synth per (voice, locale, text), hits free
 *  3 single flight — ten concurrent requests, one vendor call
 *  4 held — bad locale/chars, recorded, never minted
 *  5 no identity — no user/device/license in ledger, R2 keys, or synth args
 *  6 recipe parity — in src/shared/tile_recipe.test.mjs
 *  7 limits — per-license day/minute caps, global budget, 80% marker
 *  8 failure isolation — 502, failed row, retry_after gate
 *
 * The TileLedger DO runs for real over a node:sqlite adapter — the same
 * driver board tests use — so these exercise DO behavior, not mocks.
 */
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "./index.js";
import { licenseFor } from "./license.mjs";
import { TileLedger } from "./tile.js";
import tileVoices from "../../data/catalog/tile_voices.json" with { type: "json" };
import catalogVoices from "../../data/catalog/voices.json" with { type: "json" };

const SECRET = "tile-test-secret";
const UID = "11111111-2222-3333-4444-555555555555";
const UID2 = "99999999-aaaa-bbbb-cccc-dddddddddddd";
const te = (s) => new TextEncoder().encode(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** node:sqlite behind the DO's minimal sql.exec().toArray() surface. */
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

const makeEnv = ({ synth } = {}) => {
  const env = {
    PIP_LICENSE_SECRET: SECRET,
    PIP_ADMIN_TOKEN: "admin-test-token",
    VOICE: fakeBucket(),
    TILE_SYNTH: synth ?? (async (text) => te(`AUDIO:${text}`)),
    TILE_DAY_MINTS: "500",
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

const tile = async (env, body) =>
  worker.fetch(new Request("https://x/api/v1/voice/tile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);

const admin = async (env, path, init = {}) =>
  worker.fetch(new Request(`https://x${path}`, {
    headers: { authorization: `Bearer ${env.PIP_ADMIN_TOKEN}` },
    ...init,
  }), env);

const good = async (env, over = {}, uid = UID) =>
  tile(env, {
    user_id: uid,
    license: await licenseFor(SECRET, uid),
    voice: "voi_default_en",
    locale: "en",
    text: "scientist",
    ...over,
  });

/* ------------------------------- WT 2/3 ------------------------------- */

test("dedupe: one synth per (voice, locale, text); hits are free", async () => {
  const env = makeEnv();
  let calls = 0;
  env.TILE_SYNTH = async (t) => { calls++; return te(`AUDIO:${t}`); };

  const r1 = await good(env);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("x-tile-cache"), "mint");
  assert.equal(await r1.text(), "AUDIO:scientist");

  // Case/space variants collapse to the same clip.
  const r2 = await good(env, { text: "  Scientist " });
  assert.equal(r2.headers.get("x-tile-cache"), "hit");

  // A second license hits the same shared clip — mint once for everyone.
  const r3 = await good(env, {}, UID2);
  assert.equal(r3.headers.get("x-tile-cache"), "hit");
  assert.equal(calls, 1);

  // The hit was uncounted: only the one mint entered the usage ledger.
  const day = new Date().toISOString().slice(0, 10);
  const row = JSON.parse(env.VOICE.store.get(`usage-tile/${UID}/${day}`));
  assert.equal(row.chars, 1);
  assert.equal(
    env.VOICE.store.get(`usage-tile/${UID2}/${day}`) == null, true);
});

test("single flight: ten concurrent requests share one vendor call", async () => {
  const env = makeEnv();
  let calls = 0;
  env.TILE_SYNTH = async () => {
    calls++;
    await sleep(30); // hold the mint open so all ten overlap
    return te("AUDIO:slow");
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => good(env, { text: "slowword" })));
  for (const r of results) assert.equal(r.status, 200);
  assert.equal(calls, 1);
  assert.equal(env.__db.prepare("SELECT * FROM tile_clip").all().length, 1);
  // Only the originator was billed — waiters shared the mint for free.
  const day = new Date().toISOString().slice(0, 10);
  const usage = JSON.parse(env.VOICE.store.get(`usage-tile/${UID}/${day}`));
  assert.equal(usage.chars, 1);
});

/* -------------------------------- WT 4 -------------------------------- */

test("held: bad locale, non-Latin text, and audio-tag injection never mint", async () => {
  const env = makeEnv();
  let calls = 0;
  env.TILE_SYNTH = async () => { calls++; return new Uint8Array([1]); };

  const r1 = await good(env, { locale: "es" });
  assert.equal(r1.status, 422);
  assert.equal((await r1.json()).held, "locale");

  const r2 = await good(env, { text: "你好" });
  assert.equal(r2.status, 422);
  assert.equal((await r2.json()).held, "chars");

  const r3 = await good(env, { text: "[whispers] hi" });
  assert.equal(r3.status, 422);
  assert.equal((await r3.json()).held, "chars");

  assert.equal(calls, 0);
  assert.equal(env.__db.prepare("SELECT * FROM tile_clip").all().length, 0);
  const held = env.__db.prepare("SELECT * FROM tile_held ORDER BY reason").all();
  assert.equal(held.length, 3);
  assert.deepEqual(held.map((h) => h.reason).sort(), ["chars", "chars", "locale"]);
});

/* -------------------------------- WT 5 -------------------------------- */

test("no identity: ledger columns, rows, R2 keys, and synth args are anonymous", async () => {
  const env = makeEnv();
  const seen = [];
  env.TILE_SYNTH = async (text, { voice }) => {
    seen.push({ text, keys: Object.keys(voice) });
    return new Uint8Array([1]);
  };
  await good(env, { text: "zebra" });
  await good(env, { locale: "es", text: "gato" }); // held row

  const cols = [
    ...env.__db.prepare("PRAGMA table_info(tile_clip)").all(),
    ...env.__db.prepare("PRAGMA table_info(tile_held)").all(),
    ...env.__db.prepare("PRAGMA table_info(tile_day)").all(),
  ].map((c) => c.name);
  for (const c of cols) {
    assert.equal(/user|device|license|uid|acct/i.test(c), false, `column ${c}`);
  }
  const rows = [
    ...env.__db.prepare("SELECT * FROM tile_clip").all(),
    ...env.__db.prepare("SELECT * FROM tile_held").all(),
  ];
  for (const r of rows) {
    const s = JSON.stringify(r);
    assert.equal(s.includes(UID), false);
    assert.equal(/pip-life-/.test(s), false);
  }
  for (const key of env.VOICE.store.keys()) {
    if (!key.startsWith("tile/")) continue;
    assert.equal(key.includes(UID), false);
    assert.equal(/pip-life-/.test(key), false);
  }
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].keys.sort(),
    ["display_name", "locales", "model", "provider", "status", "voice_id", "voice_key", "voice_settings"].sort());
});

/* ------------------------- validation + voices ------------------------ */

test("gates: bad ids, bad license, bad voice (Zoe is planned), bad text", async () => {
  const env = makeEnv();
  const license = await licenseFor(SECRET, UID);
  const r1 = await tile(env, { user_id: UID, license: "pip-life-nope", text: "x" });
  assert.equal(r1.status, 403);
  const r2 = await tile(env, { user_id: "nope", license, text: "x" });
  assert.equal(r2.status, 400);
  const r3 = await good(env, { voice: "voi_zoe_en" }); // planned — not selectable
  assert.equal(r3.status, 400);
  assert.equal((await r3.json()).error, "bad_voice");
  const r4 = await good(env, { voice: "voi_nobody" });
  assert.equal(r4.status, 400);
  const r5 = await good(env, { text: "a".repeat(61) });
  assert.equal(r5.status, 400);
  const r6 = await good(env, { source: "seed" }); // admin/tooling only
  assert.equal(r6.status, 400);
  assert.equal((await r6.json()).error, "bad_source");
});

test("tile_voices.json agrees with voices.json tiles (one truth)", () => {
  const eve = tileVoices.voices.find((v) => v.voice_key === "voi_default_en");
  assert.equal(eve.voice_id, catalogVoices.tiles.voice_id);
  assert.equal(eve.model, catalogVoices.tiles.model);
  assert.equal(eve.voice_settings.stability, catalogVoices.tiles.voice_settings.stability);
  assert.equal(eve.voice_settings.similarity_boost,
    catalogVoices.tiles.voice_settings.similarity_boost);
  assert.equal(eve.status, "active");
  const leo = tileVoices.voices.find((v) => v.voice_key === "voi_leo_en");
  assert.equal(leo.status, "active"); // slice 6: seeded + published
});

/* -------------------------------- WT 7 -------------------------------- */

test("per-license day cap: the 101st mint 429s; hits stay free", async () => {
  const env = makeEnv();
  const day = new Date().toISOString().slice(0, 10);
  await env.VOICE.put(`usage-tile/${UID}/${day}`,
    JSON.stringify({ chars: 100, reqs: 100 }));
  const r = await good(env, { text: "one-too-many" });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).over, "day");

  // A cache hit at the cap still plays — hits are never counted.
  const env2 = makeEnv();
  env2.TILE_SYNTH = async () => new Uint8Array([7]);
  const mint = await good(env2, { text: "cached-word" });
  assert.equal(mint.headers.get("x-tile-cache"), "mint");
  await env2.VOICE.put(`usage-tile/${UID}/${day}`,
    JSON.stringify({ chars: 100, reqs: 100 }));
  const hit = await good(env2, { text: "cached-word" });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get("x-tile-cache"), "hit");
  const counter = JSON.parse(env2.VOICE.store.get(`usage-tile/${UID}/${day}`));
  assert.equal(counter.chars, 100); // the hit added nothing
});

test("per-license minute cap: the 21st mint in a minute 429s", async () => {
  const env = makeEnv();
  const minute = Math.floor(Date.now() / 60000);
  await env.VOICE.put(`usage-tile-min/${UID}/${minute}`,
    JSON.stringify({ reqs: 20 }));
  const r = await good(env, { text: "burst" });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).over, "minute");
  const hits = [...env.VOICE.store.keys()]
    .filter((k) => k.startsWith(`usage-tile-hits/${UID}/`));
  assert.equal(hits.length, 1);
});

test("global budget: at TILE_DAY_MINTS the next mint is 503, no vendor call, marker once", async () => {
  const env = makeEnv();
  env.TILE_DAY_MINTS = "3";
  let calls = 0;
  env.TILE_SYNTH = async () => { calls++; return new Uint8Array([1]); };

  assert.equal((await good(env, { text: "aa" })).status, 200);
  assert.equal((await good(env, { text: "bb" })).status, 200);
  assert.equal((await good(env, { text: "cc" })).status, 200); // crosses 80% of 3
  const r = await good(env, { text: "dd" });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "budget");
  assert.equal(calls, 3);

  const alerts = [...env.VOICE.store.keys()].filter((k) => k.startsWith("tile-alert/"));
  assert.equal(alerts.length, 1); // written once per day
});

/* -------------------------------- WT 8 -------------------------------- */

test("failure isolation: synth error → 502, failed row, retry_after gate", async () => {
  let now = 1_700_000_000_000;
  const env = makeEnv();
  env.TILE_NOW = () => now;
  let calls = 0;
  env.TILE_SYNTH = async () => { calls++; throw new Error("vendor_down"); };

  const r1 = await good(env, { text: "fragile" });
  assert.equal(r1.status, 502);
  const row = env.__db.prepare("SELECT * FROM tile_clip").all()[0];
  assert.equal(row.status, "failed");
  assert.equal(row.retry_after, now + 30_000);
  for (const key of env.VOICE.store.keys()) {
    assert.equal(key.startsWith("tile/voi_default_en/"), false); // no audio written
  }

  // Retry inside retry_after: 502 without a vendor call.
  const r2 = await good(env, { text: "fragile" });
  assert.equal(r2.status, 502);
  assert.equal(calls, 1);

  // After retry_after the next request re-claims and mints.
  now += 31_000;
  env.TILE_SYNTH = async () => { calls++; return new Uint8Array([9]); };
  const r3 = await good(env, { text: "fragile" });
  assert.equal(r3.status, 200);
  assert.equal(calls, 2);
  assert.equal(
    env.__db.prepare("SELECT status FROM tile_clip").all()[0].status, "ready");
});

/* --------------------------- admin plumbing --------------------------- */

test("admin routes: 401 without the token; recent/review/held/audio work", async () => {
  const env = makeEnv();
  const noAuth = await worker.fetch(new Request(
    "https://x/admin/v1/tile-voice/recent"), env);
  assert.equal(noAuth.status, 401);

  let now = 1_700_000_000_000;
  env.TILE_NOW = () => now;
  env.TILE_SYNTH = async (t) => te(`AUDIO:${t}`);
  await good(env, { text: "apple", source: "user_typed" });
  now += 1;
  await good(env, { text: "banana", source: "user_keyboard" });
  now += 1;
  await good(env, { locale: "es", text: "gato" }); // held

  const recent = await (await admin(env, "/admin/v1/tile-voice/recent")).json();
  assert.equal(recent.rows.length, 2);
  assert.equal(recent.rows[0].text, "banana"); // newest first
  const typedOnly = await (await admin(
    env, "/admin/v1/tile-voice/recent?source=user_keyboard")).json();
  assert.equal(typedOnly.rows.length, 1);
  assert.equal(typedOnly.rows[0].source, "user_keyboard");

  const held = await (await admin(env, "/admin/v1/tile-voice/held")).json();
  assert.equal(held.rows.length, 1);
  assert.equal(held.rows[0].reason, "locale");

  const id = recent.rows[0].id;
  const audio = await admin(env, `/admin/v1/tile-voice/audio/${id}`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");

  const rej = await admin(env, "/admin/v1/tile-voice/review", {
    method: "POST", body: JSON.stringify({ ids: [id], review: "rejected" }),
  });
  assert.equal(rej.status, 200);
  const row = env.__db.prepare("SELECT * FROM tile_clip WHERE id = ?").all(id)[0];
  assert.equal(row.review, "rejected");
  assert.equal(row.status, "withheld");

  // withheld clips stop serving: 409
  const blocked = await good(env, { text: "banana" });
  assert.equal(blocked.status, 409);

  // remint (plain) → version 2, ready again
  const remint = await admin(env, "/admin/v1/tile-voice/remint", {
    method: "POST", body: JSON.stringify({ id, mode: "plain" }),
  });
  assert.equal(remint.status, 200);
  const { version } = await remint.json();
  assert.equal(version, 2);
  const after = env.__db.prepare("SELECT * FROM tile_clip WHERE id = ?").all(id)[0];
  assert.equal(after.status, "ready");
  assert.equal(after.review, "unreviewed");
  assert.match(after.r2_key, /\.v2\.mp3$/);

  // WT9 ledger side: /usage counts every synth event — the two mints
  // plus the remint (a remint spends vendor chars again). Hits add
  // zero; the held word and a repeat request never mint.
  await good(env, { text: "banana", source: "user_keyboard" }); // a hit
  const usage = await (await admin(
    env, "/admin/v1/tile-voice/usage?from=0&to=99999999999999")).json();
  assert.equal(usage.mints, 3); // apple + banana + banana remint
  assert.equal(usage.chars,
    "apple".length + "banana".length + "banana".length);
  now += 1;
  const window = await (await admin(
    env, `/admin/v1/tile-voice/usage?from=${now}`)).json();
  assert.equal(window.mints, 0); // nothing minted after `now`

  // Slice 7 free half — seed registers an existing R2 object as a ready
  // row: a typed request for its text then hits, no mint, no vendor call.
  const seed = await admin(env, "/admin/v1/tile-voice/seed", {
    method: "POST",
    body: JSON.stringify({ rows: [
      { voice_key: "voi_default_en", locale: "en", text: "Giraffe",
        r2_key: "audio/giraffe/abc.mp3" },
      { voice_key: "voi_default_en", locale: "en", text: "",
        r2_key: "audio/x/y.mp3" }, // bad row — skipped
    ] }),
  });
  assert.deepEqual(await seed.json(), { inserted: 1, skipped: 1 });
  env.VOICE.put("audio/giraffe/abc.mp3", te("CATALOG"));
  const hit = await good(env, { text: "  giraffe ", source: "user_typed" });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get("x-tile-cache"), "hit"); // served, not minted
  const seeded = env.__db.prepare(
    "SELECT * FROM tile_clip WHERE text = 'giraffe'").all()[0];
  assert.equal(seeded.source, "seed");
  assert.equal(seeded.review, "approved");
  assert.equal(seeded.r2_key, "audio/giraffe/abc.mp3");
  // A second seed of the same text is a no-op — existing rows win.
  const again = await admin(env, "/admin/v1/tile-voice/seed", {
    method: "POST",
    body: JSON.stringify({ rows: [
      { voice_key: "voi_default_en", locale: "en", text: "giraffe",
        r2_key: "audio/other.mp3" }] }),
  });
  assert.deepEqual(await again.json(), { inserted: 0, skipped: 1 });

  // Seeded row whose R2 object is gone: demote + re-mint, never loop
  // (claimMint refuses 'ready', so a rerun without the demote hangs).
  await admin(env, "/admin/v1/tile-voice/seed", {
    method: "POST",
    body: JSON.stringify({ rows: [
      { voice_key: "voi_default_en", locale: "en", text: "platypus",
        r2_key: "audio/platypus/missing.mp3" }] }),
  });
  let remints = 0;
  env.TILE_SYNTH = async (t) => { remints++; return te(`AUDIO:${t}`); };
  const reminted = await good(env, { text: "platypus" });
  assert.equal(reminted.status, 200);
  assert.equal(reminted.headers.get("x-tile-cache"), "mint");
  assert.equal(remints, 1);
  const platypus = env.__db.prepare(
    "SELECT * FROM tile_clip WHERE text = 'platypus'").all()[0];
  assert.equal(platypus.status, "ready");
  assert.match(platypus.r2_key, /^tile\//); // now lives in the tile namespace

  // replaced sweep: the withheld/replaced clip's text hash is listed
  const lic = await licenseFor(SECRET, UID);
  const sweep = await worker.fetch(new Request(
    `https://x/api/v1/voice/tile/replaced?since=0&voice=voi_default_en`, {
      headers: { "x-pip-user": UID, "x-pip-license": lic },
    }), env);
  assert.equal(sweep.status, 200);
  const { ids } = await sweep.json();
  assert.equal(ids.length, 1);
});
