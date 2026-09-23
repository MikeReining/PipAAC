/**
 * Keys and encryption (docs/product/Sync_And_Web_Editing.md §§ 3–4).
 *
 * One device identity per install: an ECDSA pair (ops and requests are
 * signed) and an ECDH pair (board-key transport in pairing, slice 5).
 * Private keys are non-extractable and live in the platform store —
 * IndexedDB in the browser; tests inject an in-memory store. The board
 * key is AES-256-GCM, kept extractable so pairing can wrap it to a new
 * device; it is never exported in the clear by this module.
 *
 * Wire format: { v: 1, alg: "A256GCM", iv, ct } — iv and ct base64url.
 * A blob envelope adds sha, the SHA-256 hex of the plaintext; the op
 * that references it carries that hash, never the bytes.
 */

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
  const wrap = (mode, fn) => dbp.then((idb) => new Promise((res, rej) => {
    const tx = idb.transaction("keys", mode);
    const req = fn(tx.objectStore("keys"));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  }));
  return {
    get: (k) => wrap("readonly", (s) => s.get(k)),
    put: (k, v) => wrap("readwrite", (s) => s.put(v, k)),
    del: (k) => wrap("readwrite", (s) => s.delete(k)),
  };
}

/* ------------------------------------------------------------------ *
 * Device identity + board key
 * ------------------------------------------------------------------ */

/**
 * The device's key pairs, generated once and kept. Returns
 * { deviceId, sign, verify, dh } where deviceId is the SHA-256
 * fingerprint of the signing public key — the name ops carry.
 */
export async function getDeviceIdentity(store = openKeyStore()) {
  let keys = await store.get("device");
  if (!keys) {
    const sig = await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const dh = await subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
    keys = { sig, dh };
    await store.put("device", keys);
  }
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
 * The board's AES-256-GCM key — one per board, created on first use.
 * Rotations (§ 3 revoke) mint a new key per epoch: epoch 1 lives at
 * "board_key", later epochs at "board_key_e<n>". Old keys stay so old
 * ops still open.
 */
const boardKeyName = (epoch) => (epoch <= 1 ? "board_key" : `board_key_e${epoch}`);
export async function getBoardKey(store = openKeyStore(), epoch = 1) {
  const name = boardKeyName(epoch);
  let key = await store.get(name);
  if (!key) {
    key = await subtle.generateKey(
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
    await store.put(name, key);
  }
  return key;
}
export const putBoardKey = (store, key, epoch = 1) => store.put(boardKeyName(epoch), key);
export const newBoardKey = () =>
  subtle.generateKey({ name: "AES-GCM", length: 256 }, true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);

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

export const sealOp = (key, op) => sealData(key, te.encode(JSON.stringify(op)));
export const openOp = async (key, env) => JSON.parse(td.decode(await openData(key, env)));

/** Blob envelope: { sha, env }. The op carries sha; the bytes travel sealed. */
export async function sealBlob(key, bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return { sha: hex(await subtle.digest("SHA-256", buf)), env: await sealData(key, buf) };
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
 * Board-key transport (pairing + rotation, § 3). The granter makes an
 * ephemeral ECDH pair, derives an AES-GCM wrap key against the target
 * device's long-term dh public key, and wraps the board key. The grant
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
export async function wrapBoardKey(boardKey, theirDhPubB64) {
  const eph = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const wk = await wrapKeyFrom(eph.privateKey, await importDhPublic(theirDhPubB64));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey("raw", boardKey, wk, { name: "AES-GCM", iv });
  return { eph: await exportDhPublic(eph.publicKey), iv: b64u(iv), wrapped: b64u(wrapped) };
}

/** → board CryptoKey. Throws if the grant is not for this device. */
export async function unwrapBoardKey(myDhPriv, grant) {
  const wk = await wrapKeyFrom(myDhPriv, await importDhPublic(grant.eph));
  return subtle.unwrapKey("raw", unb64u(grant.wrapped), wk,
    { name: "AES-GCM", iv: unb64u(grant.iv) },
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}
