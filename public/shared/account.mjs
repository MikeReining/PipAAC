/**
 * Supporter accounts (Sync § 12.3, 015 slice 4) — the device side.
 *
 * A supporter signs in with an emailed link and a passkey. The passkey's
 * WebAuthn PRF output derives the key that unseals the account private
 * key ON THIS DEVICE — the relay only ever holds the sealed bytes. Each
 * supported user's keys wrap to the account public key exactly as they
 * wrap to a linked device (sync § 3); a new device unwraps them with
 * the unsealed account private key.
 *
 * Without PRF the sign-in still works — the user list and purchases
 * appear, the keys stay locked until an Allow on another device or a
 * QR card.
 */
import {
  genAccountKeys, importAccountPriv, openAccountPriv, sealAccountPriv,
  sealBlob, openBlob, wrapUserKey, unwrapUserKey,
} from "./sync_crypto.mjs";
import { kv } from "./platform.mjs";
import { getUser } from "./users.mjs";

const te = new TextEncoder();
const td = new TextDecoder();
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b)))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64u = (s) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const post = async (path, body) => {
  const r = await fetch(path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `http ${r.status}`);
  return j;
};
const get = async (path) => {
  const r = await fetch(path);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `http ${r.status}`);
  return j;
};

/* --- sign-in state (device-local) --- */
const LS_KEY = "pip_account";
export const accountState = () => {
  try { return JSON.parse(kv.getItem(LS_KEY) ?? "null"); }
  catch { return null; }
};
export const saveAccountState = (s) =>
  s ? kv.setItem(LS_KEY, JSON.stringify(s))
    : kv.removeItem(LS_KEY);

/** Delete the account (015 slice 7): removes this account's access on
 *  every user's relay, then the account itself. The users, their
 *  devices, license and QR cards are untouched. */
export const deleteAccount = async (acctId, session) => {
  const r = await fetch(
    `/accounts/${acctId}?session=${encodeURIComponent(session)}`,
    { method: "DELETE" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `http ${r.status}`);
  return j;
};

/* --- the magic link --- */
export const requestLink = (email) => post("/accounts/link", { email });
export const claimToken = (token) => post("/accounts/claim", { token });
export const accountCredentials = (acctId) =>
  get(`/accounts/${acctId}/credentials`);
export const accountPub = async (acctId) =>
  (await get(`/accounts/${acctId}/state`)).acct_pub;

/* --- passkey ceremonies (WebAuthn, ES256, PRF extension) --- */
// Passkeys register on the registrable domain so credentials survive host
// moves within pipaac.org (e.g. marketing root ↔ app.); other hosts
// (localhost dev) omit rp.id and default to the request host.
const rpId = () => {
  const h = globalThis.location?.hostname ?? "";
  return h === "pipaac.org" || h.endsWith(".pipaac.org") ? "pipaac.org" : undefined;
};
async function createPasskey({ challenge, email, acctId, prfSalt }) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: unb64u(challenge),
    rp: { name: "Pip AAC", ...(rpId() ? { id: rpId() } : {}) },
    user: { id: unb64u(prfSalt), name: email, displayName: email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    extensions: { prf: { eval: { first: unb64u(prfSalt) } } },
  }});
  const ext = cred.getClientExtensionResults();
  const prf = ext?.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null;
  const der = cred.response.getPublicKey();
  const pub = await crypto.subtle.importKey("spki", der,
    { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return { id: b64u(cred.rawId), jwk: await crypto.subtle.exportKey("jwk", pub), prf };
}

async function getPasskey({ challenge, credentialIds, prfSalt }) {
  const asn = await navigator.credentials.get({ publicKey: {
    challenge: unb64u(challenge),
    ...(rpId() ? { rpId: rpId() } : {}),
    allowCredentials: credentialIds.map((id) => ({ type: "public-key", id: unb64u(id) })),
    extensions: prfSalt ? { prf: { eval: { first: unb64u(prfSalt) } } } : {},
  }});
  const ext = asn.getClientExtensionResults();
  return {
    credential_id: b64u(asn.rawId),
    authenticator_data: b64u(asn.response.authenticatorData),
    client_data_json: b64u(asn.response.clientDataJSON),
    signature: b64u(asn.response.signature),
    prf: ext?.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
  };
}

/** First sign-in on a fresh account: create the passkey, mint the
 *  account keypair on-device, seal the private key under the PRF output
 *  (never in the clear to the relay), and register. */
export async function registerAccount({ acctId, challenge, email }) {
  const prfSalt = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const cred = await createPasskey({ challenge, email, acctId, prfSalt });
  const acct = await genAccountKeys();
  const sealed = cred.prf ? await sealAccountPriv(acct.priv, cred.prf) : null;
  const r = await post(`/accounts/${acctId}/register`, {
    challenge, credential_id: cred.id, jwk: cred.jwk, acct_pub: acct.pub,
    sealed_priv: sealed, prf_salt: prfSalt, email });
  // The private key was minted here — hand it back so a first sign-in
  // can unwrap grants too (invites land on fresh accounts, 015 s5).
  return { session: r.session, acctPub: acct.pub, prfOk: !!cred.prf,
    priv: await importAccountPriv(acct.priv) };
}

/** Returning sign-in: pre-flight credentials + PRF salt, one get()
 *  ceremony, server-verified assertion → the sealed bundle. A fresh
 *  authenticator (new device — the passkey didn't sync here) gets()
 *  nothing; the claimed email link then authorizes adding this
 *  device's passkey to the account, and it asserts right after. */
export async function signInAccount({ acctId, email, linkChallenge }) {
  const { credential_ids, prf_salt } = await accountCredentials(acctId);
  let { challenge } = await post(`/accounts/${acctId}/challenge`, {});
  let asn;
  try {
    asn = await getPasskey({ challenge, credentialIds: credential_ids, prfSalt: prf_salt });
  } catch {
    // This authenticator has none of the account's passkeys — the
    // claimed link's challenge is what authorizes adding a new one.
    const cred = await createPasskey({
      challenge: linkChallenge, email, acctId,
      prfSalt: prf_salt ?? b64u(crypto.getRandomValues(new Uint8Array(32))) });
    await post(`/accounts/${acctId}/credential`, {
      challenge: linkChallenge, credential_id: cred.id, jwk: cred.jwk });
    ({ challenge } = await post(`/accounts/${acctId}/challenge`, {}));
    asn = await getPasskey({ challenge, credentialIds: [cred.id], prfSalt: prf_salt });
    if (!asn.prf && cred.prf) asn.prf = cred.prf; // eval output already in hand
  }
  const r = await post(`/accounts/${acctId}/assert`, { challenge, ...asn });
  let priv = null;
  if (asn.prf && r.sealed_priv) {
    priv = await openAccountPriv(r.sealed_priv, asn.prf).catch(() => null);
  }
  return { session: r.session, bundle: r, priv };
}

/** Push a user this device holds into the account: every epoch key
 *  wraps to the account public key; the profile (name + photo) seals
 *  under the user's own key, so the relay still reads nothing. */
export async function shareUserToAccount({
  acctId, session, keyStore, userId, epochs, name = "", photo = null,
  getUserKey, joinTokens = [],
}) {
  const pub = await accountPub(acctId);
  const keys = [];
  for (const e of epochs) {
    keys.push({ epoch: e,
      grant: await wrapUserKey(await getUserKey(keyStore, userId, e), pub) });
  }
  const sealed_profile = await sealBlob(
    await getUserKey(keyStore, userId, epochs[0]),
    te.encode(JSON.stringify({ name, photo })), epochs[0]);
  await post(`/accounts/${acctId}/users`, {
    session, user_id: userId, keys, sealed_profile, join_tokens: joinTokens });
}

/** Pull every user the account supports into this device's registry.
 *  Each wrapped key unwraps with the unsealed account private key;
 *  without it (no-PRF authenticator) the row lands locked — its keys
 *  arrive later by Allow or QR card. */
export async function importAccountUsers({
  bundle, priv, keyStore, userStore, putUserKey, addUser, joinDevice = null,
}) {
  const out = [];
  for (const u of bundle.users ?? []) {
    const epochs = [];
    let profile = null;
    if (priv) {
      for (const k of u.keys ?? []) {
        try {
          const key = await unwrapUserKey(priv, k.grant);
          await putUserKey(keyStore, u.user_id, key, k.epoch);
          epochs.push(k.epoch);
          if (u.sealed_profile && !profile) {
            profile = await openBlob(key, u.sealed_profile)
              .then((b) => JSON.parse(td.decode(b))).catch(() => null);
          }
        } catch { /* a grant this account can't open stays locked */ }
      }
    }
    // Keys are not enough — this device must also register on the user's
    // relay before ops will pull. Single-use join tokens carried in the
    // bundle open that door; try each until one redeems.
    let joined = false;
    if (epochs.length && joinDevice) {
      for (const t of u.join_tokens ?? []) {
        try { await joinDevice(u.user_id, t); joined = true; break; }
        catch { /* consumed or expired — try the next */ }
      }
    }
    // sync.userId claims proven relay access (audit F12): sync.userId
    // is set from the grants even when none unwrapped — renderUsers
    // marks such a user locked ("needs an Allow or QR card") and hides
    // the Switch button until keys arrive. An unlocked user whose
    // tokens were all dead is marked pendingJoin instead — it works
    // locally but never presents as linked. A later sign-in retries
    // with tokens another device refreshed; an already-linked row is
    // never downgraded by a failed re-import.
    const grantEpochs = (u.keys ?? []).map((k) => k.epoch);
    const prev = await getUser(userStore, u.user_id);
    const alreadyLinked = !!prev?.sync?.userId && !prev.sync.pendingJoin;
    const sync = grantEpochs.length
      ? { userId: u.user_id, epoch: Math.max(...grantEpochs),
          cursor: prev?.sync?.cursor ?? 0,
          ...(joined || alreadyLinked ? {} : { pendingJoin: true }) }
      : null;
    await addUser(userStore, {
      id: u.user_id,
      name: profile?.name ?? "",
      photo: profile?.photo ?? null,
      sync, role: "partner" });
    out.push({ id: u.user_id, unlocked: epochs.length > 0, joined });
  }
  return out;
}

/* --- purchases + license codes (015 slice 6) ---
 * The web purchase runs through the supporter account (§ 4.5): the
 * worker checks the session supports this user, then hands back a
 * hosted Stripe Checkout URL. Codes (schools, grants, SLPs) are bearer
 * — redeem lands lifetime on the relay; the device picks its license
 * copy up from there. */
export const checkout = (acctId, session, userId) =>
  post("/api/v1/checkout", { session, acct_id: acctId, user_id: userId });
/* 040 § 8 — anyone buys a code, no account. count 1–9 is $49 a code
 * (the app's Buy button and the unlock link); 10+ is the school tier.
 * redeem:"self" returns the buyer to the app, which claims the minted
 * code for this board — no pasting. */
export const buyCodes = (count, redeem) =>
  post("/api/v1/checkout/codes", { count, ...(redeem ? { redeem } : {}) });
/** Poll the order the Stripe webhook mints (codes.html does the same). */
export const licenseOrder = (session) =>
  get(`/api/v1/license/order?session=${encodeURIComponent(session)}`);
export const redeemLicense = (userId, code) =>
  post("/api/v1/license/redeem", { user_id: userId, code });

/* --- supporter invites (015 slice 5) ---
 * P's device creates an invite for S's email; S's emailed link lands on
 * ?invite=, opens a normal sign-in, then claims. The invite sits at
 * pending_allow until P's device wraps Maya's keys to S's account pub
 * and grants. Remove = revoke + the relay cascade + a key rotation. */
export const createInvite = (acctId, session, email, userId) =>
  post(`/accounts/${acctId}/invites`, { session, email, user_id: userId });
export const listInvites = (acctId, session) =>
  get(`/accounts/${acctId}/invites?session=${encodeURIComponent(session)}`);
export const openInvite = (token) =>
  post(`/accounts/invites/${token}`, { action: "open" });
export const claimInvite = (token, session) =>
  post(`/accounts/invites/${token}`, { action: "claim", session });
export const inviteStatus = (token, session) =>
  get(`/accounts/invites/${token}?session=${encodeURIComponent(session)}`);
export const grantInvite = (token, session, grant) =>
  post(`/accounts/invites/${token}`, { action: "grant", session, ...grant });
export const declineInvite = (token, session) =>
  post(`/accounts/invites/${token}`, { action: "decline", session });
export const revokeInvite = (token, session) =>
  post(`/accounts/invites/${token}`, { action: "revoke", session });
