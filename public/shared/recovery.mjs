/**
 * The recovery sheet (Sync_And_Web_Editing § 9).
 *
 * The sheet carries two things: the board id and the recovery root, a
 * 256-bit bearer secret from which every epoch's board key derives
 * (HKDF). Whoever holds the sheet can restore the board — print it,
 * keep it safe, keep it private.
 *
 * Words: the 32-byte root plus an 8-bit SHA-256 checksum becomes 264
 * bits = 24 words of 11 bits over the BIP-0039 English list. A typo'd
 * word almost always fails the checksum before it can restore wrong.
 *
 * QR payload: `pip:recover:<boardId>:<w1> <w2> … <w24>` — plain text,
 * so a scan pasted anywhere round-trips.
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
 * Sheet payload — the QR's text, and the paste-box format
 * ------------------------------------------------------------------ */

export const recoveryPayload = (boardId, words) =>
  `pip:recover:${boardId}:${words}`;

/** Accepts a `pip:recover:` payload, or bare `<boardId> <24 words>`.
 *  → { boardId, phrase } or null. */
export function parseRecoveryPayload(text) {
  const t = text.trim();
  const m = t.match(/^pip:recover:([0-9a-f-]{36}):(.+)$/is);
  if (m) return { boardId: m[1], phrase: m[2].trim() };
  const bare = t.split(/\s+/);
  if (bare.length === 25 && /^[0-9a-f-]{36}$/i.test(bare[0])) {
    return { boardId: bare[0], phrase: bare.slice(1).join(" ") };
  }
  return null;
}
