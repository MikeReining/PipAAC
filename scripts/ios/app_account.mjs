/**
 * Supporter account facade (phase 044 C5) - PIPCORE.account. The web's
 * account paths from public/board/devices-ui.js and public/shared/
 * account.mjs, minus the DOM and minus the browser's passkey API.
 *
 * The protocol is the shared module's: requestLink, claimToken,
 * accountCredentials, importAccountUsers, shareUserToAccount run
 * UNCHANGED in the core (account.mjs, over the C2 host shims). What the
 * web keeps in closures or behind navigator.credentials is mirrored here:
 *
 *   accountLanding     devices-ui.js ~L369-436   claim -> passkey ->
 *                      import every supported user -> share this
 *                      device's users back (AC-1, AC-2, AC-3)
 *   joinWithToken      devices-ui.js ~L444       join a user's relay
 *                      with a bundle join token
 *   registerAccount    account.mjs ~L121         create passkey, mint the
 *                      account keypair, seal its private half under PRF
 *   signInAccount      account.mjs ~L140         get() assertion, or add
 *                      this device's passkey from the claimed link
 *   createPasskey /    account.mjs ~L87 / ~L103  Swift runs the ceremony
 *   getPasskey         (ASAuthorization, rpId pipaac.org) behind
 *                      hostCall("passkey.create" | "passkey.get")
 *
 * Crypto rule (C2): the account private key and the passkey's PRF output
 * never enter JS. The ceremony leaves the PRF in Swift as an opaque
 * { __pipPrf } handle; "account.create" / "account.open" take that
 * handle; the private key comes back as an ECDH key handle.
 *
 * Results leave as host events (a JSC caller cannot await):
 *   "account.link"    { stage: "sent" | "error", message }
 *   "account.landing" { stage: "say" | "done" | "failed", text, imported? }
 * The signed-in state ({acct_id, email, session}) lives in the keychain
 * under "account/state" (device-only), not in localStorage.
 */
import {
  createAccountKeys, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openAccountPrivWithPrf, openKeyStore, putUserKey,
} from "./host/sync_crypto_host.mjs";
import {
  accountCredentials, claimToken, importAccountUsers, requestLink,
  shareUserToAccount,
} from "../../public/shared/account.mjs";
import { joinDeviceWithToken, relayClient } from "../../public/shared/sync_client.mjs";
import { listUsers } from "../../public/shared/users.mjs";
import { b64uToBytes, bytesToB64u, hostCall } from "./jsc_shims.mjs";

const emit = (name, payload) => globalThis.__pipHost.emit(name, JSON.stringify(payload));
const STATE_NAME = "account/state";

/** Passkeys register on the registrable domain so they are the SAME
 *  passkeys the web uses (account.mjs rpId); a dev host keeps its own. */
export const rpIdFor = (baseUrl) => {
  const h = new URL(baseUrl).host.replace(/:\d+$/, "");
  return h === "pipaac.org" || h.endsWith(".pipaac.org") ? "pipaac.org" : h;
};

/** The emailed link is `<origin>/?signin=<token>`; a person on an iPad
 *  copies it (or just the token) into the app. -> token or null. */
export function signinToken(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const m = /[?&]signin=([^&#\s]+)/.exec(t);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
}

/* ---------------- minimal CBOR + COSE (registration only) ---------------- */

/** One CBOR item -> { v, i } (i = next offset). Covers what an
 *  attestationObject uses: uints, negative ints, byte/text strings,
 *  arrays, maps. Maps decode to Map (keys may be negative ints). */
function cbor(b, i = 0) {
  const ib = b[i++];
  const major = ib >> 5;
  let n = ib & 31;
  if (n === 24) n = b[i++];
  else if (n === 25) { n = (b[i] << 8) | b[i + 1]; i += 2; }
  else if (n === 26) { n = b[i] * 2 ** 24 + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; i += 4; }
  else if (n > 26) throw new Error("cbor: unsupported length");
  switch (major) {
    case 0: return { v: n, i };
    case 1: return { v: -1 - n, i };
    case 2: return { v: b.slice(i, i + n), i: i + n };
    case 3: return { v: new TextDecoder().decode(b.slice(i, i + n)), i: i + n };
    case 4: {
      const out = [];
      for (let k = 0; k < n; k++) { const r = cbor(b, i); out.push(r.v); i = r.i; }
      return { v: out, i };
    }
    case 5: {
      const m = new Map();
      for (let k = 0; k < n; k++) {
        const key = cbor(b, i); const val = cbor(b, key.i);
        m.set(key.v, val.v); i = val.i;
      }
      return { v: m, i };
    }
    default: throw new Error("cbor: unsupported type");
  }
}

/** attestationObject (b64url) -> the credential's public key as the JWK
 *  the Worker stores (what the web gets from SPKI -> exportKey("jwk")).
 *  Only ES256 (-7) / P-256 passkeys: the Worker verifies nothing else. */
export function attestationToJwk(attestationB64u) {
  const att = cbor(b64uToBytes(attestationB64u)).v;
  const auth = att.get("authData");
  if (!(auth instanceof Uint8Array) || auth.length < 55 || !(auth[32] & 0x40)) {
    throw new Error("passkey: no credential data");
  }
  const idLen = (auth[53] << 8) | auth[54];
  const cose = cbor(auth, 55 + idLen).v;
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) {
    throw new Error("passkey: not an ES256 key");
  }
  return { kty: "EC", crv: "P-256", x: bytesToB64u(cose.get(-2)), y: bytesToB64u(cose.get(-3)),
    ext: true, key_ops: ["verify"] };
}

/* ---------------- relay calls the web keeps private to account.mjs ---------------- */

const postJson = async (baseUrl, path, body) => {
  const r = await fetch(`${baseUrl}${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error ?? `http ${r.status}`), { status: r.status });
  return j;
};

/* ---------------- passkey ceremonies (Swift) ---------------- */

/** account.mjs createPasskey: the platform authenticator makes a
 *  passkey for the account; PRF is requested with the account's salt. */
async function createPasskey(baseUrl, { challenge, email, prfSalt }) {
  const r = await hostCall("passkey.create", {
    rpId: rpIdFor(baseUrl), origin: baseUrl, challenge, userId: prfSalt, name: email, prfSalt });
  return { id: r.id, jwk: attestationToJwk(r.attestationObject), prf: r.prf ?? null };
}

/** account.mjs getPasskey: one assertion over the server's challenge. */
async function getPasskey(baseUrl, { challenge, credentialIds, prfSalt }) {
  const r = await hostCall("passkey.get", {
    rpId: rpIdFor(baseUrl), origin: baseUrl, challenge, credentialIds, prfSalt: prfSalt ?? null });
  return { credential_id: r.credential_id, authenticator_data: r.authenticator_data,
    client_data_json: r.client_data_json, signature: r.signature, prf: r.prf ?? null };
}

const randomSalt = () => bytesToB64u(globalThis.crypto.getRandomValues(new Uint8Array(32)));
const cancelled = (e) => /cancel/i.test(String(e?.message ?? e));

/** First sign-in on a fresh account: create the passkey, mint the
 *  account keypair, seal its private key under the PRF output (never in
 *  the clear to the relay), and register. */
export async function registerAccount(baseUrl, { acctId, challenge, email }) {
  const prfSalt = randomSalt();
  const cred = await createPasskey(baseUrl, { challenge, email, prfSalt });
  let prf = cred.prf;
  if (!prf) {
    // Some authenticators evaluate PRF only on get(): one more touch to
    // read it back. The assertion is discarded - only the PRF output is
    // wanted, and the relay never sees this challenge.
    try {
      prf = (await getPasskey(baseUrl, { challenge: randomSalt(), credentialIds: [cred.id], prfSalt })).prf;
    } catch { prf = null; }
  }
  const acct = await createAccountKeys(prf);
  const r = await postJson(baseUrl, `/accounts/${acctId}/register`, {
    challenge, credential_id: cred.id, jwk: cred.jwk, acct_pub: acct.pub,
    sealed_priv: acct.sealed, prf_salt: prfSalt, email });
  return { session: r.session, acctPub: acct.pub, prfOk: !!prf, priv: acct.priv };
}

/** Returning sign-in. A fresh authenticator (the passkey did not sync
 *  here) gets nothing; the claimed email link then authorizes adding
 *  this device's passkey, and it asserts right after. A person who
 *  cancels the sheet is NOT sent on to make a new passkey. */
export async function signInAccount(baseUrl, { acctId, email, linkChallenge }) {
  const { credential_ids, prf_salt } = await accountCredentials(acctId);
  let { challenge } = await postJson(baseUrl, `/accounts/${acctId}/challenge`, {});
  let asn;
  try {
    asn = await getPasskey(baseUrl, { challenge, credentialIds: credential_ids, prfSalt: prf_salt });
  } catch (e) {
    if (cancelled(e)) throw e;
    const cred = await createPasskey(baseUrl, {
      challenge: linkChallenge, email, prfSalt: prf_salt ?? randomSalt() });
    await postJson(baseUrl, `/accounts/${acctId}/credential`, {
      challenge: linkChallenge, credential_id: cred.id, jwk: cred.jwk });
    ({ challenge } = await postJson(baseUrl, `/accounts/${acctId}/challenge`, {}));
    asn = await getPasskey(baseUrl, { challenge, credentialIds: [cred.id], prfSalt: prf_salt });
    if (!asn.prf && cred.prf) asn.prf = cred.prf; // eval output already in hand
  }
  const { prf, ...assertion } = asn;
  const r = await postJson(baseUrl, `/accounts/${acctId}/assert`, { challenge, ...assertion });
  let priv = null;
  if (prf && r.sealed_priv) {
    priv = await openAccountPrivWithPrf(r.sealed_priv, prf).catch(() => null);
  }
  return { session: r.session, bundle: r, priv };
}

/* ---------------- registry seam (Swift owns people.json) ---------------- */

/** users.mjs store contract over the native registry: only the verbs
 *  importAccountUsers / listUsers use. */
const userStore = {
  async keys() { return ((await hostCall("registry.list")) ?? []).map((r) => `user/${r.id}`); },
  async get(k) {
    return k.startsWith("user/") ? ((await hostCall("registry.get", { id: k.slice(5) })) ?? undefined) : undefined;
  },
};
/** users.mjs addUser, for an id the account brought: refresh or insert. */
const addUser = (_store, row) => hostCall("registry.addImported", row);

/** This device joins a user's relay with a bundle join token (devices-ui.js
 *  joinWithToken) - the step after the keys arrive. */
async function joinWithToken(baseUrl, userId, token) {
  const identity = await getDeviceIdentity(openKeyStore());
  return joinDeviceWithToken(baseUrl, userId, {
    token, device_id: identity.deviceId,
    pubkey: await exportPublicKey(identity.verify),
    dh_pub: await exportDhPublic(identity.dh.publicKey) });
}

/* ---------------- the flows ---------------- */

/** Settings -> Your account -> "Send me a link" (devices-ui.js acct-send). */
export function sendLink(baseUrl, email) {
  const addr = String(email ?? "").trim();
  if (!addr.includes("@")) {
    emit("account.link", { stage: "error", message: "Enter an email address first" });
    return { accepted: false };
  }
  requestLink(addr).then(
    () => emit("account.link", { stage: "sent",
      message: "Link sent — open it on the device you want to sign in." }),
    (e) => emit("account.link", { stage: "error",
      message: `Could not send the link (${e.message})` }));
  return { accepted: true };
}

/** The emailed link's token: claim it, run the passkey ceremony, pull
 *  every supported user into the registry (keys unsealed by the
 *  passkey's PRF output), then share this device's own synced users back
 *  to the account (devices-ui.js accountLanding). */
export function land(baseUrl, linkOrToken) {
  const token = signinToken(linkOrToken);
  const say = (text) => emit("account.landing", { stage: "say", text });
  if (!token) {
    emit("account.landing", { stage: "failed",
      text: "That doesn't look like the sign-in link — copy the whole link from the email." });
    return { accepted: false };
  }
  (async () => {
    try {
      say("Checking the link…");
      const claim = await claimToken(token);
      let session, imported = [];
      if (claim.has_credentials) {
        say("Sign in with your passkey…");
        const r = await signInAccount(baseUrl, { acctId: claim.account_id,
          email: claim.email, linkChallenge: claim.challenge });
        session = r.session;
        say("Opening your users…");
        imported = await importAccountUsers({
          bundle: r.bundle, priv: r.priv, keyStore: openKeyStore(), userStore,
          putUserKey, addUser,
          // Keys alone don't pull ops - this device also registers on each
          // unlocked user's relay with a bundle join token.
          joinDevice: (userId, t) => joinWithToken(baseUrl, userId, t) });
        const locked = imported.filter((u) => !u.unlocked).length;
        const unjoined = imported.filter((u) => u.unlocked && !u.joined).length;
        const notes = [];
        if (locked) notes.push(`${locked} locked until an Allow or QR card brings their keys`);
        if (unjoined) notes.push(`${unjoined} couldn't reach their relay — sign in again after a linked device refreshes their access`);
        say(`${imported.length} user(s) added` + (notes.length ? ` — ${notes.join("; ")}.` : "."));
      } else {
        say("Create your passkey…");
        const r = await registerAccount(baseUrl, {
          acctId: claim.account_id, challenge: claim.challenge, email: claim.email });
        session = r.session;
        say(r.prfOk ? "Signed in."
          : "Signed in — this passkey has no PRF, so keys arrive by an Allow or QR card.");
      }
      const ks = openKeyStore();
      await ks.put(STATE_NAME, { acct_id: claim.account_id, email: claim.email, session });
      await shareBack(baseUrl, claim.account_id, session, ks);
      emit("account.landing", { stage: "done", text: "Done — your users are on this device.",
        email: claim.email, imported: imported.map((u) => u.id) });
    } catch (e) {
      emit("account.landing", { stage: "failed",
        text: cancelled(e) ? "Sign-in was cancelled."
          : `Sign-in failed — ${e.message}. Ask for a fresh link and try again.` });
    }
  })();
  return { accepted: true };
}

/** Every synced user this device holds joins the account: wrapped to the
 *  account public key, profile sealed to the user's own key; a small pool
 *  of join tokens so devices that sign in through the account can register
 *  on that user's relay (§ 12.3). The relay still reads nothing. */
export async function shareBack(baseUrl, acctId, session, ks = openKeyStore()) {
  const shared = [];
  for (const u of await listUsers(userStore)) {
    if (!u.sync?.userId) continue;
    const epochs = [];
    for (let e = 1; e <= (u.sync.epoch ?? 1); e++) {
      if (await ks.get(`user/${u.id}/key_e${e}`)) epochs.push(e);
    }
    if (!epochs.length) continue;
    let joinTokens = [];
    try {
      const identity = await getDeviceIdentity(ks);
      const client = relayClient({ userId: u.id, baseUrl, identity,
        userKey: await getUserKey(ks, u.id, u.sync.epoch ?? 1) });
      joinTokens = (await client.mintJoinTokens(4)).tokens ?? [];
    } catch { /* a device not yet on this relay mints nothing */ }
    await shareUserToAccount({
      acctId, session, keyStore: ks, userId: u.id,
      epochs, name: u.name, photo: u.photo, getUserKey, joinTokens });
    shared.push(u.id);
  }
  return shared;
}
