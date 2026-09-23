/**
 * 015 slice 4 Works Test — supporter accounts (heavy: spawns
 * `wrangler dev`).
 *
 * A "browser" requests an email link (dev mailbox), claims it, and
 * registers a passkey — simulated by a fresh ECDSA key whose signatures
 * are crafted exactly as a platform authenticator crafts them. The
 * account private key is sealed under a stand-in PRF secret on the
 * client side; the relay stores only the sealed bytes. A user's keys
 * wrap to the account public key. A second "browser" signs in with the
 * same passkey: the sealed bundle comes back, the PRF unseals the
 * account key, and the wrapped user key opens real ops. A forged
 * signature and a replayed link token get 403. Every relay payload is
 * scanned — no user key bytes in the clear.
 *
 * Run: scripts/test.sh src/worker/accounts.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  genAccountKeys, getUserKey, memoryKeyStore, openAccountPriv, openOp,
  sealAccountPriv, sealOp, unwrapUserKey, wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { b64u, unb64u } from "./webauthn.mjs";

const PORT = 8881;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const RP_ID = "127.0.0.1";
const repoRoot = join(import.meta.dirname, "../..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;
before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-acct-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
  }
  throw new Error("wrangler dev did not come up");
});
after(() => { wrangler?.kill("SIGTERM"); });

const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/* A platform authenticator's assertion, crafted in Node: DER signature
 * over authenticatorData ‖ SHA-256(clientDataJSON), where authData is
 * rpIdHash ‖ flags(UP) ‖ signCount. */
const derEncode = (r, s) => {
  const int = (x) => {
    let b = x[0] & 0x80 ? [0, ...x] : [...x];
    return [0x02, b.length, ...b];
  };
  const seq = [...int(r), ...int(s)];
  return new Uint8Array([0x30, seq.length, ...seq]);
};
const sha256 = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

const makeAssertion = async (keyPair, challenge) => {
  const rpHash = await sha256(new TextEncoder().encode(RP_ID));
  const authData = new Uint8Array(37);
  authData.set(rpHash);
  authData[32] = 0x01; // user present
  const clientData = JSON.stringify({
    type: "webauthn.get", challenge, origin: ORIGIN });
  const clientHash = await sha256(new TextEncoder().encode(clientData));
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData); signed.set(clientHash, authData.length);
  const p1363 = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, signed));
  return {
    authenticator_data: b64u(authData),
    client_data_json: b64u(new TextEncoder().encode(clientData)),
    signature: b64u(derEncode(p1363.slice(0, 32), p1363.slice(32))),
  };
};

test("sign in by email + passkey; keys stay sealed end to end", async () => {
  // Browser A asks for the link — dev mode returns it in the response
  // and the dev mailbox (no Email Service destination in wrangler dev).
  const link = await post("/accounts/link", { email: "Parent@Example.com" });
  assert.equal(link.status, 200);
  assert.ok(link.body.dev_link.includes("/?signin="));
  const mail = await fetch(
    `${BASE}/accounts/dev/mailbox?email=parent@example.com`).then((r) => r.json());
  assert.equal(mail.link, link.body.dev_link, "mailbox normalized the email");

  const token = new URL(mail.link).searchParams.get("signin");

  // Claim the link → the account has no credentials yet.
  const claim = await post("/accounts/claim", { token });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.has_credentials, false);
  const acctId = claim.body.account_id;
  assert.ok(/^acct_[0-9a-f]+$/.test(acctId));

  // The passkey ceremony (simulated): a fresh credential keypair; the
  // account keypair is minted on-device and sealed under the PRF secret —
  // the relay only ever holds the sealed bytes.
  const cred = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const credJwk = await crypto.subtle.exportKey("jwk", cred.publicKey);
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const prfSalt = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const acct = await genAccountKeys();
  const sealed = await sealAccountPriv(acct.priv, prf);
  // A self-minted challenge is NOT the link's authorization — register
  // and credential-add both refuse it.
  const selfCh = await post(`/accounts/${acctId}/challenge`, {});
  const rogue = await post(`/accounts/${acctId}/register`, {
    challenge: selfCh.body.challenge,
    credential_id: "cred-rogue",
    jwk: credJwk,
    acct_pub: acct.pub,
    sealed_priv: sealed,
    prf_salt: prfSalt,
    email: "parent@example.com",
  });
  assert.equal(rogue.status, 403);
  assert.equal(rogue.body.error, "link_required");
  const selfCh2 = await post(`/accounts/${acctId}/challenge`, {});
  const rogueCred = await post(`/accounts/${acctId}/credential`, {
    challenge: selfCh2.body.challenge,
    credential_id: "cred-rogue",
    jwk: credJwk,
  });
  assert.equal(rogueCred.status, 403);

  const reg = await post(`/accounts/${acctId}/register`, {
    challenge: claim.body.challenge,
    credential_id: "cred-1",
    jwk: credJwk,
    acct_pub: acct.pub,
    sealed_priv: sealed,
    prf_salt: prfSalt,
    email: "parent@example.com",
  });
  assert.equal(reg.status, 200);
  const sessionA = reg.body.session;
  assert.ok(sessionA);

  // A wraps a user's epoch keys to the account public key — exactly the
  // grant a linked device gets — plus a profile sealed to the account.
  const keyStore = memoryKeyStore();
  const userKey = await getUserKey(keyStore, "u-maya", 2);
  const userKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", userKey));
  const grant = await wrapUserKey(userKey, acct.pub);
  const add = await post(`/accounts/${acctId}/users`, {
    session: sessionA,
    user_id: "u-maya",
    keys: [{ epoch: 2, grant }],
    sealed_profile: { iv: "x", data: "y" },
  });
  assert.equal(add.status, 200);

  // Payload scan: nothing the relay stored carries the raw user key.
  const bundleProbe = await fetch(`${BASE}/accounts/${acctId}/credentials`)
    .then((r) => r.json());
  const relaySeen = JSON.stringify({ grant, sealed, bundleProbe });
  const rawHex = Buffer.from(userKeyRaw).toString("base64");
  assert.ok(!relaySeen.includes(rawHex), "user key bytes visible on the wire");

  // Browser B signs in: pre-flight gives credential ids + the PRF salt.
  const creds = await fetch(`${BASE}/accounts/${acctId}/credentials`).then((r) => r.json());
  assert.deepEqual(creds.credential_ids, ["cred-1"]);
  assert.equal(creds.prf_salt, prfSalt);

  const ch = await post(`/accounts/${acctId}/challenge`, {});
  const asn = await makeAssertion(cred, ch.body.challenge);
  const badAsn = await post(`/accounts/${acctId}/assert`, {
    challenge: ch.body.challenge, credential_id: "cred-1", ...asn,
    signature: b64u(crypto.getRandomValues(new Uint8Array(70))),
  });
  assert.equal(badAsn.status, 403, "forged signature must not sign in");

  const ch2 = await post(`/accounts/${acctId}/challenge`, {});
  const good = await post(`/accounts/${acctId}/assert`, {
    challenge: ch2.body.challenge, credential_id: "cred-1",
    ...(await makeAssertion(cred, ch2.body.challenge)),
  });
  assert.equal(good.status, 200);
  assert.equal(good.body.users[0].user_id, "u-maya");
  assert.equal(good.body.users[0].keys[0].epoch, 2);

  // B unseals the account key with the same PRF secret and unwraps the
  // user's epoch-2 key — it opens a real op.
  const privB = await openAccountPriv(good.body.sealed_priv, prf);
  const keyB = await unwrapUserKey(privB, good.body.users[0].keys[0].grant);
  const op = { kind: "set_setting", args: { key: "spot_boost", value: 1 } };
  assert.deepEqual(await openOp(keyB, await sealOp(userKey, op)), op);

  // Re-registering — even with a fresh authorized link — can never
  // overwrite the account's public key or sealed private key.
  const link2 = await post("/accounts/link", { email: "parent@example.com" });
  const claim2 = await post("/accounts/claim", {
    token: new URL(link2.body.dev_link).searchParams.get("signin") });
  const reReg = await post(`/accounts/${acctId}/register`, {
    challenge: claim2.body.challenge,
    credential_id: "cred-x",
    jwk: credJwk,
    acct_pub: "attacker-pub",
    sealed_priv: { iv: "x", data: "y" },
    prf_salt: "zz",
    email: "parent@example.com",
  });
  assert.equal(reReg.status, 409);

  // A claimed link adds a second credential to the same account; the
  // account identity is untouched and the new credential signs in.
  const cred2 = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const link3 = await post("/accounts/link", { email: "parent@example.com" });
  const claim3 = await post("/accounts/claim", {
    token: new URL(link3.body.dev_link).searchParams.get("signin") });
  const addCred = await post(`/accounts/${acctId}/credential`, {
    challenge: claim3.body.challenge,
    credential_id: "cred-2",
    jwk: await crypto.subtle.exportKey("jwk", cred2.publicKey),
  });
  assert.equal(addCred.status, 200);
  const st = await fetch(`${BASE}/accounts/${acctId}/state`).then((r) => r.json());
  assert.equal(st.acct_pub, acct.pub, "credential-add rewrote acct_pub");
  const ch3 = await post(`/accounts/${acctId}/challenge`, {});
  const good2 = await post(`/accounts/${acctId}/assert`, {
    challenge: ch3.body.challenge, credential_id: "cred-2",
    ...(await makeAssertion(cred2, ch3.body.challenge)),
  });
  assert.equal(good2.status, 200);
  assert.equal(good2.body.users[0].user_id, "u-maya");

  // The used link token is dead — a replay gets 403.
  const replay = await post("/accounts/claim", { token });
  assert.equal(replay.status, 403);
});
