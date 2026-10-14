/**
 * Fakes for scripts/ios/app_spotlight.test.mjs (044 D5): an in-memory relay
 * with live WebSockets and the host Swift supplies (crypto, keychain, db,
 * timers on a compressed clock). Same shape as scripts/ios/sync_host.test.mjs
 * (copied: that file is a test, not a module) - the relay verifies every
 * request's device signature and keeps sealed ops only.
 */
import { setImmediate } from "node:timers";
import * as real from "../../public/shared/sync_crypto.mjs";

export const SCALE = 0.02; // compressed clock: 4 s fade -> 80 ms, 30 s tick -> 600 ms
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));

/* ---------------- the fake relay ---------------- */

export class FakeRelay {
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

export function makeHost({ relay, dbs }) {
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
      // unref: a leftover slow tick must not keep the test process alive
      timers.set(tid, setTimeout(() => { timers.delete(tid); deliver(() => ctx.__pipFire(tid)); }, Math.ceil(ms * SCALE)).unref());
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

