/**
 * 044 D4 - the sentence buttons and the cloud voice, in the BUILT core
 * (apps/PipAAC/PipAAC/Core/pip-core.js) inside a bare vm realm, with a fake
 * host exactly as the Swift host would supply it: a fake Worker behind
 * __pipHost "fetch", Cache Storage as an in-memory file table behind
 * "cache", timers on a compressed clock, the keystore, the db.
 *
 * The instruments are the fake Worker's request log and the "say" events
 * the host receives: assertions read what was SENT (masked text, body
 * shape) and what Swift would PLAY (file paths in the cache table), never
 * the facade's own return values. No paid API is reachable from here.
 *
 * Run: scripts/test.sh scripts/ios/app_say.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-say-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);
const db = new DatabaseSync(file);
const bind = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const SCALE = 0.1; // compressed clock: 15 s -> 1.5 s, 10 s -> 1 s, 900 ms -> 90 ms
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 6000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};
const b64 = (buf) => Buffer.from(buf).toString("base64");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64url"));

/* ---------------- the fake Worker ---------------- */

const USER = "11111111-2222-4333-8444-555555555555";
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
const worker = {
  log: [],                    // { path, method, headers, body }
  transform: (body) => ({ json: { text: `${body.text}.` } }), // overridden per test
  transformDelayMs: 0,
  transformNever: false,
  speak: () => ({ bytes: MP3 }),
  tile: () => ({ bytes: MP3 }),
  trialEndsAt: Date.now() + 5 * 86_400_000,
  reset() {
    this.log = [];
    this.transform = (body) => ({ json: { text: `${body.text}.` } });
    this.transformDelayMs = 0;
    this.transformNever = false;
    this.speak = () => ({ bytes: MP3 });
    this.tile = () => ({ bytes: MP3 });
  },
  of(path) { return this.log.filter((r) => r.path === path); },
};
const NEVER = Symbol("never");
async function workerHandle({ url, method, headers, body }) {
  const u = new URL(url);
  const text = body ? Buffer.from(body, "base64").toString("utf8") : "";
  const json = text ? JSON.parse(text) : null;
  worker.log.push({ path: u.pathname, method, headers, body: json, raw: text });
  const reply = (r) => r.bytes
    ? { status: r.status ?? 200, headers: [["content-type", "audio/mpeg"]], body: b64u(r.bytes) }
    : { status: r.status ?? 200, headers: [["content-type", "application/json"]],
      body: b64u(Buffer.from(JSON.stringify(r.json ?? {}))) };
  switch (u.pathname) {
    case "/api/v1/trial/start": return reply({ json: { endsAt: worker.trialEndsAt } });
    case "/api/v1/trial": return reply({ json: { licensed: false, endsAt: worker.trialEndsAt } });
    case "/api/v1/transform": {
      if (worker.transformNever) return NEVER;
      if (worker.transformDelayMs) await sleep(worker.transformDelayMs);
      return reply(worker.transform(json));
    }
    case "/api/v1/voice/speak": return reply(worker.speak(json));
    case "/api/v1/voice/tile": return reply(worker.tile(json));
    case "/api/v1/voice/tile/replaced": return reply({ json: { ids: [], next: 1 } });
    default: return { status: 404, headers: [], body: "" };
  }
}

/* ---------------- the fake host (what Swift supplies) ---------------- */

const caches = new Map();     // `${cache}\n${url}` -> { type, body(b64), file }
const keystore = new Map();
const says = [];              // every "say" event, parsed
const cancelled = new Set();
const timers = new Map();
let online = true;
let ctx;
const deliver = (fn) => setImmediate(fn);
const ops = {
  sha256: async ({ b64: x }) => b64u(await crypto.subtle.digest("SHA-256", unb64(x))),
  "keystore.get": async ({ name }) => {
    const v = keystore.get(name);
    return v === undefined ? null : { k: "json", text: v };
  },
  "keystore.put": async ({ name, text }) => { keystore.set(name, text); },
  "keystore.del": async ({ name }) => { keystore.delete(name); },
  cache: async (a) => {
    const key = `${a.cache}\n${a.url}`;
    if (a.op === "get") return caches.get(key) ?? null;
    if (a.op === "put") {
      const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a.url))).toString("hex");
      const entry = { type: a.type, body: a.body, file: `${dir}/cache/${a.cache}/${hash}.mp3` };
      caches.set(key, entry);
      return { file: entry.file };
    }
    if (a.op === "delete") return caches.delete(key);
    return [...caches.keys()].filter((k) => k.startsWith(`${a.cache}\n`)).map((k) => k.split("\n")[1]);
  },
  fetch: async (req) => {
    if (!online) throw new Error("fetch failed: offline");
    const r = await workerHandle(req);
    if (r === NEVER) return NEVER;
    return { statusText: "", ...r };
  },
};
const host = {
  baseURL: "https://worker.test",
  log: () => {},
  randomUUID: () => crypto.randomUUID(),
  randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
  dbExec: (_i, sql) => { db.exec(sql); return null; },
  dbRun: (_i, sql, p = []) => ({ changes: Number(db.prepare(sql).run(...p.map(bind)).changes) }),
  dbAll: (_i, sql, p = []) => {
    const rows = db.prepare(sql).all(...p.map(bind));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
  call(op, id, argsJson) {
    Promise.resolve().then(() => {
      if (!ops[op]) throw new Error(`fake host: no op ${op}`);
      return ops[op](JSON.parse(argsJson));
    }).then((v) => v, (e) => e).then((out) => {
      if (out === NEVER) return;
      deliver(() => {
        if (cancelled.has(id)) return;
        if (out instanceof Error) ctx.__pipSettle(id, false, out.message);
        else ctx.__pipSettle(id, true, out === undefined ? "" : JSON.stringify(out));
      });
    });
  },
  cancel: (id) => { cancelled.add(id); },
  timerStart: (tid, ms) => {
    timers.set(tid, setTimeout(() => { timers.delete(tid); deliver(() => ctx.__pipFire(tid)); }, Math.ceil(ms * SCALE)));
  },
  timerCancel: (tid) => { clearTimeout(timers.get(tid)); timers.delete(tid); },
  wsOpen() {}, wsSend() {}, wsClose() {},
  emit: (name, json) => { if (name === "say") says.push(JSON.parse(json)); },
};
ctx = vm.createContext({ __pipHost: host, crypto: globalThis.crypto });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const j = (v) => JSON.parse(JSON.stringify(v));
const P = ctx.PIPCORE;
const app = new Proxy({}, { get: (_, k) => (...a) => j(P.app[k](...a)) });
const say = new Proxy({}, { get: (_, k) => (...a) => j(P.say[k](...a)) });
const { appId } = app.appOpen(1, readFileSync(join(root, "public/catalog.json"), "utf8"), null, null);

const barText = () => app.appBar(appId).map((c) => c.display).join(" ");
const tapWord = (id, text) => app.appTap(appId, { kind: "sense", id, text, source: "grid" });
const fresh = async () => {
  await sleep(150); // let the previous press finish (busy clears after its speak)
  app.appClear(appId);
  worker.reset();
  says.length = 0;
  online = true;
};
const typedTap = (word) => {
  app.appKbOpen(appId);
  for (const ch of word) app.appKbPress(appId, ch);
  app.appKbPress(appId, " ");
};
const playedFiles = (ev) => (ev.play ?? []).filter((s) => s.type === "file").map((s) => s.key);

// Entities for masking; the person is identified like the app does at open.
P.groups.createEntity(P.makeDb(1), { id: "ent_leo", name: "Leo" });
say.identify(appId, USER);
await until(() => worker.of("/api/v1/trial").length > 0, "trial mirrored");
await sleep(30);

test("boot: the trial clock starts and is mirrored, the web's request shapes", async () => {
  const start = worker.of("/api/v1/trial/start")[0];
  assert.equal(start.method, "POST");
  assert.deepEqual(start.body, { user_id: USER });
  const read = worker.of("/api/v1/trial")[0];
  assert.equal(read.method, "GET");
  assert.equal(read.headers["x-pip-user"], USER);
  assert.equal(read.headers["x-pip-license"], "");
  // A trialing user (no license) sweeps replaced clips too (fixed in
  // voice_tile.sweepReplaced): user id + an empty license header.
  const sweeps = worker.of("/api/v1/voice/tile/replaced");
  assert.equal(sweeps.length, 1);
  assert.equal(sweeps[0].headers["x-pip-user"], USER);
  assert.equal(sweeps[0].headers["x-pip-license"], "");
});

test("fix it: names are masked on the wire, restored on the bar, and the cloud clip is what plays", async () => {
  await fresh();
  app.appTap(appId, { kind: "entity", id: "ent_leo", text: "Leo", source: "grid" });
  tapWord("sns_0013", "want");
  const taps = barText();
  worker.transform = (b) => ({ json: { text: b.text.replace("want", "wants") + "." } });
  say.transform(appId, "fix");
  await until(() => says.some((e) => playedFiles(e).length), "the cloud clip plays");

  const t = worker.of("/api/v1/transform")[0];
  assert.equal(t.method, "POST");
  assert.equal(t.headers["content-type"], "application/json");
  // The exact web body: key order and keys (no license key when none is stored).
  assert.deepEqual(Object.keys(t.body), ["user_id", "mode", "text", "tense", "question"]);
  assert.equal(t.body.user_id, USER);
  assert.equal(t.body.mode, "fix");
  assert.equal(t.body.tense, "present");
  assert.equal(t.body.question, false);
  assert.ok(/^PERSON1 /.test(t.body.text), `masked: ${t.body.text}`);
  assert.ok(!/Leo/.test(t.raw), "the family name never leaves the device");
  assert.equal(taps.split(" ")[0], "Leo");

  // The bar holds the unmasked fixed sentence as typed words.
  assert.equal(barText(), "Leo wants.");
  assert.equal(app.appBar(appId).every((c) => c.kind === "typed"), true);

  // The speak request is the web's: user_id, voice, text, feeling.
  const sp = worker.of("/api/v1/voice/speak");
  assert.equal(sp.length, 1);
  assert.deepEqual(Object.keys(sp[0].body), ["user_id", "voice", "text", "feeling"]);
  assert.equal(sp[0].body.text, "Leo wants.");
  assert.equal(sp[0].body.feeling, "neutral");
  assert.equal(sp[0].body.voice, "voi_default_en");

  // What plays is the file the cache holds for that very sentence.
  const ev = says.find((e) => playedFiles(e).length);
  const entry = [...caches.entries()].find(([k]) => k.startsWith("pip-voice\n"))[1];
  assert.deepEqual(playedFiles(ev), [entry.file]);
  assert.deepEqual(unb64(entry.body), MP3);
});

test("play: a repeat is the local cache - no second request - and past restores her taps first", async () => {
  const base = { speak: worker.of("/api/v1/voice/speak").length, tr: worker.of("/api/v1/transform").length };
  say.speak(appId);
  await until(() => says.filter((e) => playedFiles(e).length).length >= 2, "second play");
  assert.equal(worker.of("/api/v1/voice/speak").length, base.speak, "cached after the first");
  // The bar is still the fixed sentence (present tense: nothing to restore).
  assert.equal(barText(), "Leo wants.");
  worker.transform = (b) => ({ json: { text: "Leo wanted." } });
  const nSays = says.length;
  say.transform(appId, "past");
  await until(() => worker.of("/api/v1/transform").length === base.tr + 1 && barText() === "Leo wanted.", "past landed");
  const t = worker.of("/api/v1/transform")[base.tr];
  assert.equal(t.body.mode, "past");
  assert.ok(/^PERSON1 want/.test(t.body.text) && !/wants/.test(t.body.text),
    `reads her saved taps, not the last output: ${t.body.text}`);
  await until(() => worker.of("/api/v1/voice/speak").length === base.speak + 1, "sentence voice for the new text");
  assert.equal(worker.of("/api/v1/voice/speak")[base.speak].body.text, "Leo wanted.");
  await until(() => says.length > nSays, "the press finished (and freed the bar)");
  say.speak(appId); // ▶ on a past bar puts her exact taps back first
  assert.equal(barText(), "Leo want");
  await until(() => worker.of("/api/v1/voice/speak").length === base.speak + 2, "taps spoken");
  assert.equal(worker.of("/api/v1/voice/speak")[base.speak + 1].body.text, "Leo want.");
});

test("a late reply after the bar changed is discarded; the CURRENT bar is spoken, never the stale reply", async () => {
  await fresh();
  tapWord("sns_0013", "want");
  tapWord("sns_0128", "apple");
  worker.transformDelayMs = 300;
  worker.transform = () => ({ json: { text: "Went to the park." } });
  say.transform(appId, "past");
  await until(() => worker.of("/api/v1/transform").length === 1, "request in flight");
  tapWord("sns_0013", "want"); // the child keeps going
  const after = barText();
  await until(() => says.some((e) => playedFiles(e).length), "current bar spoken", 3000);
  await sleep(100);
  assert.equal(barText(), after, "bar unchanged by the late reply");
  assert.equal(app.appBar(appId).some((c) => c.kind === "typed"), false);
  const spoken = worker.of("/api/v1/voice/speak");
  assert.ok(spoken.length >= 1);
  assert.equal(spoken.at(-1).body.text, `${after.toLowerCase()}.`, "the current bar, not the reply");
  assert.ok(spoken.every((r) => !/park/i.test(r.body.text)), "the late reply never reaches the voice");
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${after.toLowerCase()}.`))).toString("hex");
  const entry = caches.get(`pip-voice\nhttps://voice.local/voi_default_en/neutral/${hash}`);
  assert.ok(entry, "the clip for the current bar is in the cache");
  assert.equal(says.flatMap(playedFiles).at(-1), entry.file, "and is what plays");
});

test("offline: the press speaks the bar as built, word by word, and says why", async () => {
  await fresh();
  online = false;
  tapWord("sns_0013", "want");
  tapWord("sns_0128", "apple");
  say.transform(appId, "fix");
  await until(() => says.length > 0, "offline outcome");
  const ev = says.at(-1);
  assert.equal(ev.toast, "Fix it needs the internet — spoke it as it was.");
  assert.equal(barText(), "Want apple");
  assert.deepEqual((ev.play ?? []).map((s) => s.type), ["clip", "clip"]);
  assert.ok(ev.play.every((s) => /^audio\//.test(s.key)), "shipped word clips");
});

test("a stalled transform is abandoned at the deadline; its late reply never lands", async () => {
  await fresh();
  tapWord("sns_0013", "want");
  tapWord("sns_0128", "apple");
  worker.transformNever = true;
  say.transform(appId, "question");
  await until(() => says.some((e) => e.toast), "deadline toast", 4000);
  const ev = says.find((e) => e.toast);
  assert.equal(ev.toast, "Ask it took too long — spoke it as it was.");
  assert.equal(barText(), "Want apple");
  assert.ok(cancelled.size > 0, "the in-flight request was cancelled in the host");
  // The press is free again.
  worker.transformNever = false;
  worker.transform = () => ({ json: { text: "Want an apple?" } });
  say.transform(appId, "question");
  await until(() => barText() === "Want an apple?", "next press works");
});

test("not entitled: the bar is spoken as built, the ask shows once per session", async () => {
  await fresh();
  tapWord("sns_0013", "want");
  tapWord("sns_0128", "apple");
  worker.transform = () => ({ status: 403, json: { error: "bad_license" } });
  say.transform(appId, "fix");
  await until(() => says.some((e) => e.play), "spoken as built");
  assert.equal(says.find((e) => e.toast).toast, "Fix it comes with Pip Lifetime — the free trial has ended.");
  assert.equal(barText(), "Want apple");
  says.length = 0;
  say.transform(appId, "fix");
  await until(() => says.some((e) => e.play), "spoken again");
  assert.equal(says.some((e) => e.toast), false, "once per session");
});

test("a typed word is minted on commit (supporter action) and its clip plays on a tap", async () => {
  await fresh();
  typedTap("zorp");
  await until(() => worker.of("/api/v1/voice/tile").length > 0, "mint request");
  const m = worker.of("/api/v1/voice/tile")[0];
  assert.deepEqual(Object.keys(m.body), ["user_id", "voice", "locale", "text", "source"]);
  assert.equal(m.body.text, "zorp");
  assert.equal(m.body.source, "user_keyboard");
  assert.equal(m.body.voice, "voi_default_en");
  await until(() => [...caches.keys()].some((k) => k.startsWith("pip-tile-voice\n")), "clip cached");
  // Playing the bar: one word -> the tile clip, from the cache file.
  says.length = 0;
  say.speak(appId);
  await until(() => says.some((e) => e.play), "spoken");
  const zorp = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("zorp"))).toString("hex");
  const entry = caches.get(`pip-tile-voice\nhttps://voice.local/tile/voi_default_en/${zorp}`);
  assert.ok(entry, "cached under the ledger's own key");
  assert.deepEqual(playedFiles(says.find((e) => e.play)), [entry.file]);
});

test("a tile tap that was overtaken by a newer tap is not played", async () => {
  await fresh();
  caches.clear();
  worker.tile = () => ({ bytes: MP3 });
  const slow = worker.tile;
  worker.tile = (b) => slow(b);
  // keyboard commit speaks via tapSpeech (tileclip -> deferred)
  app.appKbOpen(appId);
  for (const ch of "blip") app.appKbPress(appId, ch);
  const first = app.appKbPress(appId, " ");
  assert.equal(first.speech, null, "a tile word never plays inline");
  const second = tapWord("sns_0013", "want"); // newer tap owns the audio
  assert.equal(second.speech.type, "clip");
  await sleep(300);
  assert.deepEqual(says.flatMap(playedFiles), [], "the older tile clip stays silent");
});

test("PU-2 trial nudges: the web's words, once per mark, last two days and expiry only", async () => {
  const web = readFileSync(join(root, "public/board/speech.js"), "utf8");
  const DAY = 86_400_000, now = 1_700_000_000_000;
  const n = (days, marks = [], licensed = false) => say.nudgeFor(now + days * DAY - 1000, now, marks, licensed);
  assert.equal(n(5), null);
  assert.equal(n(4), null);
  for (const [days, tag] of [[3, "d5"], [2, "d6"], [-1, "expired"]]) {
    const r = n(days);
    assert.equal(r.tag, tag);
    assert.ok(web.includes(r.msg), `copy is the web's: ${r.msg}`);
    assert.equal(n(days, [tag]), null, "never twice");
  }
  assert.equal(n(0.5), null, "one day left has no nudge");
  assert.equal(n(3, [], true), null, "licensed: none");
  assert.equal(say.nudgeFor(null, now), null);

  // At boot: shown once, then remembered across boots.
  await fresh();
  worker.trialEndsAt = Date.now() + 2.5 * DAY;
  say.identify(appId, USER);
  await until(() => says.some((e) => e.toast), "the d5 nudge");
  assert.equal(says.find((e) => e.toast).toast, "Free trial · 3 days left — Pip Lifetime keeps it all: $49 once.");
  const count = () => says.filter((e) => e.toast).length;
  say.identify(appId, USER);
  await sleep(200);
  assert.equal(count(), 1, "the second boot stays quiet");
  worker.trialEndsAt = Date.now() + 5 * DAY;
});
