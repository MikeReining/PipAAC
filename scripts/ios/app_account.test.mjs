/**
 * 044 C5 proof: supporter accounts (passkey) and the recovery card, in the
 * BUILT core (pip-core.js in a bare node:vm realm - JSC's poverty) with a
 * fake __pipHost implemented here in node:
 *   - crypto + keychain: the real public/shared/sync_crypto.mjs behind
 *     opaque handles (what PipHostCrypto.swift does with CryptoKit);
 *   - the passkey ceremony: a software ES256 authenticator that builds a
 *     real attestationObject (CBOR/COSE) and a real signed assertion, with
 *     a PRF that only the authenticator knows. It stands in for iCloud
 *     Keychain: both "iPads" below talk to the SAME authenticator;
 *   - the Worker: fake responses that RECORD each request and verify the
 *     assertion with the REAL src/worker/webauthn.mjs verifyAssertion.
 * Assertions read recorded requests, the keychain and the registry - not
 * the facade's own events.
 *
 * Run: scripts/test.sh scripts/ios/app_account.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as real from "../../public/shared/sync_crypto.mjs";
import { cardLink, keyToWords, recoveryProof } from "../../public/shared/recovery.mjs";
import { RECOVERY_WORDS } from "../../public/shared/recovery_words.mjs";
import { assertionOrigins, verifyAssertion } from "../../src/worker/webauthn.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8");
const BASE = "https://app.pipaac.org";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 5000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const cat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));

/* ---------------- the software authenticator ---------------- */

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

class Authenticator {
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

class FakeWorker {
  constructor() {
    this.requests = [];              // { method, path, body }
    this.accounts = new Map();       // email -> record
    this.tokens = new Map();         // token -> acct id
    this.challenges = new Map();     // challenge -> { acct, auth }
    this.shared = new Map();         // acct id -> Map(user_id -> bundle entry)
    this.assertions = 0;
    this.relayUsers = new Map();     // user id -> { proof, epoch, deviceIds[] }
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

/* ---------------- a fake iPad (what Swift supplies) ---------------- */

function makeDevice({ worker, authenticator }) {
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
    cancel() {}, timerStart() {}, timerCancel() {}, wsOpen() {}, wsSend() {}, wsClose() {},
    emit: (name, json) => { events.push([name, JSON.parse(json)]); },
  };
  ctx = vm.createContext({ __pipHost: host });
  vm.runInContext(BUNDLE, ctx);
  return {
    ctx, events, saved, hostLog, store, rows, prfs, devStore,
    run: (src) => vm.runInContext(src, ctx),
    lastOf: (name) => events.filter(([n]) => n === name).at(-1)?.[1],
    say: () => events.filter(([n, e]) => n === "account.landing" && e.stage === "say").map(([, e]) => e.text),
    /** A linked person this iPad already holds (what pairing left behind). */
    async seedLinked({ id, name, userKey }) {
      store.set(`user/${id}/key_e1`, userKey);
      rows.set(id, { id, name, photo: null, home: true, role: null, needsSetup: false, sync: { userId: id, epoch: 1, cursor: 0 } });
    },
  };
}

const rawKey = async (k) => b64u(await crypto.subtle.exportKey("raw", k));

/* ---------------- tests ---------------- */

test("AC-1: a new account - passkey made, account key sealed under its PRF, nothing clear reaches the Worker", async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const a = makeDevice({ worker, authenticator: auth });
  a.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => a.lastOf("account.link"), "link event");
  assert.equal(a.lastOf("account.link").stage, "sent");
  assert.deepEqual(worker.find("POST", "/accounts/link")[0].body, { email: "mom@example.com" });

  a.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => a.lastOf("account.landing")?.stage === "done", "landing done");
  assert.deepEqual(a.say(), ["Checking the link…", "Create your passkey…", "Signed in."]);

  // The passkey was asked for on the web's relying party, with PRF salted per account.
  assert.equal(auth.creates.length, 1);
  assert.equal(auth.creates[0].rpId, "pipaac.org");
  assert.equal(auth.creates[0].name, "mom@example.com");
  assert.equal(auth.creates[0].userId, auth.creates[0].prfSalt, "web: user.id is the PRF salt");

  const reg1 = worker.find("POST", [...worker.accounts.values()][0].id ? `/accounts/${[...worker.accounts.values()][0].id}/register` : "")[0].body;
  const stored = [...auth.creds.values()][0];
  assert.deepEqual({ x: reg1.jwk.x, y: reg1.jwk.y, kty: reg1.jwk.kty, crv: reg1.jwk.crv },
    { x: stored.jwk.x, y: stored.jwk.y, kty: "EC", crv: "P-256" }, "COSE key -> the same public key the authenticator holds");
  assert.equal(reg1.credential_id, [...auth.creds.keys()][0]);
  assert.match(reg1.challenge, /./);
  assert.equal(reg1.email, "mom@example.com");
  assert.ok(reg1.sealed_priv?.iv && reg1.sealed_priv?.sealed, "private key travels sealed");
  assert.ok(reg1.acct_pub);
  // The Worker's copy opens ONLY with the authenticator's PRF.
  const prf = auth.prf(reg1.prf_salt);
  const opened = await real.openAccountPriv(reg1.sealed_priv, prf);
  assert.equal(opened.type, "private");
  await assert.rejects(real.openAccountPriv(reg1.sealed_priv, auth.prf(b64u(randomBytes(32)))), "another PRF cannot open it");

  // Key rule: no raw account key or PRF bytes in anything JS saw.
  const resultsSeenByJs = a.hostLog.map(([op]) => op);
  assert.ok(!resultsSeenByJs.includes("account.gen") && !resultsSeenByJs.includes("account.seal"),
    "the web-shaped verbs that return raw key bytes are not used");
  const state = JSON.parse(a.store.get("account/state"));
  assert.equal(state.email, "mom@example.com");
  assert.ok(state.session);
});

test("AC-1/AC-3: a person on this iPad joins the account; AC-2: a new iPad signs in with the SAME passkey and gets that person", async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const userKey = await real.newUserKey();
  const a = makeDevice({ worker, authenticator: auth });
  await a.seedLinked({ id: "u_ann", name: "Ann", userKey });
  worker.relayUsers.set("u_ann", { proof: "x", epoch: 1 });
  a.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => a.lastOf("account.link"), "link");
  a.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => a.lastOf("account.landing")?.stage === "done", "A landing done", 8000);

  // AC-3 share: keys wrapped to the ACCOUNT public key, profile sealed to the user key, join tokens minted.
  const acctId = [...worker.accounts.values()][0].id;
  const posted = worker.find("POST", `/accounts/${acctId}/users`)[0].body;
  assert.equal(posted.user_id, "u_ann");
  assert.equal(posted.keys.length, 1);
  assert.equal(posted.join_tokens.length, 4);
  assert.ok(posted.sealed_profile);
  assert.equal(posted.session, worker.accounts.values().next().value.session);

  // Second iPad: fresh keychain, empty registry, same iCloud passkey.
  const b = makeDevice({ worker, authenticator: auth });
  b.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => b.lastOf("account.link"), "link B");
  b.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => b.lastOf("account.landing")?.stage === "done", "B landing done", 8000);
  assert.deepEqual(b.say().slice(0, 3), ["Checking the link…", "Sign in with your passkey…", "Opening your users…"]);
  assert.match(b.say()[3], /^1 user\(s\) added\.$/);

  assert.equal(worker.assertions, 1, "the Worker verified a real signed assertion");
  assert.equal(auth.creates.length, 1, "no second passkey was created");
  // The unsealed account key opened the grant: B holds Ann's key, byte for byte.
  const kb = b.store.get("user/u_ann/key_e1");
  assert.equal(await rawKey(kb), await rawKey(userKey));
  const row = b.rows.get("u_ann");
  assert.equal(row.name, "Ann", "the sealed profile opened with the user key");
  assert.equal(row.role, "partner");
  assert.deepEqual(row.sync, { userId: "u_ann", epoch: 1, cursor: 0 }, "joined on the relay with a join token (no pendingJoin)");
  assert.equal(worker.joined.length, 1);
  assert.equal(worker.joined[0].user, "u_ann");
  assert.ok(posted.join_tokens.includes(worker.joined[0].token));
  // B is now signed in, device-only.
  assert.equal(JSON.parse(b.store.get("account/state")).email, "mom@example.com");
});

test("AC-2 without PRF: the sign-in works, keys stay locked (the row says so)", async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const userKey = await real.newUserKey();
  const a = makeDevice({ worker, authenticator: auth });
  await a.seedLinked({ id: "u_ann", name: "Ann", userKey });
  a.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => a.lastOf("account.link"), "link");
  a.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => a.lastOf("account.landing")?.stage === "done", "A done", 8000);
  // An authenticator that evaluates no PRF on sign-in.
  const noPrf = Object.create(auth); noPrf.prf = () => null;
  const realGet = auth.get.bind(auth);
  noPrf.get = async (x) => ({ ...(await realGet({ ...x, prfSalt: null })), prf: null });
  const b = makeDevice({ worker, authenticator: noPrf });
  b.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => b.lastOf("account.link"), "link B");
  b.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => b.lastOf("account.landing")?.stage === "done", "B done", 8000);
  assert.match(b.say().at(-1), /1 locked until an Allow or QR card brings their keys/);
  assert.equal(b.store.get("user/u_ann/key_e1"), undefined, "no key without the account private key");
  assert.deepEqual(b.rows.get("u_ann").sync, { userId: "u_ann", epoch: 1, cursor: 0, pendingJoin: true },
    "locked: the row claims relay access (sync.userId) but is not joined until keys arrive");
});

test("AC-2: a passkey that did not reach this iPad is added from the claimed link, then asserts", async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const a = makeDevice({ worker, authenticator: auth });
  a.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => a.lastOf("account.link"), "link");
  a.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => a.lastOf("account.landing")?.stage === "done", "A done");
  const b = makeDevice({ worker, authenticator: auth });
  auth.failNextGet = "no passkey for this account on this device";
  b.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => b.lastOf("account.link"), "link B");
  b.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => b.lastOf("account.landing")?.stage === "done", "B done", 8000);
  const acctId = [...worker.accounts.values()][0].id;
  assert.equal(worker.find("POST", `/accounts/${acctId}/credential`).length, 1);
  assert.equal(auth.creates.length, 2, "a second passkey was made for this iPad");
  assert.equal(worker.accounts.values().next().value.creds.size, 2);
  assert.equal(worker.assertions, 1);
  // Same salt, same authenticator secret: the new passkey's PRF opens the account key.
  const sealed = worker.accounts.values().next().value;
  assert.equal((await real.openAccountPriv(sealed.sealed_priv, auth.prf(sealed.prf_salt))).type, "private");
});

test("cancelling the passkey sheet does not make a second passkey", async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const a = makeDevice({ worker, authenticator: auth });
  a.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => a.lastOf("account.link"), "link");
  a.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => a.lastOf("account.landing")?.stage === "done", "A done");
  const b = makeDevice({ worker, authenticator: auth });
  auth.failNextGet = "passkey cancelled";
  b.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "mom@example.com")`);
  await until(() => b.lastOf("account.link"), "link B");
  b.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => b.lastOf("account.landing")?.stage === "failed", "B failed");
  assert.equal(b.lastOf("account.landing").text, "Sign-in was cancelled.");
  assert.equal(auth.creates.length, 1);
  assert.equal(b.store.get("account/state"), undefined, "not signed in");
});

test("a pasted link, a bare token and junk", () => {
  const ctx = makeDevice({ worker: new FakeWorker(), authenticator: new Authenticator() }).ctx;
  const f = (s) => vm.runInContext(`PIPCORE.account.signinToken(${JSON.stringify(s)})`, ctx);
  assert.equal(f("https://app.pipaac.org/?signin=abc_DEF-123456789012345"), "abc_DEF-123456789012345");
  assert.equal(f("  abc_DEF-123456789012345  "), "abc_DEF-123456789012345");
  assert.equal(f("hello"), null);
  assert.equal(f(""), null);
  assert.equal(vm.runInContext(`PIPCORE.account.rpIdFor("https://app.pipaac.org")`, ctx), "pipaac.org");
  assert.equal(vm.runInContext(`PIPCORE.account.rpIdFor("http://127.0.0.1:21088")`, ctx), "127.0.0.1");
});

test("the PRF -> openAccountPriv path with the committed crypto fixtures (the bytes the web sealed)", async () => {
  const fx = JSON.parse(readFileSync(join(root, "apps/PipAAC/PipAACTests/Fixtures/crypto/node.json"), "utf8"));
  assert.ok(fx.cases.accountPriv.length > 0);
  for (const c of fx.cases.accountPriv) {
    const priv = await real.openAccountPriv(c.sealed, unb64u(c.prf));
    assert.equal(priv.type, "private");
    assert.equal(b64u(await crypto.subtle.exportKey("pkcs8", priv)), c.priv, "the PRF opens exactly the account key");
    await assert.rejects(real.openAccountPriv(c.sealed, new Uint8Array(32).fill(1)), "a different PRF never does");
  }
});

/* ---------------- the recovery card ---------------- */

test("SY-10: restore from the card's words - the Worker gets the proof, this iPad gets the root and the key", async () => {
  const worker = new FakeWorker();
  const root16 = new Uint8Array(randomBytes(16));
  const words = await keyToWords(root16, RECOVERY_WORDS);
  worker.relayUsers.set("u_zed", { proof: await recoveryProof(root16), epoch: 1 });
  const d = makeDevice({ worker, authenticator: new Authenticator() });
  d.run(`PIPCORE.recovery.restore(${JSON.stringify(BASE)}, ${JSON.stringify(words)}, "iPad · Pip")`);
  await until(() => d.lastOf("recovery.restore")?.stage === "done", "restore done");
  assert.deepEqual(d.events.map(([, e]) => e.stage), ["checking", "restoring", "done"]);
  assert.deepEqual(d.lastOf("recovery.restore"), { stage: "done", userId: "u_zed", epoch: 1, moved: true });
  const req = worker.find("POST", "/restore")[0].body;
  assert.equal(req.proof, await recoveryProof(root16));
  assert.ok(req.device_id && req.pubkey && req.dh_pub);
  assert.equal(b64u(d.store.get("user/u_zed/root")), b64u(root16), "the root is in the keychain");
  const k = d.store.get("user/u_zed/key_e1");
  assert.equal(await rawKey(k), await rawKey(await real.deriveEpochKey(root16, 1)), "epoch 1 derives from the root");
});

test("SY-10: the scanned link, the pasted link, hyphens, a typo, and not-a-card all behave as the web", async () => {
  const worker = new FakeWorker();
  const root16 = new Uint8Array(randomBytes(16));
  worker.relayUsers.set("u_zed", { proof: await recoveryProof(root16), epoch: 1 });
  const link = await cardLink(BASE, root16, RECOVERY_WORDS);
  for (const text of [link, link.replace(BASE + "/", ""), (await keyToWords(root16, RECOVERY_WORDS)).replaceAll(" ", ", ").toUpperCase()]) {
    const d = makeDevice({ worker, authenticator: new Authenticator() });
    d.run(`PIPCORE.recovery.restore(${JSON.stringify(BASE)}, ${JSON.stringify(text)}, "x")`);
    await until(() => d.lastOf("recovery.restore")?.stage === "done", `restore ${text.slice(0, 30)}`);
  }
  const typo = (await keyToWords(root16, RECOVERY_WORDS)).replace(/^\w+/, "zzzz");
  const t = makeDevice({ worker, authenticator: new Authenticator() });
  t.run(`PIPCORE.recovery.restore(${JSON.stringify(BASE)}, ${JSON.stringify(typo)}, "x")`);
  await until(() => t.lastOf("recovery.restore")?.stage === "error", "typo");
  assert.match(t.lastOf("recovery.restore").message, /unknown recovery word: zzzz/);
  const n = makeDevice({ worker, authenticator: new Authenticator() });
  n.run(`PIPCORE.recovery.restore(${JSON.stringify(BASE)}, "12 34", "x")`);
  await until(() => n.lastOf("recovery.restore")?.stage === "notcard", "not a card");
  assert.equal(n.lastOf("recovery.restore").message, "That doesn't look like a recovery link — paste the link or the 12 words.");
  // A card the relay does not know.
  const other = await keyToWords(new Uint8Array(randomBytes(16)), RECOVERY_WORDS);
  const u = makeDevice({ worker, authenticator: new Authenticator() });
  u.run(`PIPCORE.recovery.restore(${JSON.stringify(BASE)}, ${JSON.stringify(other)}, "x")`);
  await until(() => u.lastOf("recovery.restore")?.stage === "error", "unknown card");
  assert.equal(u.lastOf("recovery.restore").message, "That card doesn't open a user — make a fresh card on a linked device.");
});

test("SY-9: the card shows the link and the 12 words of the root this iPad holds", async () => {
  const worker = new FakeWorker();
  const d = makeDevice({ worker, authenticator: new Authenticator() });
  const root16 = new Uint8Array(randomBytes(16));
  d.store.set("user/u_zed/root", root16);
  d.store.set("user/u_zed/key_e1", await real.deriveEpochKey(root16, 1));
  d.rows.set("u_zed", { id: "u_zed", name: "Zed", sync: { userId: "u_zed", epoch: 1, cursor: 0 } });
  worker.relayUsers.set("u_zed", { proof: "p", epoch: 1, recoveryId: await (async () => {
    const proof = await recoveryProof(root16);
    return Buffer.from(await sha256(new TextEncoder().encode(proof))).toString("hex"); })() });
  const row = JSON.stringify(d.rows.get("u_zed"));
  d.run(`PIPCORE.recovery.card(${JSON.stringify(BASE)}, ${JSON.stringify(row)}, "iPad · Pip", false)`);
  await until(() => d.lastOf("recovery.card"), "card");
  const c = d.lastOf("recovery.card");
  assert.equal(c.stage, "card");
  assert.equal(c.payload, await cardLink(BASE, root16, RECOVERY_WORDS));
  assert.equal(c.words.join(" "), await keyToWords(root16, RECOVERY_WORDS));
  assert.equal(c.words.length, 12);
  await until(() => d.saved.some((s) => s.patch.cardShownAt), "cardShownAt saved to the registry row");
});

test("SY-9: a device linked by another cannot show the card; no relay user yet and no network says so", async () => {
  const worker = new FakeWorker();
  const d = makeDevice({ worker, authenticator: new Authenticator() });
  d.rows.set("u_p", { id: "u_p", name: "P", sync: { userId: "u_p", epoch: 1, cursor: 0 } });
  d.store.set("user/u_p/key_e1", await real.newUserKey());
  d.run(`PIPCORE.recovery.card(${JSON.stringify(BASE)}, ${JSON.stringify(JSON.stringify(d.rows.get("u_p")))}, "x", false)`);
  await until(() => d.lastOf("recovery.card"), "card");
  assert.deepEqual(d.lastOf("recovery.card"), { stage: "unavailable", message:
    "This device was linked by another device and cannot show the card — print it on the device that set up sync." });
  const e = makeDevice({ worker, authenticator: new Authenticator() });
  e.rows.set("u_q", { id: "u_q", name: "Q", sync: null });
  e.run(`PIPCORE.recovery.card(${JSON.stringify(BASE)}, ${JSON.stringify(JSON.stringify({ id: "u_q", name: "Q" }))}, "x", false)`);
  await until(() => e.lastOf("recovery.card"), "card2");
  assert.equal(e.lastOf("recovery.card").stage, "unavailable");
  assert.match(e.lastOf("recovery.card").message, /^Connect to the internet to make the card\./);
});

test("the export surface the Swift host must answer: every op the facades call exists", () => {
  // Pin the new host verbs so a rename on either side fails here, not on a device.
  const src = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/PipHostCrypto.swift"), "utf8")
    + readFileSync(join(root, "apps/PipAAC/PipAAC/Core/PipHost.swift"), "utf8")
    + readFileSync(join(root, "apps/PipAAC/PipAAC/Core/PipHostAccount.swift"), "utf8")
    + readFileSync(join(root, "apps/PipAAC/PipAAC/PipPasskeys.swift"), "utf8")
    + readFileSync(join(root, "apps/PipAAC/PipAAC/LinkDevices.swift"), "utf8");
  for (const op of ["account.create", "account.open", "passkey.create", "passkey.get",
    "registry.list", "registry.get", "registry.addImported"]) {
    assert.ok(src.includes(`"${op}"`), `Swift host has no "${op}"`);
  }
});
