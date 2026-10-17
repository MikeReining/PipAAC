/**
 * Fakes for scripts/ios/app_invite.test.mjs (044 IL): the software
 * authenticator, the fake iPad (what Swift supplies) and a fake Worker with
 * the account + supporter-invite endpoints. Copied from
 * app_account.test.mjs (same seams, same real crypto + real WebAuthn
 * verification), with the invite routes added.
 */
import vm from "node:vm";
import { setImmediate } from "node:timers";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as real from "../../public/shared/sync_crypto.mjs";
import { assertionOrigins, verifyAssertion } from "../../src/worker/webauthn.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8");
export const BASE = "https://app.pipaac.org";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const cat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));

const cborLen = (major, n) => n < 24 ? [major << 5 | n]
  : n < 256 ? [major << 5 | 24, n] : [major << 5 | 25, n >> 8, n & 255];
const cborBytes = (b) => cat(cborLen(2, b.length), b);
const cborText = (s) => cat(cborLen(3, s.length), new TextEncoder().encode(s));
const derSig = (p1363) => {
  const int = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; x = x.slice(i);
    return x[0] & 0x80 ? [2, x.length + 1, 0, ...x] : [2, x.length, ...x]; };
  const seq = [...int(p1363.slice(0, 32)), ...int(p1363.slice(32))];
  return new Uint8Array([0x30, seq.length, ...seq]);
};

export class Authenticator {
  constructor() {
    this.secret = randomBytes(32);   // never leaves; PRF = HMAC(secret, salt)
    this.creds = new Map();          // id -> { priv, jwk }
    this.gets = []; this.creates = [];
    this.failNextGet = null;
  }
  prf(salt) {
    return new Uint8Array(createHmac("sha256", this.secret).update("WebAuthn PRF\0").update(unb64u(salt)).digest());
  }
  async create({ rpId, origin, challenge, userId, name, prfSalt }) {
    this.creates.push({ rpId, origin, challenge, userId, name, prfSalt });
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
    const id = new Uint8Array(randomBytes(16));
    this.creds.set(b64u(id), { priv: kp.privateKey, jwk });
    const cose = cat([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20], unb64u(jwk.x),
      [0x22, 0x58, 0x20], unb64u(jwk.y));
    const authData = cat(await sha256(new TextEncoder().encode(rpId)), [0x45, 0, 0, 0, 0],
      new Uint8Array(16), [0, id.length], id, cose);
    const att = cat([0xa3], cborText("fmt"), cborText("none"), cborText("attStmt"), [0xa0],
      cborText("authData"), cborBytes(authData));
    return { id: b64u(id), attestationObject: b64u(att), prf: this.prf(prfSalt) };
  }
  async get({ rpId, origin, challenge, credentialIds, prfSalt }) {
    this.gets.push({ rpId, origin, challenge, credentialIds, prfSalt });
    if (this.failNextGet) { const e = this.failNextGet; this.failNextGet = null; throw new Error(e); }
    const id = (credentialIds ?? []).find((c) => this.creds.has(c));
    if (!id) throw new Error("no passkey for this account on this device");
    const clientData = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
    const authData = cat(await sha256(new TextEncoder().encode(rpId)), [0x05, 0, 0, 0, 1]);
    const signed = cat(authData, await sha256(clientData));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.creds.get(id).priv, signed));
    return { credential_id: id, authenticator_data: b64u(authData), client_data_json: b64u(clientData),
      signature: b64u(derSig(sig)), prf: prfSalt ? this.prf(prfSalt) : null };
  }
}

/* ---------------- the fake Worker ---------------- */

export class FakeWorker {
  constructor() {
    this.requests = [];              // { method, path, body }
    this.accounts = new Map();       // email -> record
    this.tokens = new Map();         // token -> acct id
    this.challenges = new Map();     // challenge -> { acct, auth }
    this.shared = new Map();         // acct id -> Map(user_id -> bundle entry)
    this.assertions = 0;
    this.relayUsers = new Map();     // user id -> { proof, epoch, deviceIds[] }
    this.invites = new Map();        // token -> { email, user_id, status, to_acct, grant }
  }
  rec(method, path, body) { this.requests.push({ method, path, body }); }
  find(method, path) { return this.requests.filter((r) => r.method === method && r.path === path); }
  newChallenge(acct, auth) { const c = b64u(randomBytes(16)); this.challenges.set(c, { acct, auth }); return c; }
  async handle({ url, method, body: b64 }) {
    const u = new URL(url);
    const path = u.pathname;
    const body = b64 ? JSON.parse(Buffer.from(b64, "base64url").toString()) : null;
    this.rec(method, path, body);
    const ok = (json, status = 200) => ({ status, json });
    let m;
    if (method === "POST" && path === "/accounts/link") {
      let a = this.accounts.get(body.email);
      if (!a) { a = { id: `acct_${b64u(randomBytes(8))}`, email: body.email, creds: new Map(), session: null }; this.accounts.set(body.email, a); }
      const token = b64u(randomBytes(24));
      this.tokens.set(token, a.id);
      this.lastLink = `${BASE}/?signin=${token}`;
      return ok({ ok: true });
    }
    if (method === "POST" && path === "/accounts/claim") {
      const id = this.tokens.get(body.token);
      if (!id) return ok({ error: "link_expired" }, 403);
      this.tokens.delete(body.token);
      const a = [...this.accounts.values()].find((x) => x.id === id);
      return ok({ ok: true, account_id: id, challenge: this.newChallenge(id, true), email: a.email,
        has_credentials: a.creds.size > 0 });
    }
    const acct = (id) => [...this.accounts.values()].find((x) => x.id === id);
    if ((m = /^\/accounts\/([^/]+)\/register$/.exec(path)) && method === "POST") {
      const a = acct(m[1]); const c = this.challenges.get(body.challenge);
      if (!c?.auth || c.acct !== a.id) return ok({ error: "bad_challenge" }, 403);
      a.creds.set(body.credential_id, { id: body.credential_id, jwk: body.jwk });
      Object.assign(a, { acct_pub: body.acct_pub, sealed_priv: body.sealed_priv, prf_salt: body.prf_salt });
      return ok({ ok: true, session: (a.session = b64u(randomBytes(12))) });
    }
    if ((m = /^\/accounts\/([^/]+)\/credentials$/.exec(path))) {
      const a = acct(m[1]);
      return ok({ credential_ids: [...a.creds.keys()], prf_salt: a.prf_salt ?? null });
    }
    if ((m = /^\/accounts\/([^/]+)\/state$/.exec(path))) return ok({ acct_pub: acct(m[1]).acct_pub });
    if ((m = /^\/accounts\/([^/]+)\/challenge$/.exec(path)) && method === "POST") {
      return ok({ ok: true, challenge: this.newChallenge(m[1], false) });
    }
    if ((m = /^\/accounts\/([^/]+)\/credential$/.exec(path)) && method === "POST") {
      const a = acct(m[1]); const c = this.challenges.get(body.challenge);
      if (!c?.auth) return ok({ error: "link_required" }, 403);
      a.creds.set(body.credential_id, { id: body.credential_id, jwk: body.jwk });
      return ok({ ok: true });
    }
    if ((m = /^\/accounts\/([^/]+)\/assert$/.exec(path)) && method === "POST") {
      const a = acct(m[1]); const c = this.challenges.get(body.challenge);
      if (!c || c.acct !== a.id) return ok({ error: "bad_challenge" }, 403);
      this.challenges.delete(body.challenge);
      const cred = a.creds.get(body.credential_id);
      if (!cred) return ok({ error: "no_credential" }, 404);
      const rpId = "pipaac.org"; // index.js rpIdFor(app.pipaac.org)
      try {
        await verifyAssertion(cred, body, { challenge: body.challenge, rpId,
          origins: assertionOrigins(new URL(BASE), rpId) });
      } catch (e) { return ok({ error: "assertion_failed", detail: e.message }, 403); }
      this.assertions++;
      a.session = b64u(randomBytes(12));
      return ok({ ok: true, session: a.session, acct_pub: a.acct_pub, sealed_priv: a.sealed_priv,
        prf_salt: a.prf_salt, users: [...(this.shared.get(a.id)?.values() ?? [])] });
    }
    if ((m = /^\/accounts\/([^/]+)\/users$/.exec(path)) && method === "POST") {
      const a = acct(m[1]);
      if (body.session !== a.session) return ok({ error: "bad_session" }, 403);
      if (!this.shared.has(a.id)) this.shared.set(a.id, new Map());
      this.shared.get(a.id).set(body.user_id, { user_id: body.user_id, keys: body.keys,
        sealed_profile: body.sealed_profile, join_tokens: body.join_tokens });
      return ok({ ok: true });
    }
    /* ----- supporter invites (src/worker/accounts.js /dir/invite*) ----- */
    if (method === "POST" && (m = /^\/accounts\/invites\/([^/]+)$/.exec(path))) {
      const inv = this.invites.get(m[1]);
      if (body.action === "open") {
        if (!inv || inv.status === "declined") return ok({ error: "bad_invite" }, 403);
        let a = this.accounts.get(inv.email);
        if (!a) { a = { id: `acct_${b64u(randomBytes(8))}`, email: inv.email, creds: new Map(), session: null }; this.accounts.set(inv.email, a); }
        const token = b64u(randomBytes(24));
        this.tokens.set(token, a.id);
        return ok({ ok: true, email: inv.email, link_token: token });
      }
      const a = [...this.accounts.values()].find((x) => x.session && x.session === body.session);
      if (!a || !inv) return ok({ error: "bad_invite" }, 403);
      if (body.action === "claim") {
        if (inv.status === "pending_claim") { inv.to_acct = a.id; inv.status = "pending_allow"; }
        return ok({ ok: true, to_acct: inv.to_acct, status: inv.status });
      }
      return ok({ error: "fake worker: invite action" }, 404);
    }
    if (method === "GET" && (m = /^\/accounts\/invites\/([^/]+)$/.exec(path))) {
      const inv = this.invites.get(m[1]);
      const sess = u.searchParams.get("session");
      const a = [...this.accounts.values()].find((x) => x.session && x.session === sess);
      if (!a || !inv || a.id !== inv.to_acct) return ok({ error: "bad_invite" }, 403);
      const out = { ok: true, status: inv.status, user_id: inv.user_id, email: inv.email, to_acct: inv.to_acct };
      if (inv.status === "granted") out.grant = inv.grant;
      return ok(out);
    }
    /* relay (signed) */
    if ((m = /^\/users\/([^/]+)\/join_tokens$/.exec(path)) && method === "POST") {
      return ok({ tokens: Array.from({ length: body.n }, () => b64u(randomBytes(9))) });
    }
    if ((m = /^\/users\/([^/]+)\/devices$/.exec(path)) && method === "POST" && body?.join_token) {
      (this.joined ??= []).push({ user: m[1], token: body.join_token, device: body.device_id });
      return ok({ ok: true });
    }
    if (method === "POST" && path === "/restore") {
      const u = [...this.relayUsers.entries()].find(([, v]) => v.proof === body.proof);
      if (!u) return ok({ error: "no_such_card" }, 404);
      return ok({ user_id: u[0], epoch: u[1].epoch, moved: true, recovery_bundle: null });
    }
    if ((m = /^\/users\/([^/]+)\/devices\/self$/.exec(path)) && method === "GET") {
      const v = this.relayUsers.get(m[1]);
      return ok({ current_epoch: v.epoch, wrapped_key: null, wrapped_keys: {}, rotate_min_epoch: 0,
        recovery_id: v.recoveryId ?? null, owner: true });
    }
    return ok({ error: `fake worker: ${method} ${path}` }, 404);
  }
}
/** The family side, played by the test: an invite for `email` of `userId`. */
FakeWorker.prototype.invite = function (token, email, userId) {
  this.invites.set(token, { email, user_id: userId, status: "pending_claim", to_acct: null, grant: null });
};
/** The owner's Allow: what /dir/invite/grant stores. */
FakeWorker.prototype.allow = function (token, grant) {
  const inv = this.invites.get(token);
  inv.status = "granted"; inv.grant = grant;
};

/* ---------------- a fake iPad (what Swift supplies) ---------------- */

export function makeDevice({ worker, authenticator }) {
  const handles = new Map(); const ids = new Map(); let seq = 0;
  const reg = (k, kind) => { let id = ids.get(k); if (!id) { id = `h${++seq}`; ids.set(k, id); handles.set(id, k); } return { __pipKey: id, kind }; };
  const key = (h) => { const k = handles.get(h?.__pipKey); if (!k) throw new Error(`unknown key handle ${h?.__pipKey}`); return k; };
  const prfs = new Map();
  const store = new Map();        // keychain
  const rows = new Map();         // people.json
  const devStore = real.memoryKeyStore();
  const events = []; const saved = []; const hostLog = [];
  let ctx = null;

  const prfHandle = (bytes) => { const id = `p${prfs.size + 1}`; prfs.set(id, bytes); return { __pipPrf: id }; };
  const prfBytes = (h) => { const b = prfs.get(h?.__pipPrf); if (!b) throw new Error("unknown prf handle"); return b; };
  const rowOut = (r) => JSON.parse(JSON.stringify(r));

  const ops = {
    identity: async () => { const i = await real.getDeviceIdentity(devStore);
      return { deviceId: i.deviceId, sign: reg(i.sign, "ecdsa-priv"), verify: reg(i.verify, "ecdsa-pub"),
        dh: { publicKey: reg(i.dh.publicKey, "ecdh-pub"), privateKey: reg(i.dh.privateKey, "ecdh-priv") } }; },
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
    "bundle.open": async ({ root: r, json }) => {
      const out = {}; for (const [e, k] of Object.entries(await real.openEpochBundle(unb64u(r), json))) out[e] = reg(k, "aes"); return out; },
    /* 044 C5: the account key never leaves the host; the PRF is a handle. */
    "account.create": async ({ prf }) => {
      const a = await real.genAccountKeys();
      const sealed = prf ? await real.sealAccountPriv(a.priv, prfBytes(prf)) : null;
      return { pub: a.pub, sealed, priv: reg(await real.importAccountPriv(a.priv), "ecdh-priv") };
    },
    "account.open": async ({ env, prf }) => reg(await real.openAccountPriv(env, prfBytes(prf)), "ecdh-priv"),
    "passkey.create": async (a) => { const r = await authenticator.create(a); return { id: r.id, attestationObject: r.attestationObject, prf: prfHandle(r.prf) }; },
    "passkey.get": async (a) => { const r = await authenticator.get(a); return { ...r, prf: r.prf ? prfHandle(r.prf) : null }; },
    "keystore.get": async ({ name }) => {
      const v = store.get(name);
      if (v === undefined) return null;
      if (typeof v === "string") return { k: "json", text: v };
      if (v instanceof Uint8Array) return { k: "bytes", b64: b64u(v) };
      return { k: "key", key: reg(v, "aes") };
    },
    "keystore.put": async ({ name, k, key: h, b64, text }) => { store.set(name, k === "key" ? key(h) : k === "bytes" ? unb64u(b64) : text); },
    "keystore.del": async ({ name }) => { store.delete(name); },
    saveUser: async ({ userId, patch }) => { saved.push({ userId, patch: JSON.parse(JSON.stringify(patch)) });
      const r = rows.get(userId); if (r) Object.assign(r, patch); },
    "registry.list": async () => [...rows.values()].map(rowOut),
    "registry.get": async ({ id }) => (rows.has(id) ? rowOut(rows.get(id)) : null),
    "registry.addImported": async (row) => {
      const prev = rows.get(row.id);
      rows.set(row.id, { ...(prev ?? { home: false, needsSetup: false }), ...row, name: row.name || prev?.name || "",
        sync: row.sync ?? prev?.sync ?? null });
    },
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
    call(op, callId, argsJson) {
      hostLog.push([op, argsJson]);
      Promise.resolve().then(() => {
        if (!ops[op]) throw new Error(`fake host: no op ${op}`);
        return ops[op](JSON.parse(argsJson), callId);
      }).then((v) => JSON.stringify(v), (e) => e).then((out) => setImmediate(() => {
        if (out instanceof Error) ctx.__pipSettle(callId, false, out.message);
        else ctx.__pipSettle(callId, true, out === undefined ? "" : out);
      }));
    },
    cancel() {}, timerStart(tid, ms) { setTimeout(() => ctx.__pipFire(tid), ms); }, timerCancel() {}, wsOpen() {}, wsSend() {}, wsClose() {},
    emit: (name, json) => { events.push([name, JSON.parse(json)]); },
  };
  ctx = vm.createContext({ __pipHost: host });
  vm.runInContext(BUNDLE, ctx);
  return {
    ctx, events, saved, hostLog, store, rows, prfs, devStore,
    run: (src) => vm.runInContext(src, ctx),
    lastOf: (name) => events.filter(([n]) => n === name).at(-1)?.[1],
    say: () => events.filter(([n, e]) => n === "invite.landing" && e.stage === "say").map(([, e]) => e.text),
    /** A linked person this iPad already holds (what pairing left behind). */
    async seedLinked({ id, name, userKey }) {
      store.set(`user/${id}/key_e1`, userKey);
      rows.set(id, { id, name, photo: null, home: true, role: null, needsSetup: false, sync: { userId: id, epoch: 1, cursor: 0 } });
    },
  };
}

export const rawKey = async (k) => b64u(await crypto.subtle.exportKey("raw", k));
export { b64u, unb64u };
