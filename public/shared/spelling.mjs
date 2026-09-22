/**
 * Forgiving completions (004 slice 3; truth owner:
 * docs/product/Profile_Presentation_Modes.md § 4.4). Invented spelling
 * still finds the word — exact, prefix, typo, and sound-alike tiers —
 * while accents are never required to reach a catalog word.
 *
 * Pure module: no DOM, no db. The index is built once when the keyboard
 * opens and cached; it is not a SQL LIKE on every keystroke.
 */
import { normalizeV1 } from "./normalize.mjs";

/**
 * The MATCHING key — not the uniqueness normalizer. normalizeV1, then
 * NFD + strip combining marks, ß→ss, drop ' - and spaces.
 * `école → ecole`, `Straße → strasse`. Never changes normalize_v1.
 */
export function foldKey(s) {
  return normalizeV1(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/['\-\s]/g, "");
}

/**
 * Optimal string alignment distance (Levenshtein + adjacent swap).
 * With `limit`, bails out with `limit + 1` as soon as a whole row
 * clears the bound — the matcher only ever asks "is it ≤ k?".
 */
export function osa(a, b, limit = Infinity) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (Math.abs(m - n) > limit) return limit + 1;
  const d = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      if (d[i][j] < rowMin) rowMin = d[i][j];
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[m][n];
}

/**
 * pip sound key en v1 — how English spelling maps to sound. Changing the
 * rules means a new version (same policy as normalizeV1). Tiers 0–2 work
 * in every language; tier 3 is per locale and skipped when absent.
 */
export function soundKeyEnV1(s) {
  let t = foldKey(s).replace(/[^a-z]/g, "");
  if (!t) return "";
  // digraphs, in order (C is a placeholder consonant, kept uppercase so
  // the letter rules below don't re-process it); sch→sk is a fixture-tuned
  // addition — English sch is /sk/ ("school"), and it must run before ch
  t = t
    .replaceAll("tch", "C")
    .replaceAll("dge", "j")
    .replaceAll("sch", "sk")
    .replaceAll("ch", "C")
    .replaceAll("sh", "s")
    .replaceAll("th", "t")
    .replaceAll("ph", "f")
    .replaceAll("ck", "k")
    .replaceAll("qu", "kw");
  if (t.startsWith("kn")) t = `n${t.slice(2)}`;
  if (t.startsWith("wr")) t = `r${t.slice(2)}`;
  if (t.startsWith("wh")) t = `w${t.slice(2)}`;
  if (t.startsWith("gh")) t = `g${t.slice(2)}`;
  t = t.replaceAll("gh", "");
  // letters: c before e/i/y → s else k; q→k, x→ks, z→s
  t = t
    .replace(/c([eiy])/g, "s$1")
    .replaceAll("c", "k")
    .replaceAll("q", "k")
    .replaceAll("x", "ks")
    .replaceAll("z", "s");
  // keep the first character; drop vowels, h, w from the rest
  const first = t[0];
  t = first + t.slice(1).replace(/[aeiouyhw]/g, "");
  // collapse runs of the same character
  t = t.replace(/(.)\1+/g, "$1");
  // a leading vowel is written as a — letter-name spellings skip it
  if ("aeiou".includes(first)) t = `a${t.slice(1)}`;
  return t;
}

/** Per-locale sound keys, versioned. A locale with no entry skips tier 3. */
export const SOUND_KEYS = { en: soundKeyEnV1 };

/**
 * @param {Array<{kind:'sense'|'entity', id:string, text:string, freq:number}>} entries
 *   sense text comes from the profile locale's labels. Extra fields
 *   (role, entity row) ride through to the card builder untouched.
 */
export function buildIndex(entries, locale) {
  const lang = String(locale ?? "").split("-")[0];
  const soundKey = SOUND_KEYS[locale] ?? SOUND_KEYS[lang] ?? null;
  const indexed = entries.map((e) => {
    const fold = foldKey(e.text);
    const keys = soundKey
      ? [...new Set([soundKey(fold), soundKey(fold).replace(/^a/, "")])]
      : null;
    return {
      ...e,
      fold,
      wordFolds: e.text.split(/\s+/).map(foldKey),
      keys,
      norm: normalizeV1(e.text),
    };
  });
  return { entries: indexed, soundKey };
}

/**
 * Rank forgiving completions for the buffer. Tiers: 0 exact fold, 1 prefix
 * (whole text or any word inside a multi-word text), 2 typo, 3 sound-alike
 * (only when the locale has a sound key).
 *
 * Two fixture-tuned details:
 *  - Typo measures OSA(t, fold.slice(0, t.length + 1)) — the dropped-a-
 *    letter case. The wider L−1…L+1 window puts half the catalog one edit
 *    away from a 3-letter buffer (`wtr` is distance 1 from prefixes of
 *    warm/were/work/tree) and the phase doc's own sound-alike examples
 *    could never surface. Same-length swaps and over-typed buffers are
 *    carried by the sound tier instead.
 *  - Sound-alike sub-ranks: an exact key match (a homophone) beats a key
 *    prefix, which beats a one-edit near key — so `wer` offers were and
 *    where before the merely-nearby warm and work.
 *
 * Within a tier: accent-exact match first (Spanish papá typed with the
 * dead key beats papa), then freq desc, edit distance asc, |length delta|
 * asc, text. Dedupe by kind:id keeping the best tier. Cap at `cap`.
 *
 * @returns {Array<object>} entries, best first, capped at `cap`.
 */
export function suggest(index, typed, cap = 4) {
  const t = foldKey(typed);
  const norm = normalizeV1(typed);
  if (!t) return [];
  const L = t.length;
  const k = L <= 5 ? 1 : 2;
  const tSound = index.soundKey && L >= 3 ? index.soundKey(t) : null;

  const seen = new Map(); // kind:id -> best { entry, tier, sub, dist }
  for (const e of index.entries) {
    let tier = -1;
    let sub = Infinity; // within sound-alike: 1 exact key, 2 key prefix, 3 near key
    let dist = 0;
    if (e.fold === t) {
      tier = 0;
    } else if (e.fold.startsWith(t) || (L >= 3 && e.wordFolds.some((w) => w.startsWith(t)))) {
      tier = 1;
    } else if (L >= 3) {
      if (e.fold.length > L) {
        const d = osa(t, e.fold.slice(0, L + 1), k);
        if (d <= k) {
          tier = 2;
          dist = d;
        }
      }
      if (tier < 0 && tSound && tSound.length >= 2) {
        for (const kk of e.keys) {
          if (kk === tSound) sub = Math.min(sub, 1);
          else if (kk.startsWith(tSound)) sub = Math.min(sub, 2);
          else if (osa(tSound, kk, 1) <= 1) sub = Math.min(sub, 3);
        }
        if (sub < Infinity) {
          tier = 3;
          dist = osa(t, e.fold);
        }
      }
    }
    if (tier < 0) continue;
    if (tier !== 3) sub = 0; // sub only orders sound-alikes
    const key = `${e.kind}:${e.id}`;
    const prev = seen.get(key);
    if (!prev || tier < prev.tier || (tier === prev.tier && sub < prev.sub)) {
      seen.set(key, { entry: e, tier, sub, dist });
    }
  }

  return [...seen.values()]
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.sub - b.sub ||
        Number(b.entry.norm === norm) - Number(a.entry.norm === norm) ||
        (b.entry.freq ?? 0) - (a.entry.freq ?? 0) ||
        a.dist - b.dist ||
        Math.abs(a.entry.fold.length - L) - Math.abs(b.entry.fold.length - L) ||
        a.entry.text.localeCompare(b.entry.text),
    )
    .slice(0, cap)
    .map((r) => r.entry);
}
