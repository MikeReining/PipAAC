/**
 * Keys and encryption (docs/product/Sync_And_Web_Editing.md §§ 3–4).
 *
 * One device identity per install: an ECDSA pair (ops and requests are
 * signed) and an ECDH pair (user-key transport in pairing, slice 5).
 * Private keys are non-extractable and live in the platform store —
 * IndexedDB in the browser; tests inject an in-memory store. The user
 * key is AES-256-GCM, kept extractable so pairing can wrap it to a new
 * device; it is never exported in the clear by this module.
 *
 * Wire format: { v: 1, alg: "A256GCM", iv, ct } — iv and ct base64url.
 * A blob envelope adds sha, the SHA-256 hex of the plaintext; the op
 * that references it carries that hash, never the bytes.
 */

import { STALL_MS, withDeadline } from "./bounded.mjs";

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

const b64u = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const unb64u = (s) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** SPKI base64url — the form the relay stores for a device. */
export const exportPublicKey = async (publicKey) =>
  b64u(await subtle.exportKey("spki", publicKey));
export const importPublicKey = (b64) =>
  subtle.importKey("spki", unb64u(b64),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);

/* ------------------------------------------------------------------ *
 * Key store — IndexedDB holds CryptoKey objects (structured-cloneable,
 * private keys stay non-extractable). Tests pass a Map-backed store.
 * ------------------------------------------------------------------ */

export function memoryKeyStore() {
  const m = new Map();
  return {
    async get(k) { return m.get(k); },
    async put(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
  };
}

/** The platform secure store: IndexedDB `pip-keys`. */
export function openKeyStore() {
  if (typeof indexedDB === "undefined") return memoryKeyStore();
  const dbp = new Promise((res, rej) => {
    const req = indexedDB.open("pip-keys", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const wrap = (mode, fn) => withDeadline(dbp.then((idb) => new Promise((res, rej) => {
    const tx = idb.transaction("keys", mode);
    const req = fn(tx.objectStore("keys"));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  })), STALL_MS, "key store");
  return {
    get: (k) => wrap("readonly", (s) => s.get(k)),
    put: (k, v) => wrap("readwrite", (s) => s.put(v, k)),
    del: (k) => wrap("readwrite", (s) => s.delete(k)),
  };
}

/* ------------------------------------------------------------------ *
 * Device identity + user key
 * ------------------------------------------------------------------ */

/* One-shot creation (device identity, epoch keys, recovery roots) is
 * read→generate→put: without a lock, two concurrent callers both miss,
 * generate different values, and the later put wins while the loser
 * keeps using a value nothing stored (audit: three concurrent
 * getDeviceIdentity calls returned three identities). underLock
 * serializes per name — the loser re-reads and adopts the stored
 * winner. Cross-tab, IndexedDB races the same way; navigator.locks
 * narrows it where the platform offers it. */
const createLocks = new Map();
const underLock = (name, fn) => {
  const run = withDeadline((createLocks.get(name) ?? Promise.resolve()).then(() =>
    (globalThis.navigator?.locks?.request
      ? navigator.locks.request(`pip-create:${name}`, fn)
      : fn())), STALL_MS, `create lock ${name}`);
  const tail = run.catch(() => {});
  createLocks.set(name, tail);
  tail.then(() => {
    if (createLocks.get(name) === tail) createLocks.delete(name);
  });
  return run;
};

/**
 * The device's key pairs, generated once and kept. Returns
 * { deviceId, sign, verify, dh } where deviceId is the SHA-256
 * fingerprint of the signing public key — the name ops carry.
 */
export async function getDeviceIdentity(store = openKeyStore()) {
  const keys = await underLock("device", async () => {
    const existing = await store.get("device");
    if (existing) return existing;
    const created = {
      sig: await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]),
      dh: await subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]),
    };
    await store.put("device", created);
    return created;
  });
  const raw = await subtle.exportKey("raw", keys.sig.publicKey);
  const fp = hex(await subtle.digest("SHA-256", raw)).slice(0, 16);
  return {
    deviceId: `dev_${fp}`,
    sign: keys.sig.privateKey,
    verify: keys.sig.publicKey,
    dh: keys.dh,
  };
}

/**
 * The user's AES-256-GCM key — one per user, created on first use.
 * Rotations (§ 3 revoke) mint a new key per epoch. 015 slice 2: keys
 * scope per user — "user/<id>/key_e<n>" and "user/<id>/root" — so one
 * device holds many users. Old keys stay so old ops still open.
 *
 * Recovery (§ 9): the device that sets up sync also mints a recovery
 * root — a 256-bit bearer secret stored raw under the user's scope.
 * When the root is present, every epoch key derives from it via HKDF,
 * so a recovery sheet restores all epochs. Paired devices hold wrapped
 * epoch keys, never the root — a device that could re-derive every key
 * would make revoke cosmetic.
 */
export const userKeyName = (userId, epoch) => `user/${userId}/key_e${epoch}`;
export const userRootName = (userId) => `user/${userId}/root`;

export async function ensureRecoveryRoot(store = openKeyStore(), userId) {
  const name = userRootName(userId);
  const root = await underLock(name, async () => {
    let r = await store.get(name);
    if (!r) {
      r = globalThis.crypto.getRandomValues(new Uint8Array(16)); // 12 recovery words
      await store.put(name, r);
    }
    return r;
  });
  return root instanceof Uint8Array ? root : new Uint8Array(root);
}
/** Epoch key = HKDF(root, salt "pip-board-key", info "epoch:<n>"). */
export async function deriveEpochKey(rootBytes, epoch) {
  const hkdf = await subtle.importKey("raw", rootBytes, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode("pip-board-key"),
      info: te.encode(`epoch:${epoch}`) },
    hkdf, { name: "AES-GCM", length: 256 }, true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}

export async function getUserKey(store = openKeyStore(), userId, epoch = 1) {
  const name = userKeyName(userId, epoch);
  return underLock(name, async () => {
    let key = await store.get(name);
    if (!key) {
      const root = await store.get(userRootName(userId));
      key = root
        ? await deriveEpochKey(root instanceof Uint8Array ? root : new Uint8Array(root), epoch)
        : await subtle.generateKey({ name: "AES-GCM", length: 256 }, true,
            ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
      await store.put(name, key);
    }
    return key;
  });
}
export const putUserKey = (store, userId, key, epoch = 1) =>
  store.put(userKeyName(userId, epoch), key);
export const newUserKey = () =>
  subtle.generateKey({ name: "AES-GCM", length: 256 }, true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);

/* ------------------------------------------------------------------ *
 * Recovery bundle (015 slice 3) — replacing the QR card mints a new
 * root, so ops sealed under retired roots would be unreadable to a
 * new-card restore. The replacer seals every epoch key it can reach
 * into a bundle keyed to the NEW root; the relay stores it blind and
 * hands it to a restore, which unpacks the whole backlog. Retired
 * roots stay in the keystore (`user/<id>/roots`, [{from, upto, root}])
 * so a second replacement still covers the first era.
 * ------------------------------------------------------------------ */

export const retiredRootsName = (userId) => `user/${userId}/roots`;

/** HKDF(root, info "recovery-bundle") — only a card holder opens it. */
async function deriveBundleKey(rootBytes) {
  const hkdf = await subtle.importKey("raw", rootBytes, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode("pip-board-key"),
      info: te.encode("recovery-bundle") },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const importRaw = (b64) =>
  subtle.importKey("raw", unb64u(b64), { name: "AES-GCM", length: 256 }, true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);

/** Retire the outgoing root into the coverage list before replacing it. */
export async function retireRoot(store, userId, oldRootBytes, uptoEpoch) {
  const retired = JSON.parse((await store.get(retiredRootsName(userId))) ?? "[]");
  if (retired.some((r) => r.root === b64u(oldRootBytes) && r.upto === uptoEpoch)) return;
  const from = retired.length ? retired[retired.length - 1].upto + 1 : 1;
  retired.push({ from, upto: uptoEpoch, root: b64u(oldRootBytes) });
  await store.put(retiredRootsName(userId), JSON.stringify(retired));
}

/** epoch → key map for 1..uptoEpoch, sealed to `newRoot`. A stored key
 *  wins — it is whatever this device could actually read (derived at
 *  open time, or a wrapped grant from pairing). Derivation fills the
 *  gaps only where a covering root is on hand: a retired root for its
 *  era, the outgoing one for everything after. */
export async function sealEpochBundle(store, userId, newRootBytes, uptoEpoch) {
  const retired = JSON.parse((await store.get(retiredRootsName(userId))) ?? "[]");
  const last = retired[retired.length - 1];
  const current = await store.get(userRootName(userId));
  const map = {};
  for (let e = 1; e <= uptoEpoch; e++) {
    let key = await store.get(userKeyName(userId, e));
    if (!key) {
      const cov = retired.find((r) => e >= r.from && e <= r.upto);
      const root = cov ? unb64u(cov.root)
        : (current && e > (last?.upto ?? 0)
          ? (current instanceof Uint8Array ? current : new Uint8Array(current))
          : null);
      if (root) key = await deriveEpochKey(root, e);
    }
    if (key) map[e] = b64u(await subtle.exportKey("raw", key));
  }
  return JSON.stringify(
    await sealData(await deriveBundleKey(newRootBytes), te.encode(JSON.stringify(map))));
}

/** A restore unpacks its card's bundle → { epoch: CryptoKey }. */
export async function openEpochBundle(rootBytes, json) {
  const map = JSON.parse(td.decode(
    await openData(await deriveBundleKey(rootBytes), JSON.parse(json))));
  const out = {};
  for (const [e, raw] of Object.entries(map)) out[Number(e)] = await importRaw(raw);
  return out;
}

/* ------------------------------------------------------------------ *
 * Sealing
 * ------------------------------------------------------------------ */

export async function sealData(key, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { v: 1, alg: "A256GCM", iv: b64u(iv), ct: b64u(ct) };
}

export async function openData(key, env) {
  if (env?.v !== 1 || env.alg !== "A256GCM") throw new Error("bad envelope");
  return new Uint8Array(await subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(env.iv) }, key, unb64u(env.ct)));
}

/* Ops over DEFLATE_OVER bytes are deflated before sealing: the seed
 * install op alone is ~160 KB of JSON (~17 KB deflated) and the relay
 * refuses envelopes over 64 KB. The marker is inside the ciphertext —
 * a leading 0x00 byte, which plain JSON ("{") never starts with — so it
 * is authenticated and the envelope shape doesn't change. */
const DEFLATE_OVER = 4096;
const pipe = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function sealOp(key, op) {
  const plain = te.encode(JSON.stringify(op));
  if (plain.length <= DEFLATE_OVER) return sealData(key, plain);
  const z = await pipe(plain, new CompressionStream("deflate-raw"));
  const marked = new Uint8Array(z.length + 1);
  marked.set(z, 1);
  return sealData(key, marked);
}

export async function openOp(key, env) {
  const bytes = await openData(key, env);
  const plain = bytes[0] === 0
    ? await pipe(bytes.subarray(1), new DecompressionStream("deflate-raw"))
    : bytes;
  return JSON.parse(td.decode(plain));
}

/**
 * Blob envelope: { sha, env } — env carries `e`, the key epoch it was
 * sealed under, so a replica picks the right user key after rotation.
 * The op carries sha; the bytes travel sealed.
 */
export async function sealBlob(key, bytes, epoch = 1) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const env = await sealData(key, buf);
  env.e = epoch;
  return { sha: hex(await subtle.digest("SHA-256", buf)), env };
}

/** Open a blob envelope; the hash is part of the deal — verify it. */
export async function openBlob(key, sealed) {
  const bytes = await openData(key, sealed.env);
  if (hex(await subtle.digest("SHA-256", bytes)) !== sealed.sha) {
    throw new Error("blob hash mismatch");
  }
  return bytes;
}

export const sha256Hex = async (bytes) =>
  hex(await subtle.digest("SHA-256", bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));

/* ------------------------------------------------------------------ *
 * Device signatures (the relay authenticates these in slice 4)
 * ------------------------------------------------------------------ */

export async function signPayload(signKey, bytes) {
  const sig = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, signKey,
    bytes instanceof Uint8Array ? bytes : te.encode(String(bytes)));
  return b64u(sig);
}

export async function verifyPayload(verifyKey, bytes, sig) {
  return subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, verifyKey, unb64u(sig),
    bytes instanceof Uint8Array ? bytes : te.encode(String(bytes)));
}

/* ------------------------------------------------------------------ *
 * User-key transport (pairing + rotation, § 3). The granter makes an
 * ephemeral ECDH pair, derives an AES-GCM wrap key against the target
 * device's long-term dh public key, and wraps the user key. The grant
 * carries the ephemeral public key; the target derives the same secret
 * with its private dh key.
 * ------------------------------------------------------------------ */

export const exportDhPublic = async (publicKey) =>
  b64u(await subtle.exportKey("raw", publicKey));
const importDhPublic = (b64) =>
  subtle.importKey("raw", unb64u(b64),
    { name: "ECDH", namedCurve: "P-256" }, true, []);

const wrapKeyFrom = (priv, pub) =>
  subtle.deriveKey({ name: "ECDH", public: pub }, priv,
    { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);

/** → { eph, wrapped } — send both to the target device. */
export async function wrapUserKey(userKey, theirDhPubB64) {
  const eph = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const wk = await wrapKeyFrom(eph.privateKey, await importDhPublic(theirDhPubB64));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey("raw", userKey, wk, { name: "AES-GCM", iv });
  return { eph: await exportDhPublic(eph.publicKey), iv: b64u(iv), wrapped: b64u(wrapped) };
}

/** → user CryptoKey. Throws if the grant is not for this device. */
export async function unwrapUserKey(myDhPriv, grant) {
  const wk = await wrapKeyFrom(myDhPriv, await importDhPublic(grant.eph));
  return subtle.unwrapKey("raw", unb64u(grant.wrapped), wk,
    { name: "AES-GCM", iv: unb64u(grant.iv) },
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}

/* ------------------------------------------------------------------ *
 * Supporter accounts (Sync § 12.3, 015 slice 4). The account's private
 * key never leaves the device in the clear: it is sealed under an
 * AES-GCM key derived from the passkey's WebAuthn PRF output. The
 * relay stores only the sealed key — a stolen relay dump gives nothing.
 * User keys wrap to the account's public key with the same ephemeral-
 * ECDH grant as device pairing (wrapUserKey / unwrapUserKey above).
 * ------------------------------------------------------------------ */

const ACCOUNT_KDF_INFO = "pip-account-v1";

/** → { pub, priv } — pub is the account public key (b64, like a dh pub);
 *  priv is the PKCS8 bytes to seal and hand the relay. */
export async function genAccountKeys() {
  const kp = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  return { pub: await exportDhPublic(kp.publicKey),
           priv: new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey)) };
}

// The PRF output is a raw 32-byte secret — it is the HKDF input key.
const accountKek = async (prfBytes) =>
  subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256",
      salt: te.encode("pip account kek"),
      info: te.encode(ACCOUNT_KDF_INFO) },
    await subtle.importKey("raw", prfBytes, "HKDF", false, ["deriveKey"]),
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/** Seal the account private key under the passkey's PRF output.
 *  → { iv, sealed } — safe for the relay to hold. */
export async function sealAccountPriv(privPkcs8, prfBytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const kek = await accountKek(prfBytes);
  const sealed = await subtle.encrypt({ name: "AES-GCM", iv }, kek, privPkcs8);
  return { iv: b64u(iv), sealed: b64u(new Uint8Array(sealed)) };
}

/** → account private CryptoKey (ECDH) — unwraps every user-key grant
 *  the relay hands this account. Throws if the PRF output is wrong. */
export const importAccountPriv = (pkcs8) =>
  subtle.importKey("pkcs8",
    typeof pkcs8 === "string" ? unb64u(pkcs8) : pkcs8,
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);

export async function openAccountPriv({ iv, sealed }, prfBytes) {
  const kek = await accountKek(prfBytes);
  const pkcs8 = await subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(iv) }, kek, unb64u(sealed));
  return importAccountPriv(pkcs8);
}
