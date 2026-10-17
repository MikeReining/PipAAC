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
  trialLicensed: false,
  trialDown: false,
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
    case "/api/v1/trial":
      if (worker.trialDown) return reply({ status: 503, json: { error: "down" } });
      return reply({ json: { licensed: worker.trialLicensed, endsAt: worker.trialEndsAt } });
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
const faces = new Proxy({}, { get: (_, k) => (...a) => j(P.faces[k](...a)) });
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

/* ---------------- 044 F: PU-1 / SN-9 - the trial clock and the gate ----------------
 * The Worker's rule (src/worker/transform.js checkLicense / trialEntitled):
 * a license, or the trial still running; else 403 bad_license. The client
 * never pre-gates a sentence button (public/board/speech.js
 * transformAndSpeak has no entitledNow check) - it sends, and the
 * Worker's answer decides. entitledNow gates only the feeling faces. */
const DAY2 = 86_400_000;
const LICENSE = "lic_test_license";
const entitledWorker = () => {
  worker.transform = (b) => (b.license || worker.trialEndsAt > Date.now()
    ? { json: { text: `${b.text}.` } }
    : { status: 403, json: { error: "bad_license" } });
};
const catalogJson = readFileSync(join(root, "public/catalog.json"), "utf8");
/** A brand-new session (own askShown / trial mirror) for the same person. */
const newSession = async ({ ends, licensed = false, license = null, down = false } = {}) => {
  worker.reset();
  worker.trialEndsAt = ends;
  worker.trialLicensed = licensed;
  worker.trialDown = down;
  entitledWorker();
  if (license) keystore.set(`user/${USER}/license`, JSON.stringify(license));
  else keystore.delete(`user/${USER}/license`);
  keystore.delete(`user/${USER}/trial-nudge`);
  keystore.delete(`user/${USER}/trial-ok`);
  keystore.delete(`user/${USER}/voice-wanted`);
  caches.clear(); // every case starts with no cloud clip cached
  says.length = 0;
  online = true;
  const { appId: id } = app.appOpen(1, catalogJson, null, null);
  say.identify(id, USER);
  await until(() => worker.of("/api/v1/trial").length > 0, "trial read");
  await sleep(80);
  says.length = 0; // the boot nudge is PU-2's test, not this one's
  app.appClear(id);
  app.appTap(id, { kind: "sense", id: "sns_0013", text: "want", source: "grid" });
  app.appTap(id, { kind: "sense", id: "sns_0128", text: "apple", source: "grid" });
  return { id };
};
const barOf = (id) => app.appBar(id).map((c) => c.display).join(" ");

test("SN-9: trial running -> the buttons work, the natural voice speaks (no license sent)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  say.transform(id, "fix");
  await until(() => says.some((e) => playedFiles(e).length), "cloud clip");
  assert.equal(barOf(id), "Want apple.");
  assert.equal("license" in worker.of("/api/v1/transform")[0].body, false);
  assert.equal(worker.of("/api/v1/voice/speak").length, 1);
  assert.equal(says.some((e) => e.toast), false);
});

test("SN-9: trial over, no license -> sent anyway, the Worker refuses, the ask shows ONCE, the bar speaks as built", async () => {
  const { id } = await newSession({ ends: Date.now() - DAY2 });
  say.transform(id, "fix");
  await until(() => says.some((e) => e.play), "spoken as built");
  assert.equal(worker.of("/api/v1/transform").length, 1, "no client-side pre-gate: the press is sent");
  const ev = says.find((e) => e.toast);
  assert.equal(ev.toast, "Fix it comes with Pip Lifetime — the free trial has ended.");
  assert.equal(barOf(id), "Want apple", "nothing is replaced");
  assert.deepEqual(ev.play.map((s) => s.type), ["clip", "clip"], "the free way: word clips");
  assert.equal(worker.of("/api/v1/voice/speak").length, 0, "no natural-voice request without entitlement");
  // Another gated button: speaks again, no second ask.
  says.length = 0;
  say.transform(id, "past");
  await until(() => says.some((e) => e.play), "spoken again");
  assert.equal(says.some((e) => e.toast), false, "once per session");
  assert.equal(worker.of("/api/v1/transform").length, 2);
  // Play is never gated: it speaks her words, no ask, no voice request.
  says.length = 0;
  say.speak(id);
  await until(() => says.some((e) => e.play), "play speaks");
  assert.deepEqual(says.at(-1).play.map((s) => s.type), ["clip", "clip"]);
  assert.equal(says.some((e) => e.toast), false);
  assert.equal(worker.of("/api/v1/voice/speak").length, 0);
  // A word tile still speaks its clip.
  const tapped = app.appTap(id, { kind: "sense", id: "sns_0013", text: "want", source: "grid" });
  assert.ok(JSON.stringify(tapped).includes("audio/"), "the tapped word's own clip");
});

test("SN-9: a holding license -> not gated even after the trial; the license rides the request", async () => {
  const { id } = await newSession({ ends: Date.now() - DAY2, licensed: true, license: LICENSE });
  assert.equal(worker.of("/api/v1/trial/start").length, 0, "a licensed person never starts a trial");
  assert.equal(worker.of("/api/v1/trial")[0].headers["x-pip-license"], LICENSE);
  say.transform(id, "fix");
  await until(() => says.some((e) => playedFiles(e).length), "cloud clip");
  assert.equal(worker.of("/api/v1/transform")[0].body.license, LICENSE);
  assert.equal(barOf(id), "Want apple.");
  assert.equal(says.some((e) => e.toast), false);
  assert.equal(worker.of("/api/v1/voice/speak").length, 1);
});

test("SN-9: trial state unknown (clock unreadable) -> still no client gate, the Worker decides; speaks the free way; offline is the honest toast", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2, down: true });
  say.transform(id, "fix");
  await until(() => says.some((e) => e.play), "outcome");
  assert.equal(worker.of("/api/v1/transform").length, 1, "sent: the web never pre-gates on its mirror");
  assert.equal(barOf(id), "Want apple.", "the Worker's trial is running, so it answered");
  assert.equal(worker.of("/api/v1/voice/speak").length, 0, "mirror empty: the natural voice is not requested");
  online = false;
  app.appClear(id);
  app.appTap(id, { kind: "sense", id: "sns_0013", text: "want", source: "grid" });
  app.appTap(id, { kind: "sense", id: "sns_0128", text: "apple", source: "grid" });
  says.length = 0;
  say.transform(id, "question");
  await until(() => says.some((e) => e.toast), "offline toast");
  assert.equal(says.find((e) => e.toast).toast, "Ask it needs the internet — spoke it as it was.");
  online = true;
});

test("PU-1: an offline first run starts nothing; the online event starts and mirrors the clock, then nudges", async () => {
  worker.reset();
  worker.trialEndsAt = Date.now() + 2.5 * DAY2;
  worker.trialLicensed = false;
  worker.trialDown = false;
  for (const k of ["license", "trial-ok", "trial-nudge"]) keystore.delete(`user/${USER}/${k}`);
  says.length = 0;
  online = false;
  const { appId: id } = app.appOpen(1, catalogJson, null, null);
  say.identify(id, USER);
  await sleep(150);
  assert.equal(worker.log.length, 0, "offline: no request reaches the Worker");
  online = true;
  ctx.__pipPlatformEvent("online");
  // (Earlier cases' sessions of the same person also hear the event.)
  await until(() => worker.of("/api/v1/trial/start").length >= 1, "start on reconnect");
  assert.deepEqual(worker.of("/api/v1/trial/start")[0].body, { user_id: USER });
  await until(() => says.some((e) => e.toast), "nudge on reconnect (mountTrialClock.boot)");
  assert.equal(says.find((e) => e.toast).toast, "Free trial · 3 days left — Pip Lifetime keeps it all: $49 once.");
  await sleep(150);
  const starts = worker.of("/api/v1/trial/start").length;
  const reads = worker.of("/api/v1/trial").length;
  say.identify(id, USER);
  await until(() => worker.of("/api/v1/trial").length > reads, "second read");
  assert.equal(worker.of("/api/v1/trial/start").length, starts, "start posts once per person");
});

test("PU-1: expiry reverts a chosen voice to Pip's own; the choice returns when entitled again", async () => {
  const { id } = await newSession({ ends: Date.now() - DAY2 });
  const voiceNow = () => j(P.voicepick.voiceModel(id)).current;
  app.appSetSetting(id, "preferred_voice_id", "voi_leo_en");
  assert.equal(voiceNow(), "voi_leo_en");
  say.trialRefresh(id); // Settings opened; the trial is over
  await until(() => voiceNow() === "voi_default_en", "reverted");
  worker.trialEndsAt = Date.now() + 3 * DAY2; // entitled again
  say.trialRefresh(id);
  await until(() => voiceNow() === "voi_leo_en", "restored");
});

/* ---------------- 044 BS-24 / SN-10: the feeling faces; the voice lock ----------------
 * Web: strip.js faceCard 137 -> speech.js speakFeeling 486 -> speakSentence
 * (feeling) 398 -> voice_sentence request { user_id, [license], voice, text,
 * feeling }; entitledNow 301 gates it; settings-sync.js "Try the faces" 107
 * -> board.js sampleVoice 1355; voice-ui.js 51 + board.js 1378 lock voices.
 * Instruments: the fake Worker's request log and the say events. */
const tapIds = (id, ...ids) => { for (const sid of ids) app.appTap(id, { kind: "sense", id: sid, text: "x", source: "grid" }); };
const feelingSays = (n0) => says.slice(n0).filter((e) => e.done === "face");

test("BS-24: the faces ride the strip's last slot from the first word; the lit one is the I + feeling suggestion", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  app.appClear(id);
  assert.equal(app.appStrip(id).faces, null, "an empty bar shows no faces");
  tapIds(id, "sns_0013"); // want
  let st = app.appStrip(id);
  assert.deepEqual(st.faces, { lit: null, feelings: ["happy", "sad", "angry"] });
  const cap = st.cap;
  assert.ok(st.cards.length <= cap);
  app.appClear(id);
  tapIds(id, "sns_0001", "sns_0061"); // I + happy
  assert.equal(app.appStrip(id).faces.lit, "happy");
  app.appClear(id);
  tapIds(id, "sns_0001", "sns_0179"); // I + sad
  assert.equal(app.appStrip(id).faces.lit, "sad");
  app.appClear(id);
  tapIds(id, "sns_0061"); // happy alone doesn't light
  assert.equal(app.appStrip(id).faces.lit, null);
  // Off is instant: the slot returns to word suggestions (setting stored as the web does).
  app.appSetSetting(id, "expressive_voice", 0);
  assert.equal(app.appStrip(id).faces, null);
  app.appSetSetting(id, "expressive_voice", 1);
  assert.notEqual(app.appStrip(id).faces, null);
  // Mid-word the strip is spelling completions - no faces (facesOn: !kbUi.text).
  app.appKbOpen(id);
  app.appKbPress(id, "z");
  assert.equal(app.appStrip(id).faces, null);
});

test("BS-24 Edit mode and the tour: faces hide and release their slot in the core (strip.js facesOn: !editing, !tour)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  app.appClear(id);
  tapIds(id, "sns_0013");
  assert.notEqual(app.appStrip(id).faces, null);
  P.edit.editOpen(id);
  assert.equal(app.appStrip(id).faces, null, "Edit mode: no faces, slot back to words");
  P.edit.editClose(id);
  assert.notEqual(app.appStrip(id).faces, null, "leaving Edit mode brings them back");
  // The slot, not just the cell: a family that fits the strip only without
  // the faces' slot is one page in Edit mode, two with the faces.
  const db = P.makeDb(1);
  const cap = app.appStrip(id).cap;
  const fam = P.families.families(db).map((f) => f.id)
    .find((fid) => P.families.familyItems(db, fid, "en", new Set()).length === cap);
  assert.ok(fam, `a catalog family of exactly ${cap} tiles`);
  assert.equal(app.appOpenFamily(id, fam).pages, 2, "faces on: the slot is taken");
  P.edit.editOpen(id);
  const inEdit = app.appOpenFamily(id, fam);
  assert.equal(inEdit.faces, null);
  assert.equal(inEdit.pages, 1, "Edit mode: the slot goes back to words, no ghost cell");
  P.edit.editClose(id);
  P.firstrun.tourStart(id, { online: true });
  assert.equal(app.appStrip(id).faces, null, "the tour: no faces");
  P.firstrun.tourEnd(id);
});

test("BS-24: a face tap (trial running) sends the web's speak request with the feeling and plays the cloud clip", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  const n0 = says.length;
  faces.speak(id, "happy");
  await until(() => feelingSays(n0).length, "face outcome");
  const sp = worker.of("/api/v1/voice/speak");
  assert.equal(sp.length, 1);
  assert.deepEqual(Object.keys(sp[0].body), ["user_id", "voice", "text", "feeling"]);
  assert.equal(sp[0].body.feeling, "happy");
  assert.equal(sp[0].body.text, "want apple.");
  assert.equal(sp[0].body.user_id, USER);
  const ev = feelingSays(n0)[0];
  const entry = [...caches.entries()].find(([k]) => k.startsWith("pip-voice\n") && k.includes("/happy/"))[1];
  assert.deepEqual(playedFiles(ev), [entry.file], "what plays is that feeling's clip");
  assert.equal(ev.toast, null);
  // The feeling is not neutral's cache cell: ▶ afterwards asks for neutral.
  say.speak(id);
  await until(() => worker.of("/api/v1/voice/speak").length === 2, "neutral speak");
  assert.equal(worker.of("/api/v1/voice/speak")[1].body.feeling, "neutral");
  await sleep(60);
});

test("BS-24: a single word speaks in a feeling too - a face requests every length (025 § 1)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  app.appClear(id);
  tapIds(id, "sns_0013");
  const n0 = says.length;
  faces.speak(id, "angry");
  await until(() => feelingSays(n0).length, "face outcome");
  const sp = worker.of("/api/v1/voice/speak");
  assert.equal(sp.length, 1);
  assert.equal(sp[0].body.feeling, "angry");
});

test("BS-24: the licence rides a face's request when one is held (web: license: await voiceLicense())", async () => {
  const { id } = await newSession({ ends: Date.now() - DAY2, license: LICENSE });
  const n0 = says.length;
  faces.speak(id, "sad");
  await until(() => feelingSays(n0).length, "face outcome");
  const sp = worker.of("/api/v1/voice/speak")[0];
  assert.deepEqual(Object.keys(sp.body), ["user_id", "license", "voice", "text", "feeling"]);
  assert.equal(sp.body.license, LICENSE);
  assert.equal(sp.body.feeling, "sad");
});

test("BS-24: not entitled (trial over, no licence) -> the web's path: no feeling request, ask once, the bar spoken word by word", async () => {
  const { id } = await newSession({ ends: Date.now() - DAY2 });
  const n0 = says.length;
  faces.speak(id, "happy");
  await until(() => feelingSays(n0).length, "face outcome");
  assert.equal(worker.of("/api/v1/voice/speak").length, 0, "no natural-voice request, feeling or neutral");
  const ev = feelingSays(n0)[0];
  assert.equal(ev.toast, "A feeling voice comes with Pip Lifetime — the free trial has ended.");
  assert.deepEqual(ev.play.map((s) => s.type), ["clip", "clip"], "her word clips");
  assert.equal(barOf(id), "Want apple", "nothing is replaced");
  // askOnce: the second tap in the session speaks and stays quiet.
  const n1 = says.length;
  faces.speak(id, "sad");
  await until(() => feelingSays(n1).length, "second face outcome");
  assert.equal(feelingSays(n1)[0].toast, null);
  assert.equal(worker.of("/api/v1/voice/speak").length, 0);
});

test("BS-24: an empty bar ignores a face; a face is ignored while a transform is in flight (txBusy)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  app.appClear(id);
  const n0 = says.length;
  faces.speak(id, "happy");
  await sleep(100);
  assert.deepEqual(says.slice(n0).map((e) => [e.done, e.play, e.toast]), [["face", null, null]],
    "only the un-press: nothing plays, nothing is asked");
  assert.equal(worker.of("/api/v1/voice/speak").length, 0);
  tapIds(id, "sns_0013", "sns_0128");
  worker.transformDelayMs = 300;
  say.transform(id, "fix");
  await until(() => worker.of("/api/v1/transform").length === 1, "in flight");
  faces.speak(id, "happy");
  await until(() => says.some((e) => playedFiles(e).length), "the transform's own speech");
  assert.ok(worker.of("/api/v1/voice/speak").every((r) => r.body.feeling === "neutral"), "the face did not speak");
});

test("SN-10: Try the faces sends the sample sentence with the feeling - during the trial too (web bug fixed: board.js sampleVoice passes trial)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  const n0 = says.length;
  assert.deepEqual(faces.sample(id, "sad"), { ok: true });
  await until(() => says.slice(n0).some((e) => e.done === "try"), "try outcome");
  const sp = worker.of("/api/v1/voice/speak");
  assert.equal(sp.length, 1);
  assert.deepEqual(Object.keys(sp[0].body), ["user_id", "voice", "text", "feeling"]);
  assert.equal(sp[0].body.text, "I want an apple.");
  assert.equal(sp[0].body.feeling, "sad");
  assert.equal(sp[0].body.voice, "voi_default_en");
  const ev = says.slice(n0).find((e) => e.done === "try");
  assert.equal(playedFiles(ev).length, 1);
  assert.equal(ev.toast ?? null, null);
});

test("SN-10: Try the faces with no answer says the web's words, and plays nothing (no word-clip fallback for a feeling)", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  worker.speak = () => ({ status: 500, json: { error: "down" } });
  const n0 = says.length;
  faces.sample(id, "angry");
  await until(() => says.slice(n0).some((e) => e.done === "try"), "try outcome");
  const ev = says.slice(n0).find((e) => e.done === "try");
  assert.equal(ev.toast, "Couldn't play that — try again online.");
  assert.equal(ev.play ?? null, null);
  // Trial over, no licence: the client sends nothing (voice_sentence gate), same toast.
  const o = await newSession({ ends: Date.now() - DAY2 });
  const n1 = says.length;
  faces.sample(o.id, "happy");
  await until(() => says.slice(n1).some((e) => e.done === "try"), "try outcome 2");
  assert.equal(worker.of("/api/v1/voice/speak").length, 0);
  assert.equal(says.slice(n1).find((e) => e.done === "try").toast, "Couldn't play that — try again online.");
});

test("voice lock: after the trial every non-default voice but the one in use is locked; licensed or in-trial unlocks (board.js:1378)", async () => {
  const lockedOf = (id) => j(P.voicepick.voiceModel(id)).choices.filter((c) => c.locked).map((c) => c.id).sort();
  const choicesOf = (id) => j(P.voicepick.voiceModel(id));
  let s = await newSession({ ends: Date.now() - DAY2 });
  const m = choicesOf(s.id);
  const nonDefault = m.choices.filter((c) => !c.isDefault).map((c) => c.id).sort();
  assert.ok(nonDefault.length >= 3, "the lineup has several paid voices");
  assert.equal(m.choices.find((c) => c.isDefault).locked, false, "Pip's own voice is free forever");
  assert.deepEqual(lockedOf(s.id), nonDefault);
  // The voice in use stays pickable-looking (it is "In use", not locked).
  app.appSetSetting(s.id, "preferred_voice_id", nonDefault[0]);
  assert.equal(choicesOf(s.id).choices.find((c) => c.id === nonDefault[0]).locked, false);
  assert.deepEqual(lockedOf(s.id), nonDefault.slice(1));
  // Trial running: nothing locked.
  s = await newSession({ ends: Date.now() + 3 * DAY2 });
  assert.deepEqual(lockedOf(s.id), []);
  // A licence (the Worker says licensed) after the trial: nothing locked.
  s = await newSession({ ends: Date.now() - DAY2, licensed: true });
  assert.deepEqual(lockedOf(s.id), []);
});

test("BS-24 offline: the faces hide AND release their slot (strip.js facesOn, navigator.onLine), so a family page has no ghost cell", async () => {
  const { id } = await newSession({ ends: Date.now() + 3 * DAY2 });
  const db = P.makeDb(1);
  const fams = P.families.families(db).map((f) => f.id)
    .filter((fid) => P.families.familyItems(db, fid, "en", new Set()).length >= 3);
  const cap = app.appStrip(id).cap;
  const sized = fams.filter((fid) => P.families.familyItems(db, fid, "en", new Set()).length === cap);
  assert.ok(sized.length, `a catalog family of exactly ${cap} tiles (fits the strip only when the faces slot is released)`);
  assert.ok(fams.length, "a catalog family with enough tiles to fill the strip");
  const plain = (st) => st.cards.filter((c) => c.kind !== "more").length;
  const open = () => app.appOpenFamily(id, sized[0]);
  const onlineSt = open();
  assert.notEqual(onlineSt.faces, null);
  ctx.__pipPlatformEvent("netDown"); // Swift's NWPath verdict
  const offSt = open();
  assert.equal(offSt.faces, null, "no faces offline");
  assert.equal(onlineSt.pages, 2, "online: the faces take a slot, so the family pages");
  assert.equal(offSt.pages, 1, "offline: the slot goes back to words");
  assert.equal(plain(offSt), cap);
  assert.equal(app.appStrip(id).faces, null);
  ctx.__pipPlatformEvent("netUp");
  assert.notEqual(open().faces, null, "back online: faces and their slot return");
});
