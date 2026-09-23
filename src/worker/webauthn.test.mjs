/**
 * 015 slice 4 — verifyAssertion unit test: a crafted-in-Node
 * authenticator signs exactly like a platform passkey; the verifier
 * checks challenge, origin, rpId, user presence, and the signature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { b64u, verifyAssertion } from "./webauthn.mjs";

const RP_ID = "127.0.0.1";
const ORIGIN = "http://127.0.0.1:8881";
const CHALLENGE = "dGVzdC1jaGFsbGVuZ2U";

const sha256 = async (b) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const derEncode = (r, s) => {
  const int = (x) => [0x02, (x[0] & 0x80 ? x.length + 1 : x.length), ...(x[0] & 0x80 ? [0, ...x] : x)];
  const seq = [...int(r), ...int(s)];
  return new Uint8Array([0x30, seq.length, ...seq]);
};

const cred = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const credJwk = await crypto.subtle.exportKey("jwk", cred.publicKey);
const stored = { id: "cred-1", jwk: credJwk };
const expected = { challenge: CHALLENGE, rpId: RP_ID, origins: [ORIGIN] };

const assertion = async (over = {}) => {
  const rpHash = await sha256(new TextEncoder().encode(over.rpId ?? RP_ID));
  const authData = new Uint8Array(37);
  authData.set(rpHash);
  authData[32] = over.flags ?? 0x01;
  const clientData = JSON.stringify({
    type: over.type ?? "webauthn.get",
    challenge: over.challenge ?? CHALLENGE,
    origin: over.origin ?? ORIGIN });
  const clientHash = await sha256(new TextEncoder().encode(clientData));
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData); signed.set(clientHash, authData.length);
  const p1363 = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, over.key ?? cred.privateKey, signed));
  return {
    authenticator_data: b64u(authData),
    client_data_json: b64u(new TextEncoder().encode(clientData)),
    signature: over.sig ?? b64u(derEncode(p1363.slice(0, 32), p1363.slice(32))),
  };
};

test("a well-formed assertion verifies", async () => {
  await verifyAssertion(stored, await assertion(), expected);
});

test("challenge, origin, rp, presence, and signature are all enforced", async () => {
  await assert.rejects(verifyAssertion(stored, await assertion({ challenge: "b3RoZXItY2hhbGxlbmdl" }), expected), /bad_challenge/);
  await assert.rejects(verifyAssertion(stored, await assertion({ origin: "https://evil.example" }), expected), /bad_origin/);
  await assert.rejects(verifyAssertion(stored, await assertion({ rpId: "evil.example" }), expected), /bad_rp/);
  await assert.rejects(verifyAssertion(stored, await assertion({ flags: 0x00 }), expected), /no_user_presence/);
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  await assert.rejects(verifyAssertion(stored, await assertion({ key: other.privateKey }), expected), /bad_signature/);
  await assert.rejects(verifyAssertion(stored, await assertion({ type: "webauthn.create" }), expected), /bad_type/);
});
