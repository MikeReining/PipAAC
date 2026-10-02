/**
 * The QR card (Sync_And_Web_Editing § 9).
 *
 * The card carries two things: the user id and the recovery root, a
 * 128-bit bearer secret from which every epoch's user key derives
 * (HKDF). Whoever holds the card can restore the user — keep it
 * somewhere you can find it.
 *
 * The root is written as 12 words (128 bits + 4-bit SHA-256 checksum,
 * 12 × 11 bits, BIP-0039 wordlist); a typo'd word almost always fails
 * the checksum. The words alone are the whole code: the relay finds the
 * user by the root's proof. One link carries them and survives email:
 * `<origin>/#restore=<word-word-…-word>`.
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
export const ROOT_BYTES = 16; // 12 words * 11 bits = 132 = 128 + 4 checksum
const WORD_COUNT = 12;

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** 16 bytes → 12 words (128 bits + 4-bit checksum). */
export async function keyToWords(rootBytes, words) {
  let bitstr = "";
  for (const b of rootBytes) bitstr += b.toString(2).padStart(8, "0");
  const cs = new Uint8Array(await subtle.digest("SHA-256", rootBytes))[0];
  bitstr += cs.toString(2).padStart(8, "0").slice(0, 4);
  const out = [];
  for (let i = 0; i < WORD_COUNT; i++) out.push(words[parseInt(bitstr.slice(i * 11, i * 11 + 11), 2)]);
  return out.join(" ");
}

/** 12 words → 16 bytes. Throws on unknown words, bad count, bad checksum. */
export async function wordsToKey(phrase, words) {
  const index = new Map(words.map((w, i) => [w, i]));
  const list = phrase.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (list.length !== WORD_COUNT) throw new Error(`recovery code needs exactly ${WORD_COUNT} words`);
  let bitstr = "";
  for (const w of list) {
    if (!index.has(w)) throw new Error(`unknown recovery word: ${w}`);
    bitstr += index.get(w).toString(2).padStart(11, "0");
  }
  const root = new Uint8Array(ROOT_BYTES);
  for (let i = 0; i < ROOT_BYTES; i++) {
    root[i] = parseInt(bitstr.slice(i * 8, i * 8 + 8), 2);
  }
  const want = parseInt(bitstr.slice(128, 132), 2);
  const got = new Uint8Array(await subtle.digest("SHA-256", root))[0] >> 4;
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
 * Card link — the QR's text, the email line, and the paste-box format
 * ------------------------------------------------------------------ */

const HASH = "#restore=";

/** One space-free link; the words ride in the fragment, which browsers
 *  never send to a server. */
export async function cardLink(origin, rootBytes, words) {
  return `${origin}/${HASH}${(await keyToWords(rootBytes, words)).replaceAll(" ", "-")}`;
}

/** The 12 words out of a location hash (`#restore=a-b-…`), or null. */
export const wordsFromHash = (hash) =>
  hash?.startsWith(HASH) ? hash.slice(HASH.length) : null;

/**
 * Card text → root. Tolerant of how it was carried: the link, or the
 * bare words separated by spaces, hyphens, commas or newlines. Throws
 * word errors for word-shaped input; null when there are no letters.
 */
export async function recoverFromText(text, words) {
  const i = text.indexOf(HASH);
  const body = i >= 0 ? text.slice(i + HASH.length) : text;
  if (!/[a-z]{3}/i.test(body)) return null;
  return { root: await wordsToKey(body, words) };
}
