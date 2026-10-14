/**
 * 044 F1 Works Test — App Store purchases land in the one entitlement
 * owner. Real Worker + real relay code over node:sqlite; the JWS chains
 * are built here with a TEST root the Worker is told to trust via the
 * APPSTORE_ROOTS seam (production keeps Apple's real root, asserted
 * below). Assertions read stored relay state and entitled() answers, not
 * the handler's own reply.
 *
 * Run: scripts/test.sh src/worker/appstore.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";

import worker from "./index.js";
import { SupporterAccounts } from "./accounts.js";
import { UserRelay } from "./relay.js";
import { licenseFor } from "./license.mjs";
import { entitled } from "./trial.mjs";
import { APPLE_ROOT_CA_G3_B64, oidBytes } from "./appstore.mjs";
import { PIP_LIFETIME_PRODUCT_ID, PIP_BUNDLE_ID } from "./appstore_product.mjs";

const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const INTERNAL = "internal-secret";
const SECRET = "test-license-secret";

/* ---------------- fakes (as stripe.test.mjs) ---------------- */

function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  return {
    storage: {
      sql: {
        exec: (q, ...params) => {
          const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
          if (reads || params.length) {
            const st = db.prepare(q);
            const rows = reads ? st.all(...params) : (st.run(...params), []);
            return { toArray: () => rows };
          }
          db.exec(q);
          return { toArray: () => [] };
        },
      },
      setAlarm: async () => {},
      getAlarm: async () => null,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
  };
}

function fakeEnv(extra = {}) {
  const accounts = new Map();
  const relays = new Map();
  const env = {
    ACCOUNTS: {
      idFromName: (n) => n,
      get: (name) => {
        if (!accounts.has(name)) accounts.set(name, new SupporterAccounts(fakeCtx(), env));
        return { fetch: (r) => accounts.get(name).fetch(r) };
      },
    },
    RELAY: {
      idFromName: (n) => n,
      get: (name) => {
        if (!relays.has(name)) relays.set(name, new UserRelay(fakeCtx(), env));
        return { fetch: (r) => relays.get(name).fetch(r) };
      },
    },
    _relay: (userId) => relays.get(userId),
    PIP_INTERNAL_SECRET: INTERNAL,
    PIP_LICENSE_SECRET: SECRET,
    ...extra,
  };
  return env;
}

/* ---------------- a tiny X.509 / JWS signer ---------------- */

const enc = new TextEncoder();
const len = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (tag, ...parts) => {
  const body = parts.flatMap((p) => [...p]);
  return Uint8Array.from([tag, ...len(body.length), ...body]);
};
const seq = (...p) => tlv(0x30, ...p);
const oid = (s) => tlv(0x06, oidBytes(s));
const utf8 = (s) => tlv(0x0c, enc.encode(s));
const int = (n) => tlv(0x02, [n]);
const utc = (s) => tlv(0x17, enc.encode(s));
const name = (cn) => seq(tlv(0x31, seq(oid("2.5.4.3"), utf8(cn))));
const ALG = { sha256: "1.2.840.10045.4.3.2", sha384: "1.2.840.10045.4.3.3" };

function newKey(curve) {
  const kp = generateKeyPairSync("ec", { namedCurve: curve });
  return { ...kp, spki: kp.publicKey.export({ type: "spki", format: "der" }) };
}

function makeCert({ cn, issuerCn, key, issuerKey, hash = "sha384", markers = [],
  from = "200101000000Z", to = "400101000000Z" }) {
  const exts = markers.length
    ? tlv(0xa3, seq(...markers.map((m) => seq(oid(m), tlv(0x04, tlv(0x05))))))
    : new Uint8Array();
  const tbs = seq(
    tlv(0xa0, int(2)), int(1), seq(oid(ALG[hash])), name(issuerCn),
    seq(utc(from), utc(to)), name(cn), key.spki, exts);
  const sig = nodeSign(hash, tbs, { key: issuerKey.privateKey, dsaEncoding: "der" });
  return seq(tbs, seq(oid(ALG[hash])), tlv(0x03, [0], sig));
}

const b64 = (b) => Buffer.from(b).toString("base64");
const b64u = (b) => Buffer.from(b).toString("base64url");

/** root (P-384) -> intermediate (P-384) -> leaf (P-256), Apple's OIDs. */
function makePki({ markers = true, to } = {}) {
  const root = newKey("P-384"), mid = newKey("P-384"), leaf = newKey("P-256");
  const rootDer = makeCert({ cn: "Test Root", issuerCn: "Test Root", key: root, issuerKey: root, to });
  const midDer = makeCert({ cn: "Test WWDR", issuerCn: "Test Root", key: mid, issuerKey: root,
    markers: markers ? ["1.2.840.113635.100.6.2.1"] : [], to });
  const leafDer = makeCert({ cn: "Test Leaf", issuerCn: "Test WWDR", key: leaf, issuerKey: mid,
    hash: "sha256", markers: markers ? ["1.2.840.113635.100.6.11.1"] : [], to });
  return { rootDer, x5c: [leafDer, midDer, rootDer].map(b64), leafKey: leaf };
}

function jws(pki, payload, { key = pki.leafKey, x5c = pki.x5c } = {}) {
  const h = b64u(JSON.stringify({ alg: "ES256", x5c }));
  const p = b64u(JSON.stringify(payload));
  const sig = nodeSign("sha256", enc.encode(`${h}.${p}`),
    { key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${b64u(sig)}`;
}

const NOW = Date.now();
const tx = (over = {}) => ({
  transactionId: "2000000111", originalTransactionId: "2000000111",
  bundleId: PIP_BUNDLE_ID, productId: PIP_LIFETIME_PRODUCT_ID, type: "Consumable",
  environment: "Sandbox", appAccountToken: UID, signedDate: NOW, purchaseDate: NOW,
  ...over,
});
const notification = (pki, type, txn, over = {}) => jws(pki, {
  notificationType: type, notificationUUID: `n-${Math.random()}`, signedDate: NOW,
  data: { bundleId: PIP_BUNDLE_ID, environment: "Sandbox",
    ...(txn ? { signedTransactionInfo: jws(pki, txn) } : {}), ...over },
});

const post = (env, path, body) => worker.fetch(new Request(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env);
const redeem = (env, signed, user_id = UID) => post(env, "/api/v1/appstore/redeem", { jws: signed, user_id });
const notify = (env, signedPayload) => post(env, "/api/v1/appstore/notifications", { signedPayload });

/** The relay's stored entitlement answer (internal read — what entitled() trusts). */
const stored = async (env, userId = UID) => (await (await env.RELAY.get(userId).fetch(
  new Request(`https://relay/users/${userId}/internal/entitlement`, {
    headers: { "x-pip-internal": INTERNAL } }))).json());

const world = () => {
  const pki = makePki();
  return { pki, env: fakeEnv({ APPSTORE_ROOTS: [pki.rootDer] }) };
};

/* ---------------- tests ---------------- */

test("the bundled production root is Apple Root CA - G3", () => {
  const der = Buffer.from(APPLE_ROOT_CA_G3_B64, "base64");
  assert.equal(createHash("sha256").update(der).digest("hex"),
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
});

test("a valid transaction grants lifetime once; entitled() follows; replay grants nothing new", async () => {
  const { pki, env } = world();
  const license = await licenseFor(SECRET, UID);
  assert.equal(await entitled(env, UID, license), true, "token alone verifies; entitlement is the relay's");
  assert.equal((await stored(env)).entitlement, "free");

  const signed = jws(pki, tx());
  const res = await redeem(env, signed);
  assert.equal(res.status, 200);
  assert.equal((await stored(env)).entitlement, "lifetime");
  const relay = env._relay(UID);
  assert.equal(relay.metaGet("license_source"), "appstore");
  assert.equal(relay.metaGet("license_ref"), "2000000111");
  const at = relay.metaGet("licensed_at");

  // Duplicate delivery (a retry, Transaction.updates, a second device).
  const again = await redeem(env, signed);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(relay.metaGet("licensed_at"), at, "no second grant was written");
  assert.deepEqual(JSON.parse(relay.metaGet("apple_txns")), { 2000000111: "active" });
  assert.equal((await stored(env)).entitlement, "lifetime");
});

test("wrong bundle, product, environment, user are refused and grant nothing", async () => {
  const { pki, env } = world();
  for (const [over, status, error] of [
    [{ bundleId: "com.evil" }, 403, "wrong_bundle"],
    [{ productId: "org.pipaac.other" }, 403, "wrong_product"],
    [{ environment: "Production" }, 403, "wrong_environment"], // this world allows Sandbox only
    [{ appAccountToken: OTHER }, 403, "wrong_user"],
    [{ appAccountToken: undefined }, 403, "wrong_user"],
  ]) {
    const e = fakeEnv({ APPSTORE_ROOTS: [pki.rootDer], APPSTORE_ENVIRONMENTS: ["Sandbox"] });
    const res = await redeem(e, jws(pki, tx(over)));
    assert.equal(res.status, status);
    assert.equal((await res.json()).error, error);
    assert.equal((await stored(e)).entitlement, "free", JSON.stringify(over));
  }
  // A revoked transaction (already refunded at redeem time) is refused too.
  const res = await redeem(env, jws(pki, tx({ revocationDate: NOW })));
  assert.equal(res.status, 410);
  assert.equal((await stored(env)).entitlement, "free");
});

test("tampered, foreign-signed, untrusted, marker-less and expired chains are rejected", async () => {
  const { pki, env } = world();
  const good = jws(pki, tx());

  // Tampered payload under the original signature.
  const [h, p, s] = good.split(".");
  const forged = JSON.parse(Buffer.from(p, "base64url").toString());
  forged.originalTransactionId = "2000000999";
  assert.equal((await redeem(env, `${h}.${b64u(JSON.stringify(forged))}.${s}`)).status, 403);

  // Right chain, signature by some other key.
  assert.equal((await redeem(env, jws(pki, tx(), { key: newKey("P-256") }))).status, 403);

  // A whole chain from another root.
  const other = makePki();
  assert.equal((await redeem(env, jws(other, tx()))).status, 403);

  // Production keeps Apple's real root: the test chain means nothing there.
  const prod = fakeEnv();
  assert.equal((await redeem(prod, good)).status, 403);

  // Apple's marker OIDs missing (a CA-signed leaf for anything else).
  const plain = makePki({ markers: false });
  const e2 = fakeEnv({ APPSTORE_ROOTS: [plain.rootDer] });
  assert.equal((await redeem(e2, jws(plain, tx()))).status, 403);

  // Certificates not valid when Apple signed.
  const old = makePki({ to: "210101000000Z" });
  const e3 = fakeEnv({ APPSTORE_ROOTS: [old.rootDer] });
  assert.equal((await redeem(e3, jws(old, tx()))).status, 403);

  // Garbage.
  assert.equal((await redeem(env, "not.a.jws")).status, 403);
  assert.equal((await redeem(env, 7)).status, 400);
  assert.equal((await stored(env)).entitlement, "free");
  for (const e of [e2, e3, prod]) assert.equal((await stored(e)).entitlement, "free");
});

test("REFUND revokes exactly what the transaction granted; replays and reversals behave", async () => {
  const { pki, env } = world();
  const license = await licenseFor(SECRET, UID);
  await redeem(env, jws(pki, tx()));
  assert.equal((await stored(env)).entitlement, "lifetime");
  assert.equal(await entitled(env, UID, license), true);

  const refund = notification(pki, "REFUND", tx());
  assert.equal((await notify(env, refund)).status, 200);
  const relay = env._relay(UID);
  assert.equal((await stored(env)).entitlement, "free");
  assert.equal(relay.metaGet("payment_issue"), "refunded");
  assert.equal(await entitled(env, UID, license), false, "a refunded buyer's token stops unlocking");

  // Apple re-delivers: nothing changes, still 200.
  assert.equal((await notify(env, refund)).status, 200);
  assert.equal((await stored(env)).entitlement, "free");

  // The refunded transaction replayed by the app does not reopen the account.
  const replay = await redeem(env, jws(pki, tx()));
  assert.equal(replay.status, 410);
  assert.equal((await stored(env)).entitlement, "free");

  // A NEW purchase does.
  assert.equal((await redeem(env, jws(pki, tx({ transactionId: "2000000222",
    originalTransactionId: "2000000222" })))).status, 200);
  assert.equal((await stored(env)).entitlement, "lifetime");
  assert.equal(relay.metaGet("payment_issue"), null);
  assert.equal(await entitled(env, UID, license), true);

  // Apple reverses a refund of the first one: it is honoured again.
  assert.equal((await notify(env, notification(pki, "REFUND_REVERSED", tx()))).status, 200);
  assert.deepEqual(JSON.parse(relay.metaGet("apple_txns")), { 2000000111: "active", 2000000222: "active" });

  // REVOKE (family sharing) on the second leaves the first holding it.
  await notify(env, notification(pki, "REVOKE", tx({ transactionId: "2000000222",
    originalTransactionId: "2000000222" })));
  assert.equal((await stored(env)).entitlement, "lifetime");
});

test("a refund arriving before the redeem still blocks the grant", async () => {
  const { pki, env } = world();
  await notify(env, notification(pki, "REFUND", tx()));
  assert.equal((await redeem(env, jws(pki, tx()))).status, 410);
  assert.equal((await stored(env)).entitlement, "free");
});

test("an App Store refund does not take back a Stripe or code license", async () => {
  const { pki, env } = world();
  // Granted by another path first (the same internal write Stripe uses).
  await env.RELAY.get(UID).fetch(new Request(`https://relay/users/${UID}/internal/entitlement`, {
    method: "POST", headers: { "x-pip-internal": INTERNAL },
    body: JSON.stringify({ source: "stripe", ref: "cs_1" }) }));
  await redeem(env, jws(pki, tx()));
  assert.equal(env._relay(UID).metaGet("license_source"), "stripe");
  await notify(env, notification(pki, "REFUND", tx()));
  assert.equal((await stored(env)).entitlement, "lifetime");
  assert.equal(env._relay(UID).metaGet("payment_issue"), null);
});

test("other notifications are logged, bad ones refused, other apps ignored", async () => {
  const { pki, env } = world();
  await redeem(env, jws(pki, tx()));
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    const r = await notify(env, notification(pki, "ONE_TIME_CHARGE", tx()));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).logged, "ONE_TIME_CHARGE");
    const foreign = await notify(env, notification(pki, "REFUND", tx({ bundleId: "com.evil" }),
      { bundleId: "com.evil" }));
    assert.equal(foreign.status, 200);
  } finally { console.log = log; }
  assert.ok(lines.some((l) => l.includes('"appstore":"ONE_TIME_CHARGE"')));
  assert.equal((await stored(env)).entitlement, "lifetime", "neither changed anything");

  assert.equal((await notify(env, "x.y.z")).status, 403);
  const other = makePki();
  assert.equal((await notify(env, notification(other, "REFUND", tx()))).status, 403);
  assert.equal((await stored(env)).entitlement, "lifetime");
});

test("the product id is one constant the .storekit file and the app share", async () => {
  assert.equal(PIP_LIFETIME_PRODUCT_ID, "org.pipaac.lifetime.user");
});

test("/api/v1/trial agrees with entitled(): a refunded token is not licensed (App Store and Stripe)", async () => {
  const { pki, env } = world();
  const endsAt = Date.now() + 3 * 86_400_000;
  env.TILE_LEDGER = { idFromName: (n) => n, get: () => ({
    fetch: async () => new Response(JSON.stringify({ endsAt, active: true })) }) };
  const license = await licenseFor(SECRET, UID);
  const trial = async (u = UID, lic = license) => (await (await worker.fetch(new Request(
    "http://localhost/api/v1/trial", { headers: { "x-pip-user": u, "x-pip-license": lic } }), env)).json());

  // Licensed (App Store) and not refunded: unchanged.
  await redeem(env, jws(pki, tx()));
  assert.deepEqual(await trial(), { licensed: true, endsAt: null });
  assert.equal(await entitled(env, UID, license), true);

  // Refunded: the same still-valid token no longer reads as licensed anywhere.
  await notify(env, notification(pki, "REFUND", tx()));
  assert.equal(await entitled(env, UID, license), false);
  assert.deepEqual(await trial(), { licensed: false, endsAt });

  // Stripe-style refund flag, same answer.
  const U2 = "aaaaaaaa-2222-3333-4444-555555555555";
  const lic2 = await licenseFor(SECRET, U2);
  const internal = (route, body) => env.RELAY.get(U2).fetch(new Request(
    `https://relay/users/${U2}/internal/${route}`, {
      method: "POST", headers: { "x-pip-internal": INTERNAL }, body: JSON.stringify(body) }));
  await internal("entitlement", { source: "stripe", ref: "cs_1" });
  assert.equal((await trial(U2, lic2)).licensed, true);
  await internal("payment_issue", { issue: "refunded", revoke: true });
  assert.equal(await entitled(env, U2, lic2), false);
  assert.equal((await trial(U2, lic2)).licensed, false);

  // A trial user (no license presented) is unchanged.
  assert.deepEqual(await trial("bbbbbbbb-2222-3333-4444-555555555555", ""), { licensed: false, endsAt });
});
