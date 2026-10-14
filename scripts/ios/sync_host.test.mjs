/**
 * 044 C2 proof: the web's sync loop, UNCHANGED, inside a JavaScriptCore-
 * like realm. The BUILT apps/PipAAC/PipAAC/Core/pip-core.js is evaluated
 * in a bare node:vm context (no timers, fetch, WebSocket, URL, atob —
 * exactly JSC's poverty), with a fake __pipHost implemented here in node:
 *   - crypto + key store: the real public/shared/sync_crypto.mjs behind
 *     opaque handle tables (what PipHostCrypto.swift does with CryptoKit);
 *   - fetch / WebSocket: an in-memory relay modeled on
 *     src/board/sync_reliability.test.mjs, verifying every request's
 *     device signature with an independently held public key;
 *   - timers: real timers on a compressed clock (the 30 s stall bound
 *     becomes ~0.6 s), so jsc_shims' timer path is what sync.mjs runs on.
 * Assertions read the replica's TABLES (sorted dumps) and the relay's
 * stored envelopes, never the loop's own return values.
 *
 * Run: scripts/test.sh scripts/ios/sync_host.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabase } from "../../src/board/catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { ensureBaseline, pendingOps } from "../../public/shared/ops.mjs";
import * as real from "../../public/shared/sync_crypto.mjs";
import * as hostCrypto from "./host/sync_crypto_host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8");
const SCALE = 0.02; // compressed clock: 30 s -> 0.6 s, 2 s -> 40 ms
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const until = async (pred, what, ms = 4000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(10);
  }
};

/* ---------------- the fake relay ---------------- */

class FakeRelay {
  constructor(userKey) {
    this.userKey = userKey;
    this.log = [];            // { relay_seq, op_id, env, epoch }
    this.sockets = [];        // live FakeSockets
    this.verifyKey = null;    // the device's public key, held independently
    this.verified = 0;
    this.badSig = [];
    this.fetchOpsCalls = 0;
    this.stallFetchOps = 0;   // next N GET /ops requests never answer
  }
  async addOps(ops) {
    const rows = [];
    for (const op of ops) {
      const row = { relay_seq: this.log.length + 1, op_id: op.op_id,
        env: await real.sealOp(this.userKey, op), epoch: 1 };
      this.log.push(row);
      rows.push(row);
    }
    for (const s of this.sockets) s.push({ t: "ops", ops: rows });
    return rows;
  }
  /** → null to never answer, else { status, json }. */
  async handle({ url, method, headers, body }) {
    const u = new URL(url);
    const bytes = body ? unb64u(body) : new Uint8Array();
    if (headers["x-pip-sig"]) {
      const bodyHash = hex(await crypto.subtle.digest("SHA-256", bytes));
      const ok = await real.verifyPayload(this.verifyKey,
        `${method}\n${u.pathname}\n${headers["x-pip-ts"]}\n${bodyHash}`, headers["x-pip-sig"]);
      if (ok) this.verified++; else this.badSig.push(`${method} ${u.pathname}`);
    }
    const p = u.pathname.replace(/^\/users\/[^/]+/, "");
    if (method === "GET" && p === "/devices/self") {
      return { status: 200, json: { current_epoch: 1, wrapped_key: null, wrapped_keys: {}, rotate_min_epoch: 0 } };
    }
    if (method === "GET" && p === "/snapshot") return { status: 404, json: { error: "none" } };
    if (method === "GET" && p === "/supporters") return { status: 200, json: { supporters: [] } };
    if (method === "GET" && p === "/devices") return { status: 200, json: { devices: [], current_epoch: 1 } };
    if (method === "GET" && p === "/ops") {
      this.fetchOpsCalls++;
      if (this.stallFetchOps > 0) { this.stallFetchOps--; return null; }
      const after = Number(u.searchParams?.get?.("after") ?? /after=(\d+)/.exec(u.search)[1]);
      return { status: 200, json: { ops: this.log.filter((r) => r.relay_seq > after), snap_seq: 0 } };
    }
    if (method === "POST" && p === "/ops") {
      const { ops } = JSON.parse(Buffer.from(bytes).toString());
      const assigned = ops.map((o) => {
        const row = { relay_seq: this.log.length + 1, op_id: o.op_id, env: o.env, epoch: 1 };
        this.log.push(row);
        return { op_id: o.op_id, relay_seq: row.relay_seq };
      });
      return { status: 200, json: { ops: assigned } };
    }
    return { status: 404, json: { error: `fake relay: ${method} ${p}` } };
  }
}

/* ---------------- the fake host (what Swift supplies) ---------------- */

function makeHost({ relay, dbs }) {
  const handles = new Map();     // id -> CryptoKey
  const ids = new Map();         // CryptoKey -> id
  const store = new Map();       // keychain: name -> value (CryptoKey | bytes | text)
  const blobs = new Map();
  const timers = new Map();
  const cancelled = new Set();
  const events = [];
  const savedUsers = [];
  const devStore = real.memoryKeyStore();
  const sockets = new Map();
  let ctx = null;
  let seq = 0;

  const reg = (k, kind) => {
    let id = ids.get(k);
    if (!id) { id = `h${++seq}`; ids.set(k, id); handles.set(id, k); }
    return { __pipKey: id, kind };
  };
  const key = (h) => {
    const k = handles.get(h?.__pipKey);
    if (!k) throw new Error(`unknown key handle ${h?.__pipKey}`);
    return k;
  };
  const toText = (b64) => Buffer.from(unb64u(b64)).toString("utf8");

  const ops = {
    "pubkey.export": async ({ key: k }) => real.exportPublicKey(key(k)),
    "pubkey.import": async ({ b64 }) => reg(await real.importPublicKey(b64), "ecdsa-pub"),
    identity: async () => {
      const i = await real.getDeviceIdentity(devStore);
      relay.verifyKey ??= i.verify;
      return { deviceId: i.deviceId, sign: reg(i.sign, "ecdsa-priv"), verify: reg(i.verify, "ecdsa-pub"),
        dh: { publicKey: reg(i.dh.publicKey, "ecdh-pub"), privateKey: reg(i.dh.privateKey, "ecdh-priv") } };
    },
    "epochKey.derive": async ({ root: r, epoch }) => reg(await real.deriveEpochKey(unb64u(r), epoch), "aes"),
    "aes.generate": async () => reg(await real.newUserKey(), "aes"),
    "bundle.seal": async ({ keys, root: r }) => {
      const store2 = real.memoryKeyStore();
      let top = 0;
      for (const [e, h] of Object.entries(keys)) { await real.putUserKey(store2, "u", key(h), Number(e)); top = Math.max(top, Number(e)); }
      return real.sealEpochBundle(store2, "u", unb64u(r), top);
    },
    "bundle.open": async ({ root: r, json }) => {
      const out = {};
      for (const [e, k] of Object.entries(await real.openEpochBundle(unb64u(r), json))) out[e] = reg(k, "aes");
      return out;
    },
    "data.seal": async ({ key: k, b64 }) => real.sealData(key(k), unb64u(b64)),
    "data.open": async ({ key: k, env }) => b64u(await real.openData(key(k), env)),
    "op.seal": async ({ key: k, json }) => real.sealOp(key(k), JSON.parse(json)),
    "op.open": async ({ key: k, env }) => JSON.stringify(await real.openOp(key(k), env)),
    "blob.seal": async ({ key: k, b64, epoch }) => real.sealBlob(key(k), unb64u(b64), epoch),
    "blob.open": async ({ key: k, sealed }) => b64u(await real.openBlob(key(k), sealed)),
    sha256: async ({ b64 }) => b64u(await crypto.subtle.digest("SHA-256", unb64u(b64))),
    sha256hex: async ({ b64 }) => real.sha256Hex(unb64u(b64)),
    sign: async ({ key: k, b64 }) => real.signPayload(key(k), unb64u(b64)),
    verify: async ({ key: k, b64, sig }) => real.verifyPayload(key(k), unb64u(b64), sig),
    "dhpub.export": async ({ key: k }) => real.exportDhPublic(key(k)),
    "key.wrap": async ({ key: k, dhPub }) => real.wrapUserKey(key(k), dhPub),
    "key.unwrap": async ({ key: k, grant }) => reg(await real.unwrapUserKey(key(k), grant), "aes"),
    "account.gen": async () => { const a = await real.genAccountKeys(); return { pub: a.pub, priv: b64u(a.priv) }; },
    "account.seal": async ({ priv, prf }) => real.sealAccountPriv(unb64u(priv), unb64u(prf)),
    "account.import": async ({ priv }) => reg(await real.importAccountPriv(unb64u(priv)), "ecdh-priv"),
    "account.open": async ({ env, prf }) => reg(await real.openAccountPriv(env, unb64u(prf)), "ecdh-priv"),
    "keystore.get": async ({ name }) => {
      const v = store.get(name);
      if (v === undefined) return null;
      if (typeof v === "string") return { k: "json", text: v };
      if (v instanceof Uint8Array) return { k: "bytes", b64: b64u(v) };
      return { k: "key", key: reg(v, "aes") };
    },
    "keystore.put": async ({ name, k, key: h, b64, text }) => {
      store.set(name, k === "key" ? key(h) : k === "bytes" ? unb64u(b64) : text);
    },
    "keystore.del": async ({ name }) => { store.delete(name); },
    "blob.save": async ({ sha, b64 }) => { blobs.set(sha, b64); },
    "blob.load": async ({ sha }) => blobs.get(sha) ?? null,
    saveUser: async ({ userId, patch }) => { savedUsers.push({ userId, patch: JSON.parse(JSON.stringify(patch)) }); },
    fetch: async (req, callId) => {
      const r = await relay.handle(req);
      if (r === null) return NEVER;
      const body = Buffer.from(JSON.stringify(r.json));
      return { status: r.status, statusText: "", headers: [["content-type", "application/json"]], body: b64u(body) };
    },
  };
  const NEVER = Symbol("never");

  const deliver = (fn) => setImmediate(() => fn());
  const host = {
    log: () => {},
    randomUUID: () => crypto.randomUUID(),
    randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
    dbExec: (i, sql) => { dbs.get(i).exec(sql); return null; },
    dbRun: (i, sql, params = []) => ({ changes: Number(dbs.get(i).prepare(sql).run(...params.map(bind)).changes) }),
    dbAll: (i, sql, params = []) => {
      const rows = dbs.get(i).prepare(sql).all(...params.map(bind));
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return { columns, rows: rows.map((r) => columns.map((c) =>
        r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
    },
    call(op, callId, argsJson) {
      const fn = ops[op];
      Promise.resolve().then(() => {
        if (!fn) throw new Error(`fake host: no op ${op}`);
        return fn(JSON.parse(argsJson), callId);
      }).then((v) => (v === NEVER ? v : JSON.stringify(v)), (e) => e)
        .then((out) => {
          if (out === NEVER) return; // the relay never answers
          deliver(() => {
            if (cancelled.has(callId)) return; // aborted: Swift drops the completion
            if (out instanceof Error) ctx.__pipSettle(callId, false, out.message);
            else ctx.__pipSettle(callId, true, out === undefined ? "" : out);
          });
        });
    },
    cancel: (callId) => { cancelled.add(callId); },
    timerStart: (tid, ms) => {
      timers.set(tid, setTimeout(() => { timers.delete(tid); deliver(() => ctx.__pipFire(tid)); }, Math.ceil(ms * SCALE)));
    },
    timerCancel: (tid) => { clearTimeout(timers.get(tid)); timers.delete(tid); },
    wsOpen: (wid, url) => {
      const s = {
        push: (msg) => deliver(() => ctx.__pipWsEvent(wid, "message", JSON.stringify(msg))),
        frames: [], url,
      };
      sockets.set(wid, s);
      relay.sockets.push(s);
      deliver(() => ctx.__pipWsEvent(wid, "open"));
    },
    wsSend: (wid, text) => { sockets.get(wid)?.frames.push(JSON.parse(text)); },
    wsClose: (wid) => {
      const s = sockets.get(wid);
      relay.sockets = relay.sockets.filter((x) => x !== s);
      deliver(() => ctx.__pipWsEvent(wid, "close"));
    },
    emit: (name, json) => { events.push([name, JSON.parse(json)]); },
  };
  const bind = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
  return {
    host, events, savedUsers, store, cancelled, blobs, sockets,
    attach(c) { ctx = c; },
    /** Provision a user key the way pairing would: into the keychain. */
    provision(name, k) { store.set(name, k); },
  };
}

/** Boot a device: replica db + bundle in a bare vm realm + the loop. */
async function boot({ relay, userKey, opts = {} }) {
  const dbs = new Map();
  const db = createDatabase(":memory:");
  ensureBaseline(db);
  dbs.set(1, db);
  const h = makeHost({ relay, dbs });
  h.provision("user/u1/key_e1", userKey);
  const ctx = vm.createContext({ __pipHost: h.host });
  h.attach(ctx);
  vm.runInContext(BUNDLE, ctx);
  const user = { id: "u1", sync: { userId: "ur1", epoch: 1, cursor: 0 } };
  ctx.__args = JSON.stringify(user);
  ctx.__opts = JSON.stringify(opts);
  vm.runInContext(
    `PIPCORE.sync.syncStartDb(PIPCORE.makeDb(1), __args, "https://relay.test", __opts)`, ctx);
  await until(() => h.events.some(([n]) => n === "sync.started"), "sync.started");
  return { ...h, db, ctx, run: (src) => vm.runInContext(src, ctx) };
}

const dumpEntities = (db) =>
  db.prepare("SELECT id, spoken_name AS name FROM personal_entity ORDER BY id").all().map((r) => [r.id, r.name]);
const dumpOps = (db) =>
  db.prepare("SELECT kind, relay_seq FROM sync_op WHERE kind = 'create_entity' ORDER BY seq")
    .all().map((r) => [r.kind, r.relay_seq]);

/** Ops another device (B) authored, as the relay would hold them. */
function opsFromOtherDevice(entities) {
  const b = createDatabase(":memory:");
  ensureBaseline(b);
  for (const [id, name] of entities) createEntity(b, { id, name });
  return pendingOps(b, 50);
}

test("export surface: the host module has exactly the web module's exports", () => {
  assert.deepEqual(Object.keys(hostCrypto).sort(), Object.keys(real).sort());
});

test("the bundle swaps imports, not code: no WebCrypto, no IndexedDB in pip-core.js", () => {
  assert.ok(!/crypto\.subtle\.(importKey|encrypt|generateKey)|indexedDB\.open/.test(BUNDLE));
  assert.ok(/pip-create:/.test(BUNDLE), "host crypto module not bundled");
});

test("catch-up: confirmed ops from another device land in the replica", async () => {
  const userKey = await real.newUserKey();
  const relay = new FakeRelay(userKey);
  await relay.addOps(opsFromOtherDevice([["ent_b1", "Bee one"], ["ent_b2", "Bee two"]]));
  const d = await boot({ relay, userKey });
  await until(() => dumpEntities(d.db).length === 2, "catch-up applied");
  assert.deepEqual(dumpEntities(d.db), [["ent_b1", "Bee one"], ["ent_b2", "Bee two"]]);
  // The cursor was checkpointed through the host's registry hook.
  await until(() => d.savedUsers.some((s) => s.patch.sync?.cursor === 2), "cursor saved");
  assert.equal(relay.badSig.length, 0, `unsigned/forged: ${relay.badSig}`);
  assert.ok(relay.verified > 0, "no signed request reached the relay");
  assert.ok(d.events.some(([n]) => n === "sync.applied"));
});

test("flush: a local edit is sealed with the keychain key and reaches the relay", async () => {
  const userKey = await real.newUserKey();
  const relay = new FakeRelay(userKey);
  const d = await boot({ relay, userKey });
  d.run(`PIPCORE.groups.createEntity(PIPCORE.makeDb(1), { id: "ent_local", name: "Local pup" })`);
  assert.deepEqual(dumpOps(d.db), [["create_entity", null]], "edit not pending before flush");
  await until(() => dumpOps(d.db)[0]?.[1] != null, "op confirmed");
  assert.equal(relay.log.length, 1);
  // The relay holds ciphertext only: open it with the independently held key.
  const plain = await real.openOp(userKey, relay.log[0].env);
  assert.equal(plain.kind, "create_entity");
  assert.equal(JSON.parse(plain.args).id, "ent_local");
  assert.equal(relay.badSig.length, 0);
  assert.deepEqual(dumpEntities(d.db), [["ent_local", "Local pup"]]);
});

test("incoming WebSocket op: a live push applies, and a model frame reaches onModel", async () => {
  const userKey = await real.newUserKey();
  const relay = new FakeRelay(userKey);
  const d = await boot({ relay, userKey });
  await until(() => relay.sockets.length === 1, "socket opened");
  assert.deepEqual(dumpEntities(d.db), []);
  await relay.addOps(opsFromOtherDevice([["ent_live", "Live wire"]]));
  await until(() => dumpEntities(d.db).length === 1, "pushed op applied");
  assert.deepEqual(dumpEntities(d.db), [["ent_live", "Live wire"]]);
  // A sealed live-model message from a supporter's device.
  relay.sockets[0].push({ t: "model", from: "dev_other", e: 1,
    env: await real.sealOp(userKey, { k: "model", t: "ent_live", w: "dog" }) });
  await until(() => d.events.some(([n]) => n === "sync.model"), "model delivered");
  assert.deepEqual(d.events.find(([n]) => n === "sync.model")[1], { k: "model", t: "ent_live", w: "dog" });
  // The online/visible lifecycle re-enters through platform_host.
  const before = relay.fetchOpsCalls;
  d.run(`__pipPlatformEvent("online")`);
  await until(() => relay.fetchOpsCalls > before, "online -> catch-up");
});

test("stalled fetch: timedFetch's deadline aborts it, frees the queue, and catch-up completes", async () => {
  const userKey = await real.newUserKey();
  const relay = new FakeRelay(userKey);
  await relay.addOps(opsFromOtherDevice([["ent_late", "Late bloomer"]]));
  relay.stallFetchOps = 1;
  const d = await boot({ relay, userKey });
  await until(() => relay.fetchOpsCalls >= 1, "first catch-up request sent");
  await sleep(150);
  assert.deepEqual(dumpEntities(d.db), [], "applied while the relay was silent");
  assert.equal(d.cancelled.size, 0, "aborted before its deadline");
  // 30 s on the compressed clock = 600 ms: the abort reaches the host.
  await until(() => d.cancelled.size >= 1, "deadline abort told the host to cancel");
  await until(() => dumpEntities(d.db).length === 1, "later catch-up applied the op");
  assert.deepEqual(dumpEntities(d.db), [["ent_late", "Late bloomer"]]);
  assert.ok(relay.fetchOpsCalls >= 2);
});

test("crypto.subtle.digest shim rides the host sha256", async () => {
  const userKey = await real.newUserKey();
  const d = await boot({ relay: new FakeRelay(userKey), userKey });
  d.run(`crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")).then((b) => {
    globalThis.__sha = Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  })`);
  await until(() => d.ctx.__sha, "digest");
  assert.equal(d.ctx.__sha, hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"))));
});
