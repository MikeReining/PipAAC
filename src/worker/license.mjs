/**
 * Pip Lifetime licenses (011 slice 9, dev path).
 *
 * A license is a bearer token bound to one board:
 *   pip-life-<b64url HMAC-SHA256(secret, "pip-lifetime:" + boardId)>
 * The relay holds the secret and verifies; devices only transport the
 * token. Real purchases (App Store, checkout) will mint the same token
 * server-side — this seam does not change when payments land.
 *
 * WebCrypto only — runs in the Worker and in the Node mint script.
 */
const te = new TextEncoder();

const b64u = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const SIG_BYTES = 18; // 144-bit claim — unguessable, still paste-able

export async function licenseFor(secret, boardId) {
  const key = await crypto.subtle.importKey("raw", te.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    te.encode(`pip-lifetime:${boardId}`)));
  return `pip-life-${b64u(sig.slice(0, SIG_BYTES))}`;
}

/** Constant-time compare; returns false for anything malformed. */
export async function checkLicense(secret, boardId, presented) {
  if (!secret || typeof presented !== "string" || !presented.startsWith("pip-life-")) return false;
  const expected = await licenseFor(secret, boardId);
  if (expected.length !== presented.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}
