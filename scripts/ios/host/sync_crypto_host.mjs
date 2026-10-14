/**
 * iOS build of public/shared/sync_crypto.mjs (044 C2). Same exports, same
 * async signatures; every primitive goes to Swift (PipCrypto / PipKeychain,
 * held byte-compatible by Fixtures/crypto/node.json). Key material never
 * enters JS: a "key" here is an OPAQUE HANDLE
 *     { __pipKey: "<id>", kind: "aes" | "ecdsa-priv" | "ecdsa-pub"
 *                              | "ecdh-priv" | "ecdh-pub" }
 * that names an entry in Swift's handle table. Handles are plain JSON, so
 * they travel through hostCall args unchanged.
 *
 * What stays JS: the create-once locks and read -> derive -> put
 * orchestration (getUserKey, ensureRecoveryRoot, retireRoot, the epoch
 * bundle gather). It is the same sequence as the web module over the same
 * store names; the node suite pins the export surface and drives the
 * whole sync loop through it.
 *
 * Store encoding (names decide, so PipKeychain keeps raw bytes where the
 * web keeps raw values): user/<id>/key_e<n> -> 32 raw key bytes;
 * user/<id>/root -> raw root bytes; every other name -> UTF-8 JSON, with
 * Uint8Array tagged so journals holding roots round-trip.
 */
import { serialized } from "../../../public/shared/bounded.mjs";
import { b64uToBytes, bytesToB64u, hostCall } from "../jsc_shims.mjs";

// Pure name helpers — no crypto, no storage — stay the web module's.
export { retiredRootsName, userKeyName, userRootName }
  from "../../../public/shared/sync_crypto.mjs";
import { retiredRootsName, userKeyName, userRootName }
  from "../../../public/shared/sync_crypto.mjs";

const te = new TextEncoder();
const td = new TextDecoder();
const call = hostCall;
const asBytes = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
const toBytes = (b) => (b instanceof Uint8Array ? b : te.encode(String(b)));
const b64 = (b) => bytesToB64u(asBytes(b));

/* ------------------------------------------------------------------ *
 * Key store — the keychain, by the same names the web uses.
 * ------------------------------------------------------------------ */

const U8 = "__pipU8";
const encodeJson = (v) =>
  JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? { [U8]: bytesToB64u(x) } : x));
const decodeJson = (text) =>
  JSON.parse(text, (_k, x) =>
    x && typeof x === "object" && typeof x[U8] === "string" ? b64uToBytes(x[U8]) : x);

/** In-memory store with the same shape (tests, unlinked sessions). */
export function memoryKeyStore() {
  const m = new Map();
  return {
    async get(k) { return m.get(k); },
    async put(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
  };
}

export function openKeyStore() {
  return {
    async get(name) {
      const r = await call("keystore.get", { name });
      if (r == null) return undefined;
      if (r.k === "key") return r.key;
      if (r.k === "bytes") return b64uToBytes(r.b64);
      return decodeJson(r.text);
    },
    async put(name, v) {
      if (v === undefined) { await call("keystore.del", { name }); return; }
      if (v && typeof v === "object" && v.__pipKey) {
        await call("keystore.put", { name, k: "key", key: v });
      } else if (v instanceof Uint8Array) {
        await call("keystore.put", { name, k: "bytes", b64: b64(v) });
      } else {
        await call("keystore.put", { name, k: "json", text: encodeJson(v) });
      }
    },
    async del(name) { await call("keystore.del", { name }); },
  };
}

/* ------------------------------------------------------------------ *
 * Identity + user keys
 * ------------------------------------------------------------------ */

const createLocks = new Map();
const underLock = (name, fn) =>
  serialized(createLocks, (n) => `pip-create:${n}`, name, fn);

export const exportPublicKey = (publicKey) => call("pubkey.export", { key: publicKey });
export const importPublicKey = (b64u) => call("pubkey.import", { b64: b64u });

/** { deviceId, sign, verify, dh } — Swift creates the pairs once, in the
 *  keychain (device/sign, device/dh), and serializes creation on its
 *  own queue; `store` is accepted for signature parity. */
export async function getDeviceIdentity(_store) {
  return call("identity", {});
}

export async function ensureRecoveryRoot(store = openKeyStore(), userId) {
  const name = userRootName(userId);
  const root = await underLock(name, async () => {
    let r = await store.get(name);
    if (!r) {
      r = globalThis.crypto.getRandomValues(new Uint8Array(16));
      await store.put(name, r);
    }
    return r;
  });
  return root instanceof Uint8Array ? root : new Uint8Array(root);
}

export const deriveEpochKey = (rootBytes, epoch) =>
  call("epochKey.derive", { root: b64(rootBytes), epoch });

export async function getUserKey(store = openKeyStore(), userId, epoch = 1) {
  const name = userKeyName(userId, epoch);
  return underLock(name, async () => {
    let key = await store.get(name);
    if (!key) {
      const root = await store.get(userRootName(userId));
      key = root
        ? await deriveEpochKey(root instanceof Uint8Array ? root : new Uint8Array(root), epoch)
        : await call("aes.generate", {});
      await store.put(name, key);
    }
    return key;
  });
}
export const putUserKey = (store, userId, key, epoch = 1) =>
  store.put(userKeyName(userId, epoch), key);
export const newUserKey = () => call("aes.generate", {});

/* ------------------------------------------------------------------ *
 * Recovery bundle
 * ------------------------------------------------------------------ */

export async function retireRoot(store, userId, oldRootBytes, uptoEpoch) {
  const retired = JSON.parse((await store.get(retiredRootsName(userId))) ?? "[]");
  if (retired.some((r) => r.root === b64(oldRootBytes) && r.upto === uptoEpoch)) return;
  const from = retired.length ? retired[retired.length - 1].upto + 1 : 1;
  retired.push({ from, upto: uptoEpoch, root: b64(oldRootBytes) });
  await store.put(retiredRootsName(userId), JSON.stringify(retired));
}

/** Same gather as the web: a stored key wins; derivation fills gaps
 *  where a covering root is on hand. Sealing itself is Swift's. */
export async function sealEpochBundle(store, userId, newRootBytes, uptoEpoch) {
  const retired = JSON.parse((await store.get(retiredRootsName(userId))) ?? "[]");
  const last = retired[retired.length - 1];
  const current = await store.get(userRootName(userId));
  const keys = {};
  for (let e = 1; e <= uptoEpoch; e++) {
    let key = await store.get(userKeyName(userId, e));
    if (!key) {
      const cov = retired.find((r) => e >= r.from && e <= r.upto);
      const root = cov ? b64uToBytes(cov.root)
        : (current && e > (last?.upto ?? 0)
          ? (current instanceof Uint8Array ? current : new Uint8Array(current))
          : null);
      if (root) key = await deriveEpochKey(root, e);
    }
    if (key) keys[e] = key;
  }
  return call("bundle.seal", { keys, root: b64(newRootBytes) });
}

export async function openEpochBundle(rootBytes, json) {
  return call("bundle.open", { root: b64(rootBytes), json });
}

/* ------------------------------------------------------------------ *
 * Sealing
 * ------------------------------------------------------------------ */

export const sealData = (key, bytes) => call("data.seal", { key, b64: b64(bytes) });
export const openData = async (key, env) =>
  b64uToBytes(await call("data.open", { key, env }));

export const sealOp = (key, op) => call("op.seal", { key, json: JSON.stringify(op) });
export const openOp = async (key, env) => JSON.parse(await call("op.open", { key, env }));

export const sealBlob = (key, bytes, epoch = 1) =>
  call("blob.seal", { key, b64: b64(bytes), epoch });
export const openBlob = async (key, sealed) =>
  b64uToBytes(await call("blob.open", { key, sealed }));

export const sha256Hex = (bytes) => call("sha256hex", { b64: b64(bytes) });

/* ------------------------------------------------------------------ *
 * Device signatures
 * ------------------------------------------------------------------ */

export const signPayload = (signKey, bytes) =>
  call("sign", { key: signKey, b64: b64(toBytes(bytes)) });
export const verifyPayload = (verifyKey, bytes, sig) =>
  call("verify", { key: verifyKey, b64: b64(toBytes(bytes)), sig });

/* ------------------------------------------------------------------ *
 * User-key transport + accounts
 * ------------------------------------------------------------------ */

export const exportDhPublic = (publicKey) => call("dhpub.export", { key: publicKey });
export const wrapUserKey = (userKey, theirDhPubB64) =>
  call("key.wrap", { key: userKey, dhPub: theirDhPubB64 });
export const unwrapUserKey = (myDhPriv, grant) =>
  call("key.unwrap", { key: myDhPriv, grant });

export async function genAccountKeys() {
  const r = await call("account.gen", {});
  return { pub: r.pub, priv: b64uToBytes(r.priv) };
}
export const sealAccountPriv = (privPkcs8, prfBytes) =>
  call("account.seal", { priv: b64(privPkcs8), prf: b64(prfBytes) });
export const importAccountPriv = (pkcs8) =>
  call("account.import", { priv: typeof pkcs8 === "string" ? pkcs8 : b64(pkcs8) });
export const openAccountPriv = ({ iv, sealed }, prfBytes) =>
  call("account.open", { env: { iv, sealed }, prf: b64(prfBytes) });

