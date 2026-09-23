/**
 * The QR card (Sync_And_Web_Editing § 9).
 *
 * The card carries two things: the user id and the recovery root, a
 * 256-bit bearer secret from which every epoch's user key derives
 * (HKDF). Whoever holds the card can restore the user — print it,
 * keep it safe, keep it private.
 *
 * Payload: `pip:recover:<userId>:<b64u32>` — the 32-byte root as
 * base64url, 43 characters, printed under the QR as the short code a
 * camera-less device can type. Pre-card sheets carried the root as 24
 * BIP-0039-style words (256 bits + 8-bit SHA-256 checksum); a typo'd
 * word almost always fails the checksum, and `recoverFromText` still
 * accepts them.
 *
 * Relay trust: the relay stores only a proof —
 * SHA-256(root ‖ "pip-recovery-v1") — which a restore presents instead
 * of a device signature. The relay stays blind: it never sees the key.
 */

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();

const b64u = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const unb64u = (s) => Uint8Array.from(
  atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
const ROOT_BYTES = 32; // 24 words * 11 bits = 264 = 256 + 8 checksum

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** 32 bytes → 24 words (256 bits + 8-bit checksum). */
export async function keyToWords(rootBytes, words) {
  // Build the 264-bit string: entropy bits then the first checksum byte.
  let bitstr = "";
  for (const b of rootBytes) bitstr += b.toString(2).padStart(8, "0");
  const cs = new Uint8Array(await subtle.digest("SHA-256", rootBytes))[0];
  bitstr += cs.toString(2).padStart(8, "0");
  const out = [];
  for (let i = 0; i < 24; i++) out.push(words[parseInt(bitstr.slice(i * 11, i * 11 + 11), 2)]);
  return out.join(" ");
}

/** 24 words → 32 bytes. Throws on unknown words, bad count, bad checksum. */
export async function wordsToKey(phrase, words) {
  const index = new Map(words.map((w, i) => [w, i]));
  const list = phrase.trim().toLowerCase().split(/\s+/);
  if (list.length !== 24) throw new Error("recovery sheet needs exactly 24 words");
  let bitstr = "";
  for (const w of list) {
    if (!index.has(w)) throw new Error(`unknown recovery word: ${w}`);
    bitstr += index.get(w).toString(2).padStart(11, "0");
  }
  const root = new Uint8Array(ROOT_BYTES);
  for (let i = 0; i < ROOT_BYTES; i++) {
    root[i] = parseInt(bitstr.slice(i * 8, i * 8 + 8), 2);
  }
  const want = parseInt(bitstr.slice(256, 264), 2);
  const got = new Uint8Array(await subtle.digest("SHA-256", root))[0];
  if (want !== got) throw new Error("recovery words fail their checksum");
  return root;
}

/* ------------------------------------------------------------------ *
 * Relay proof — what the relay stores instead of the key
 * ------------------------------------------------------------------ */

export async function recoveryProof(rootBytes) {
  const msg = new Uint8Array(rootBytes.length + 16);
  msg.set(rootBytes);
  msg.set(te.encode("pip-recovery-v1"), rootBytes.length);
  return b64u(await subtle.digest("SHA-256", msg));
}

/* ------------------------------------------------------------------ *
 * Card payload — the QR's text, and the paste-box format
 * ------------------------------------------------------------------ */

/** 015 slice 3: the card carries the root itself, base64url — 43
 *  characters instead of 24 words. Pre-slice-3 sheets (24 words)
 *  still parse. */
export const cardPayload = (userId, rootBytes) =>
  `pip:recover:${userId}:${b64u(rootBytes)}`;

export const recoveryPayload = (userId, words) =>
  `pip:recover:${userId}:${words}`;

/** Accepts a `pip:recover:` payload, or bare `<userId> <24 words>`.
 *  → { userId, phrase } or null. */
export function parseRecoveryPayload(text) {
  const t = text.trim();
  const m = t.match(/^pip:recover:([0-9a-f-]{36}):(.+)$/is);
  if (m) return { userId: m[1], phrase: m[2].trim() };
  const bare = t.split(/\s+/);
  if (bare.length === 25 && /^[0-9a-f-]{36}$/i.test(bare[0])) {
    return { userId: bare[0], phrase: bare.slice(1).join(" ") };
  }
  return null;
}

/**
 * Card text → { userId, root }: `pip:recover:<id>:<b64u32>` (the card),
 * `pip:recover:<id>:<24 words>` and bare `<id> <24 words>` (old sheets),
 * or bare `<id> <b64u>` (the printed code, grouped or not).
 * Throws word errors for word-shaped input; null for anything else.
 */
export async function recoverFromText(text, words) {
  const t = text.trim();
  const m = t.match(/^pip:recover:([0-9a-f-]{36}):(.+)$/is);
  const parts = (m ? `${m[1]} ${m[2].trim()}` : t).split(/\s+/);
  if (parts.length < 2 || !/^[0-9a-f-]{36}$/i.test(parts[0])) return null;
  const userId = parts[0];
  if (parts.length === 25) {
    return { userId, root: await wordsToKey(parts.slice(1).join(" "), words) };
  }
  // The card's code — one token, or retyped with its display grouping.
  try {
    const root = unb64u(parts.slice(1).join(""));
    if (root.length === 32) return { userId, root };
  } catch { /* not b64 */ }
  return null;
}
