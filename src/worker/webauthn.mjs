/** Minimal WebAuthn assertion verification (015 slice 4, Sync § 12.3).
 *  ES256 only — the client registers platform passkeys; attestation is
 *  "none" (the relay binds a credential public key, it does not vet the
 *  authenticator). Verification checks the real things: the challenge
 *  this relay issued, the RP origin, the user-presence flag, and the
 *  authenticator's signature over authenticatorData ‖ hash(clientData).
 */

const te = new TextEncoder();
export const b64u = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const unb64u = (s) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** DER-encoded ECDSA signature → IEEE-P1363 r‖s (64 bytes). */
function derToP1363(der) {
  const len = (i, n) => {
    let l = der[i], j = i + 1;
    if (l & 0x80) { const k = l & 0x7f; l = 0; for (let m = 0; m < k; m++) l = l * 256 + der[j++]; }
    return [l, j];
  };
  if (der[0] !== 0x30) throw new Error("bad_der");
  let [seqLen, i] = len(1, 0); // eslint-disable-line no-unused-vars
  const out = new Uint8Array(64);
  for (const half of [0, 32]) {
    if (der[i] !== 0x02) throw new Error("bad_der");
    const [l, j] = len(i + 1);
    let r = der.slice(j, j + l);
    if (r.length > 32) r = r.slice(r.length - 32); // leading pad byte
    out.set(r, half + (32 - r.length));
    i = j + l;
  }
  return out;
}

/** Verify a WebAuthn get() assertion.
 *  cred: { id, jwk } as stored at registration.
 *  asn: { credential_id, authenticator_data, client_data_json,
 *         signature } — all b64url.
 *  expected: { challenge, rpId, origins[] }.
 *  Throws with a short reason on any mismatch; returns undefined on ok. */
export async function verifyAssertion(cred, asn, expected) {
  const client = JSON.parse(new TextDecoder().decode(unb64u(asn.client_data_json)));
  if (client.type !== "webauthn.get") throw new Error("bad_type");
  if (client.challenge !== expected.challenge) throw new Error("bad_challenge");
  if (!expected.origins.includes(client.origin)) throw new Error("bad_origin");

  const auth = unb64u(asn.authenticator_data);
  if (auth.length < 37) throw new Error("bad_authenticator_data");
  const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(expected.rpId)));
  if (b64u(auth.slice(0, 32)) !== b64u(rpHash)) throw new Error("bad_rp");
  if (!(auth[32] & 0x01)) throw new Error("no_user_presence");

  const clientHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", unb64u(asn.client_data_json)));
  const signed = new Uint8Array(auth.length + 32);
  signed.set(auth); signed.set(clientHash, auth.length);

  const key = await crypto.subtle.importKey("jwk", cred.jwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const sig = derToP1363(unb64u(asn.signature));
  if (!await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, key, sig, signed)) {
    throw new Error("bad_signature");
  }
}
