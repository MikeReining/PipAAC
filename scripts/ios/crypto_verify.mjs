/**
 * Shared by the crypto fixture exporter and the swift.json parity test:
 * the fixed test keys, and `verifyDoc` — opens/verifies every entry of a
 * crypto fixture document with public/shared/sync_crypto.mjs (WebCrypto).
 * Node and Swift write the SAME schema; this verifier is the one judge.
 * All binary values are base64url, as on the wire.
 */
import { createECDH, createHash } from "node:crypto";
import {
  deriveEpochKey, exportDhPublic, exportPublicKey, importAccountPriv,
  importPublicKey, openAccountPriv, openBlob, openData, openEpochBundle,
  openOp, sha256Hex, unwrapUserKey, verifyPayload,
} from "../../public/shared/sync_crypto.mjs";

const subtle = globalThis.crypto.subtle;
export const b64u = (buf) => Buffer.from(buf).toString("base64url");
export const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

/** Fixed test material — deterministic from labels, never real secrets. */
const seed = (label) =>
  new Uint8Array(createHash("sha256").update(`pip-crypto-fixture:${label}`).digest());
export const FIXED = {
  aes: seed("aes"),
  aes2: seed("aes2"),
  root: seed("root").subarray(0, 16),
  root2: seed("root2").subarray(0, 16),
  signD: seed("sign"),
  dhD: seed("dh"),
  prf: seed("prf"),
};

const ecPub = (d) => {
  const e = createECDH("prime256v1");
  e.setPrivateKey(Buffer.from(d));
  return new Uint8Array(e.getPublicKey()); // 0x04 || x || y
};
const jwk = (d, withD) => {
  const pub = ecPub(d);
  return {
    kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)),
    ...(withD ? { d: b64u(d) } : {}),
  };
};
export const dhPubRaw = (d) => ecPub(d);
const imp = (d, withD, name, usages) =>
  subtle.importKey("jwk", jwk(d, withD), { name, namedCurve: "P-256" }, true, usages);
export const importSignPriv = (d) => imp(d, true, "ECDSA", ["sign"]);
export const importSignPub = (d) => imp(d, false, "ECDSA", ["verify"]);
export const importDhPriv = (d) => imp(d, true, "ECDH", ["deriveKey"]);
export const importDhPub = (d) => imp(d, false, "ECDH", []);
export const importAesRaw = (raw) =>
  subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
const rawOf = async (key) => new Uint8Array(await subtle.exportKey("raw", key));

const eq = (name, a, b) => {
  if (!same(a, b)) throw new Error(`${name}: mismatch`);
};
const eqJson = (name, a, b) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${name}: mismatch`);
};
/** Rows in `doc.cases[name]`, or fail — a missing primitive is a failure. */
const rows = (doc, name) => {
  const r = doc.cases?.[name];
  if (!Array.isArray(r) || r.length === 0) throw new Error(`no cases for ${name}`);
  return r;
};

const verifiers = {
  async deriveEpochKey(c) {
    eq("deriveEpochKey", await rawOf(await deriveEpochKey(unb64u(c.root), c.epoch)), unb64u(c.key));
  },
  async sealData(c) {
    eq("openData", await openData(await importAesRaw(unb64u(c.key)), c.env), unb64u(c.plain));
  },
  async sealOp(c) {
    const key = await importAesRaw(unb64u(c.key));
    eqJson("openOp", await openOp(key, c.env), JSON.parse(c.opJson));
    const marker = (await openData(key, c.env))[0] === 0;
    if (marker !== c.compressed) throw new Error(`sealOp: compressed marker ${marker} != ${c.compressed}`);
  },
  async sealBlob(c) {
    const key = await importAesRaw(unb64u(c.key));
    eq("openBlob", await openBlob(key, c.sealed), unb64u(c.plain));
    if (c.sealed.env.e !== c.epoch) throw new Error("sealBlob: epoch");
  },
  async sha256Hex(c) {
    if (await sha256Hex(unb64u(c.bytes)) !== c.hex) throw new Error("sha256Hex");
  },
  async signPayload(c) {
    const pub = await importPublicKey(c.pub); // importPublicKey
    const ok = await verifyPayload(pub, unb64u(c.payload), c.sig);
    if (ok !== c.valid) throw new Error(`verifyPayload: got ${ok}, want ${c.valid}`);
  },
  async exportPublicKey(c) {
    if (await exportPublicKey(await importSignPub(unb64u(c.d))) !== c.spki) {
      throw new Error("exportPublicKey");
    }
  },
  async exportDhPublic(c) {
    if (await exportDhPublic(await importDhPub(unb64u(c.d))) !== c.raw) {
      throw new Error("exportDhPublic");
    }
  },
  async wrapUserKey(c) {
    const priv = await importDhPriv(unb64u(c.recipientD));
    eq("unwrapUserKey", await rawOf(await unwrapUserKey(priv, c.grant)), unb64u(c.userKey));
  },
  async epochBundle(c) {
    const out = await openEpochBundle(unb64u(c.root), c.json);
    eqJson("bundle epochs", Object.keys(out).sort(), Object.keys(c.keys).sort());
    for (const [e, k] of Object.entries(out)) eq(`bundle e${e}`, await rawOf(k), unb64u(c.keys[e]));
  },
  async accountPriv(c) {
    const key = await openAccountPriv(c.sealed, unb64u(c.prf));
    // the stated plaintext PKCS8 must itself import, be the sealed key,
    // and belong to `pub`
    const stated = await importAccountPriv(unb64u(c.priv));
    const j = await subtle.exportKey("jwk", key);
    const j2 = await subtle.exportKey("jwk", stated);
    if (j2.d !== j.d) throw new Error("accountPriv: sealed key != stated priv");
    const raw = Buffer.concat([
      Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url"),
    ]);
    if (b64u(raw) !== c.pub) throw new Error("accountPriv: pub does not match key");
  },
};

export const PRIMITIVES = Object.keys(verifiers);

/** Verify every case; returns { primitive: count }. Throws on first failure. */
export async function verifyDoc(doc) {
  const counts = {};
  for (const name of PRIMITIVES) {
    const list = rows(doc, name);
    for (const [i, c] of list.entries()) {
      try { await verifiers[name](c); }
      catch (e) { throw new Error(`${name}[${i}]: ${e.message}`); }
    }
    counts[name] = list.length;
  }
  return counts;
}
