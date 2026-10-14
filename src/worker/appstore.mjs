/**
 * 044 F1 — App Store purchases into the one entitlement owner.
 *
 *   POST /api/v1/appstore/redeem         the iPad hands over the signed
 *       transaction (JWS) for one user; we verify it and grant the same
 *       lifetime entitlement the Stripe webhook and license codes grant.
 *   POST /api/v1/appstore/notifications  App Store Server Notifications
 *       V2 (signedPayload). REFUND / REVOKE take back what that
 *       transaction granted; everything else is logged.
 *
 * Both go through the user's relay (`internal/appstore`), which writes
 * the same `entitlement` meta entitled() reads — no parallel owner.
 * Idempotent by originalTransactionId.
 *
 * Verification needs no secret: the JWS carries its x5c chain (leaf,
 * intermediate, root). We check every link's signature (WebCrypto ECDSA
 * over a minimal DER reader), that the top is Apple Root CA - G3 (the
 * public cert bundled below), Apple's marker OIDs on leaf and
 * intermediate, and certificate validity at the transaction's signedDate.
 *
 * Test seams (prod never sets them): env.APPSTORE_ROOTS (array of DER
 * Uint8Array replacing Apple's root), env.APPSTORE_ENVIRONMENTS.
 */
import { PIP_LIFETIME_PRODUCT_ID, PIP_BUNDLE_ID } from "./appstore_product.mjs";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const bad = (error, status = 400) => json({ error }, { status });

/** Apple Root CA - G3 (public; sha256 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:
 *  7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79, expires 2039-04-30).
 *  From https://www.apple.com/certificateauthority/AppleRootCA-G3.cer */
export const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

/** Apple's marker extensions: receipt-signing leaf, WWDR intermediate. */
const OID_LEAF = "1.2.840.113635.100.6.11.1";
const OID_INTERMEDIATE = "1.2.840.113635.100.6.2.1";

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (s) => b64(s.replaceAll("-", "+").replaceAll("_", "/")
  .padEnd(Math.ceil(s.length / 4) * 4, "="));
const td = new TextDecoder();
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ---------------- minimal DER / X.509 ---------------- */

function tlv(b, o) {
  let len = b[o + 1], hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[o + 2 + i];
    hdr = 2 + n;
  }
  return { tag: b[o], off: o, start: o + hdr, end: o + hdr + len };
}
function kids(b, node) {
  const out = [];
  for (let o = node.start; o < node.end;) { const t = tlv(b, o); out.push(t); o = t.end; }
  return out;
}
function oidOf(b, node) {
  const v = b.subarray(node.start, node.end);
  const out = [Math.floor(v[0] / 40), v[0] % 40];
  let n = 0;
  for (let i = 1; i < v.length; i++) {
    n = n * 128 + (v[i] & 0x7f);
    if (!(v[i] & 0x80)) { out.push(n); n = 0; }
  }
  return out.join(".");
}
function timeOf(b, node) {
  const s = td.decode(b.subarray(node.start, node.end));
  const g = node.tag === 0x18;
  const yy = g ? Number(s.slice(0, 4))
    : (Number(s.slice(0, 2)) >= 50 ? 1900 : 2000) + Number(s.slice(0, 2));
  const r = s.slice(g ? 4 : 2);
  return Date.UTC(yy, Number(r.slice(0, 2)) - 1, Number(r.slice(2, 4)),
    Number(r.slice(4, 6)), Number(r.slice(6, 8)), Number(r.slice(8, 10)));
}
const HASH = { "1.2.840.10045.4.3.2": "SHA-256", "1.2.840.10045.4.3.3": "SHA-384" };
const CURVE = { "1.2.840.10045.3.1.7": ["P-256", 32], "1.3.132.0.34": ["P-384", 48] };

export function oidBytes(oid) {
  const p = oid.split(".").map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const n of p.slice(2)) {
    const parts = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) parts.unshift((v & 0x7f) | 0x80);
    out.push(...parts);
  }
  return out;
}

function parseCert(der) {
  const cert = tlv(der, 0);
  const [tbs, sigAlg, sigBits] = kids(der, cert);
  const t = kids(der, tbs);
  const i = t[0].tag === 0xa0 ? 1 : 0;
  const [issuer, validity, subject, spki] = [t[i + 2], t[i + 3], t[i + 4], t[i + 5]];
  const [from, to] = kids(der, validity);
  const alg = kids(der, spki)[0];
  const curve = CURVE[oidOf(der, kids(der, alg)[1])];
  const raw = (n) => [...der.subarray(n.off, n.end)].join(",");
  return {
    der,
    tbs: der.subarray(tbs.off, tbs.end),
    sigOid: oidOf(der, kids(der, sigAlg)[0]),
    sig: der.subarray(sigBits.start + 1, sigBits.end),
    issuer: raw(issuer), subject: raw(subject),
    notBefore: timeOf(der, from), notAfter: timeOf(der, to),
    spki: der.subarray(spki.off, spki.end),
    curve,
    // Marker OIDs live in extensions; an exact byte search is enough for
    // a certificate the pinned root already vouches for.
    has: (oid) => {
      const enc = oidBytes(oid);
      for (let k = 0; k + enc.length <= der.length; k++) {
        let ok = true;
        for (let j = 0; j < enc.length && ok; j++) ok = der[k + j] === enc[j];
        if (ok) return true;
      }
      return false;
    },
  };
}

/** X.509 ECDSA signatures are DER SEQUENCE{r,s}; WebCrypto wants r||s. */
function derToRaw(sig, size) {
  const out = new Uint8Array(size * 2);
  kids(sig, tlv(sig, 0)).slice(0, 2).forEach((n, k) => {
    let v = sig.subarray(n.start, n.end);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error("bad_jws:sig");
    out.set(v, k * size + (size - v.length));
  });
  return out;
}

async function importKey(cert) {
  if (!cert.curve) throw new Error("bad_jws:curve");
  return crypto.subtle.importKey("spki", cert.spki,
    { name: "ECDSA", namedCurve: cert.curve[0] }, false, ["verify"]);
}

async function signedBy(cert, issuer) {
  const hash = HASH[cert.sigOid];
  if (!hash || cert.issuer !== issuer.subject) return false;
  const raw = derToRaw(cert.sig, issuer.curve?.[1] ?? 32);
  return crypto.subtle.verify({ name: "ECDSA", hash }, await importKey(issuer), raw, cert.tbs);
}

/* ---------------- JWS ---------------- */

/** Verify an Apple-signed JWS; returns its decoded payload. Throws
 *  Error("bad_jws:<why>") on anything wrong. */
export async function verifyAppleJws(env, jws) {
  const parts = String(jws ?? "").split(".");
  if (parts.length !== 3) throw new Error("bad_jws:shape");
  let header, payload, chain, roots;
  try {
    header = JSON.parse(td.decode(b64u(parts[0])));
    payload = JSON.parse(td.decode(b64u(parts[1])));
    if (header.alg !== "ES256" || !Array.isArray(header.x5c)
        || header.x5c.length < 2 || header.x5c.length > 3) throw new Error("header");
    chain = header.x5c.map((c) => parseCert(b64(c)));
    roots = (env.APPSTORE_ROOTS ?? [b64(APPLE_ROOT_CA_G3_B64)]).map(parseCert);
  } catch { throw new Error("bad_jws:parse"); }

  // The top of the chain is a trusted root, or signed by one.
  const top = chain[chain.length - 1];
  let anchored = roots.some((r) => eq(r.der, top.der));
  for (const r of roots) if (!anchored && await signedBy(top, r)) anchored = true;
  if (!anchored) throw new Error("bad_jws:root");
  for (let i = 0; i + 1 < chain.length; i++) {
    if (!(await signedBy(chain[i], chain[i + 1]))) throw new Error("bad_jws:chain");
  }
  if (!chain[0].has(OID_LEAF) || !chain[1].has(OID_INTERMEDIATE)) throw new Error("bad_jws:oid");
  // Valid at the moment Apple signed it (a restore may carry an old one).
  const at = Number(payload.signedDate) || Date.now();
  for (const c of chain) if (at < c.notBefore || at > c.notAfter) throw new Error("bad_jws:expired");

  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" },
    await importKey(chain[0]), b64u(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("bad_jws:signature");
  return payload;
}

/* ---------------- relay ledger (the one entitlement owner) ---------------- */

const internalSecret = (env) => env.PIP_INTERNAL_SECRET ?? env.PIP_LICENSE_SECRET;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function relayOp(env, userId, op, otid) {
  const secret = internalSecret(env);
  if (!env.RELAY || !secret) return null;
  const res = await env.RELAY.get(env.RELAY.idFromName(userId)).fetch(
    new Request(`https://relay/users/${userId}/internal/appstore`, {
      method: "POST", headers: { "x-pip-internal": secret },
      body: JSON.stringify({ op, otid }),
    }));
  return res.ok ? res.json() : null;
}

const allowedEnv = (env, e) => (env.APPSTORE_ENVIRONMENTS ?? ["Production", "Sandbox"]).includes(e);

/** Common transaction checks; returns an error string or null. */
function txProblem(env, tx) {
  if (tx.bundleId !== PIP_BUNDLE_ID) return "wrong_bundle";
  if (tx.productId !== PIP_LIFETIME_PRODUCT_ID) return "wrong_product";
  if (!allowedEnv(env, tx.environment)) return "wrong_environment";
  if (!tx.originalTransactionId) return "bad_transaction";
  return null;
}

/** POST /api/v1/appstore/redeem {jws, user_id} */
export async function handleAppStoreRedeem(request, env) {
  const body = await request.json().catch(() => null);
  const userId = String(body?.user_id ?? "").toLowerCase();
  if (!UUID.test(userId) || typeof body?.jws !== "string") return bad("bad_request");
  let tx;
  try { tx = await verifyAppleJws(env, body.jws); }
  catch { return bad("bad_signature", 403); }
  const problem = txProblem(env, tx);
  if (problem) return bad(problem, 403);
  // The purchase was made for exactly one user (appAccountToken); a
  // transaction cannot be moved onto another board.
  if (String(tx.appAccountToken ?? "").toLowerCase() !== userId) return bad("wrong_user", 403);
  const otid = String(tx.originalTransactionId);
  if (tx.revocationDate) {
    await relayOp(env, userId, "revoke", otid);
    return bad("revoked", 410);
  }
  const r = await relayOp(env, userId, "grant", otid);
  if (!r) return bad("grant_failed", 502);
  // A refunded transaction replayed is `duplicate` and not entitled: say so.
  const owned = r.entitlement === "lifetime";
  return json({ ok: owned, entitlement: r.entitlement, duplicate: r.duplicate === true },
    { status: owned ? 200 : 410 });
}

/** POST /api/v1/appstore/notifications {signedPayload} (V2) */
export async function handleAppStoreNotification(request, env) {
  const body = await request.json().catch(() => null);
  let n;
  try { n = await verifyAppleJws(env, body?.signedPayload); }
  catch { return bad("bad_signature", 403); }
  const type = String(n.notificationType ?? "");
  const data = n.data ?? {};
  const log = (extra = {}) => console.log(JSON.stringify({
    appstore: type, subtype: n.subtype ?? null, uuid: n.notificationUUID ?? null, ...extra }));
  const skip = (why) => { log({ ignored: why }); return json({ ok: true, ignored: why }); };
  if (data.bundleId && data.bundleId !== PIP_BUNDLE_ID) return skip("wrong_bundle");
  if (data.environment && !allowedEnv(env, data.environment)) return skip("wrong_environment");
  const action = { REFUND: "revoke", REVOKE: "revoke", REFUND_REVERSED: "restore" }[type];
  if (!action || !data.signedTransactionInfo) { log(); return json({ ok: true, logged: type || "unknown" }); }

  let tx;
  try { tx = await verifyAppleJws(env, data.signedTransactionInfo); }
  catch { return bad("bad_signature", 403); }
  const problem = txProblem(env, tx);
  const userId = String(tx.appAccountToken ?? "").toLowerCase();
  if (problem || !UUID.test(userId)) return skip(problem ?? "no_user");
  const r = await relayOp(env, userId, action, String(tx.originalTransactionId));
  if (!r) return bad("relay_failed", 502); // Apple retries a non-200
  log({ user: userId, otid: tx.originalTransactionId, entitlement: r.entitlement });
  return json({ ok: true, entitlement: r.entitlement });
}
