/**
 * Fakes for scripts/ios/app_team.test.mjs (044 F2): the built core in a bare
 * node:vm realm with a fake __pipHost (crypto + keychain = the real
 * sync_crypto behind opaque handles; the app database = node:sqlite), and a
 * fake Worker that RECORDS every request and enforces the relay's own
 * owner-only rule (src/worker/relay.js ownerOnly).
 */
import assert from "node:assert/strict";
import vm from "node:vm";
import { setImmediate } from "node:timers";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import * as real from "../../public/shared/sync_crypto.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8");
export const BASE = "https://app.pipaac.org";
export const LABEL = "iPad · Pip";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 8000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};
export const rawKey = async (k) => b64u(await crypto.subtle.exportKey("raw", k));

/* ---------------- the fake Worker (relay + accounts) ---------------- */

export class FakeWorker {
  constructor({ userId, ownerAcct }) {
    this.userId = userId;
    this.ownerAcct = ownerAcct;
    this.requests = [];
    this.devices = [];               // { device_id, dh_pub, label, added_at, via_acct }
    this.supporters = [];            // { acct_id, email, owner }
    this.invites = [];               // account-side invites
    this.epoch = 1;
    this.rotateMin = 0;
    this.deleteAt = null;
    this.entitlement = "free";
    this.callerOwner = true;         // what devices/self says about THIS device
    this.failGrant = false;          // the regrant leg dies (a killed app)
    this.accountAlive = true;
    this.selfDevice = null;
  }
  find(method, re) { return this.requests.filter((r) => r.method === method && re.test(r.path)); }
  async handle({ url, method, body: b64, headers }) {
    const u = new URL(url);
    const path = u.pathname;
    const body = b64 ? JSON.parse(Buffer.from(b64, "base64url").toString()) : null;
    this.requests.push({ method, path, query: u.search, body, headers });
    const ok = (json, status = 200) => ({ status, json });
    let m;
    /* ----- accounts ----- */
    if ((m = /^\/accounts\/([^/]+)\/invites$/.exec(path))) {
      if (method === "POST") {
        if (body.session !== "sess-owner") return ok({ error: "bad_invite" }, 403);
        const token = `inv${this.invites.length + 1}`;
        this.invites.push({ token, user_id: body.user_id, email: body.email, to_acct: null,
          to_acct_pub: null, status: "pending_claim" });
        return ok({ ok: true, token });
      }
      if (!this.accountAlive) return ok({ error: "bad_session" }, 403);
      return ok({ ok: true, invites: this.invites });
    }
    if ((m = /^\/accounts\/invites\/([^/]+)$/.exec(path)) && method === "POST") {
      const inv = this.invites.find((i) => i.token === m[1]);
      if (body.action === "grant") {
        if (this.failGrant) return ok({ error: "relay_down" }, 503);
        inv.status = "granted"; inv.grant = body;
        return ok({ ok: true });
      }
      if (body.action === "decline") { inv.status = "declined"; return ok({ ok: true }); }
      if (body.action === "revoke") { inv.status = "revoked"; return ok({ ok: true }); }
    }
    if ((m = /^\/accounts\/([^/]+)\/state$/.exec(path))) {
      return ok({ acct_pub: this.supporterPubs?.[m[1]] ?? null });
    }
    if ((m = /^\/accounts\/(acct_[^/]+)$/.exec(path)) && method === "DELETE") {
      if (u.searchParams.get("session") !== "sess-owner") return ok({ error: "bad_session" }, 403);
      this.accountAlive = false;
      return ok({ ok: true });
    }
    /* ----- the relay (signed) ----- */
    if ((m = /^\/users\/([^/]+)(?:\/(.*))?$/.exec(path))) {
      const route = m[2] ?? "";
      const ownerOnly = (method === "POST" && ["devices", "supporters", "keys", "recovery", "undelete"].includes(route))
        || (method === "POST" && /^supporters\/[^/]+\/owner$/.test(route))
        || (method === "DELETE" && (route === "" || route.startsWith("supporters/") || route.startsWith("devices/")));
      if (ownerOnly && !this.callerOwner) {
        return ok({ error: "owner_only", message: "Only an owner can do this." }, 403);
      }
      if (method === "GET" && route === "devices") return ok({ devices: this.devices, current_epoch: this.epoch });
      if (method === "GET" && route === "devices/self") {
        return ok({ device_id: this.selfDevice, current_epoch: this.epoch, wrapped_keys: {},
          rotate_min_epoch: this.rotateMin, recovery_id: null, owner: this.callerOwner,
          entitlement: this.entitlement, ...(this.deleteAt ? { delete_at: this.deleteAt } : {}) });
      }
      if (method === "POST" && route === "label") {
        const d = this.devices.find((x) => x.device_id === this.selfDevice); if (d) d.label = body.label;
        return ok({ ok: true });
      }
      if (method === "GET" && route === "supporters") return ok({ supporters: this.supporters });
      if (method === "POST" && route === "supporters") {
        if (!this.supporters.some((s) => s.acct_id === body.acct_id)) {
          this.supporters.push({ acct_id: body.acct_id, email: body.email, owner: false });
        }
        return ok({ ok: true });
      }
      if ((m = /^supporters\/([^/]+)\/owner$/.exec(route)) && method === "POST") {
        const s = this.supporters.find((x) => x.acct_id === decodeURIComponent(m[1]));
        if (this.lastOwnerError) return ok({ error: "last_owner" }, 409);
        s.owner = body.owner === true;
        return ok({ ok: true, owner: s.owner });
      }
      if ((m = /^supporters\/([^/]+)$/.exec(route)) && method === "DELETE") {
        this.supporters = this.supporters.filter((s) => s.acct_id !== decodeURIComponent(m[1]));
        this.devices = this.devices.filter((d) => d.via_acct !== decodeURIComponent(m[1]));
        this.rotateMin = this.epoch + 1;
        return ok({ ok: true });
      }
      if ((m = /^devices\/([^/]+)$/.exec(route)) && method === "DELETE") {
        this.devices = this.devices.filter((d) => d.device_id !== m[1]);
        this.rotateMin = this.epoch + 1;
        return ok({ ok: true });
      }
      if (method === "POST" && route === "keys") {
        this.epoch = body.epoch; this.rotateMin = 0; this.lastKeys = body;
        return ok({ ok: true });
      }
      if (method === "POST" && route === "join_tokens") {
        return ok({ tokens: Array.from({ length: body.n }, (_, i) => `jt${i}${body.for_acct ?? ""}`) });
      }
      if (method === "DELETE" && route === "") { this.deleteAt = Date.UTC(2026, 10, 13); return ok({ ok: true, delete_at: this.deleteAt }); }
      if (method === "POST" && route === "undelete") { this.deleteAt = null; return ok({ ok: true }); }
    }
    return ok({ error: `fake worker: ${method} ${path}` }, 404);
  }
}

/* ---------------- a fake iPad ---------------- */

export async function makeDevice({ worker, userId, name = "Ann" }) {
  const handles = new Map(); const ids = new Map(); let seq = 0;
  const reg = (k, kind) => { let id = ids.get(k); if (!id) { id = `h${++seq}`; ids.set(k, id); handles.set(id, k); } return { __pipKey: id, kind }; };
  const key = (h) => { const k = handles.get(h?.__pipKey); if (!k) throw new Error(`unknown key handle ${h?.__pipKey}`); return k; };
  const store = new Map();        // keychain
  const rows = new Map();         // people.json
  const devStore = real.memoryKeyStore();
  const events = []; const saved = [];
  let ctx = null;
  const identity = await real.getDeviceIdentity(devStore);
  worker.selfDevice = identity.deviceId;
  const dir = mkdtempSync(join(tmpdir(), "pip-team-"));
  const file = join(dir, "user.sqlite");
  copyFileSync(join(root, "public/fresh_db.sqlite"), file);
  const sqlite = new DatabaseSync(file);
  const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

  const ops = {
    identity: async () => ({ deviceId: identity.deviceId, sign: reg(identity.sign, "ecdsa-priv"),
      verify: reg(identity.verify, "ecdsa-pub"),
      dh: { publicKey: reg(identity.dh.publicKey, "ecdh-pub"), privateKey: reg(identity.dh.privateKey, "ecdh-priv") } }),
    "pubkey.export": async ({ key: k }) => real.exportPublicKey(key(k)),
    "dhpub.export": async ({ key: k }) => real.exportDhPublic(key(k)),
    "epochKey.derive": async ({ root: r, epoch }) => reg(await real.deriveEpochKey(unb64u(r), epoch), "aes"),
    "aes.generate": async () => reg(await real.newUserKey(), "aes"),
    "key.wrap": async ({ key: k, dhPub }) => real.wrapUserKey(key(k), dhPub),
    "key.unwrap": async ({ key: k, grant }) => reg(await real.unwrapUserKey(key(k), grant), "aes"),
    "blob.seal": async ({ key: k, b64, epoch }) => real.sealBlob(key(k), unb64u(b64), epoch),
    "blob.open": async ({ key: k, sealed }) => b64u(await real.openBlob(key(k), sealed)),
    sha256: async ({ b64 }) => b64u(await crypto.subtle.digest("SHA-256", unb64u(b64))),
    sign: async ({ key: k, b64 }) => real.signPayload(key(k), unb64u(b64)),
    "keystore.get": async ({ name: n }) => {
      const v = store.get(n);
      if (v === undefined) return null;
      if (typeof v === "string") return { k: "json", text: v };
      if (v instanceof Uint8Array) return { k: "bytes", b64: b64u(v) };
      return { k: "key", key: reg(v, "aes") };
    },
    "keystore.put": async ({ name: n, k, key: h, b64, text }) => { store.set(n, k === "key" ? key(h) : k === "bytes" ? unb64u(b64) : text); },
    "keystore.del": async ({ name: n }) => { store.delete(n); },
    saveUser: async ({ userId: id, patch }) => { saved.push({ userId: id, patch: JSON.parse(JSON.stringify(patch)) });
      const r = rows.get(id); if (r) Object.assign(r, patch); },
    fetch: async (req) => {
      const r = await worker.handle(req);
      return { status: r.status, statusText: "", headers: [["content-type", "application/json"]],
        body: b64u(Buffer.from(JSON.stringify(r.json))) };
    },
  };
  const host = {
    baseURL: BASE, log: () => {},
    randomUUID: () => crypto.randomUUID(),
    randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
    dbExec: (_id, sql) => { sqlite.exec(sql); return null; },
    dbRun: (_id, sql, p = []) => ({ changes: Number(sqlite.prepare(sql).run(...p.map(bindable)).changes) }),
    dbAll: (_id, sql, p = []) => {
      const rs = sqlite.prepare(sql).all(...p.map(bindable));
      const columns = rs.length ? Object.keys(rs[0]) : [];
      return { columns, rows: rs.map((r) => columns.map((c) => (r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c]))) };
    },
    call(op, callId, argsJson) {
      Promise.resolve().then(() => {
        if (!ops[op]) throw new Error(`fake host: no op ${op}`);
        return ops[op](JSON.parse(argsJson), callId);
      }).then((v) => JSON.stringify(v), (e) => e).then((out) => setImmediate(() => {
        if (out instanceof Error) ctx.__pipSettle(callId, false, out.message);
        else ctx.__pipSettle(callId, true, out === undefined ? "" : out);
      }));
    },
    cancel() {}, timerStart() {}, timerCancel() {}, wsOpen() {}, wsSend() {}, wsClose() {},
    emit: (n, json) => { events.push([n, JSON.parse(json)]); },
  };
  ctx = vm.createContext({ __pipHost: host });
  vm.runInContext(BUNDLE, ctx);
  const run = (src) => vm.runInContext(src, ctx);
  const { appId } = JSON.parse(run(`JSON.stringify(PIPCORE.app.appOpen(1, ${JSON.stringify(readFileSync(join(root, "public/catalog.json"), "utf8"))}, null, null))`));

  // The person this iPad created: its keys + recovery root + registry row.
  const root16 = crypto.getRandomValues(new Uint8Array(16));
  const k1 = await real.deriveEpochKey(root16, 1);
  store.set(`user/${userId}/root`, root16);
  store.set(`user/${userId}/key_e1`, k1);
  const row = { id: userId, name, photo: null, home: true, role: null, needsSetup: false,
    sync: { userId, epoch: 1, cursor: 0 } };
  rows.set(userId, row);
  const mine = await real.exportDhPublic(identity.dh.publicKey);
  worker.devices.push({ device_id: identity.deviceId, dh_pub: mine, label: "", added_at: 1760000000000, via_acct: null });
  store.set("account/state", JSON.stringify({ acct_id: worker.ownerAcct, email: "owner@example.com", session: "sess-owner" }));

  const dev = {
    ctx, events, saved, store, rows, appId, root16, k1, identity, sqlite,
    row: () => JSON.stringify(rows.get(userId)),
    lastOf: (n) => events.filter(([x]) => x === n).at(-1)?.[1],
    toasts: () => events.filter(([x]) => x === "team.toast").map(([, e]) => e.text),
    /** run a facade call and wait for the next team.state it produces. */
    async state(fn = "refresh", ...args) {
      const before = events.filter(([x]) => x === "team.state").length;
      run(`PIPCORE.team.${fn}(${[JSON.stringify(BASE), JSON.stringify(dev.row()), JSON.stringify(LABEL), JSON.stringify(appId), ...args.map((a) => JSON.stringify(a))].join(",")})`);
      await until(() => events.filter(([x]) => x === "team.state").length > before, `team.state after ${fn}`);
      return dev.lastOf("team.state");
    },
    act: (action, args) => dev.state("act", action, JSON.stringify(args ?? {})),
  };
  return dev;
}

/** A supporter account as a node peer would hold it: a real account keypair. */
export async function supporter(worker, acct, email) {
  const k = await real.genAccountKeys();
  (worker.supporterPubs ??= {})[acct] = k.pub;
  return { acct, email, pub: k.pub, priv: await real.importAccountPriv(k.priv) };
}

export const fixture = async () => {
  const userId = "u_ann";
  const worker = new FakeWorker({ userId, ownerAcct: "acct_owner" });
  const dev = await makeDevice({ worker, userId });
  return { worker, dev, userId };
};
