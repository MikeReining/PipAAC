// The forms source table (021 slice 1): which catalog words carry verb
// forms and how those forms are spelled — measured from CHILDES, never
// guessed. Two questions answered from the corpus:
//
//   1. verbs-by-use: a non-Verb lemma earns -s/-ing forms when children
//      use it both ways >= MIN_USE times: <form>-ing right after
//      am/is/are, and <form>-s right after he/she/it ("hurt" is an
//      adjective on paper but "my tummy hurts" is real speech).
//   2. spellings: a word's -s/-ing text is the most common CHILDES
//      spelling the (020B-fixed) converter maps back to it —
//      "getting" beats a rule's "geting", "gluing" beats "glueing".
//      A spelling RULE fills in only when the data never shows the
//      form; those lemmas are listed.
//
// Output: data/forms/en.json — generated, never hand-edited. The
// catalog build resolves lemmas to senses and emits the label rows.
//
//   node scripts/prediction/childes/build_forms_data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const MIN_USE = 20;
const OUT = path.join(C.REPO, 'data/forms/en.json');

const lex = JSON.parse(readFileSync(path.join(C.REPO, 'data/launch_lexicon.json'), 'utf8'));
const posOf = Object.fromEntries(lex.entries.map((e) => [e.spokenText.toLowerCase(), e.partOfSpeech]));
const verbLemmas = lex.entries.filter((e) => e.partOfSpeech === 'Verb').map((e) => e.spokenText.toLowerCase());
// The multiword verbs inflect their first word (wakes up, waking up).
const firstWord = (lem) => lem.split(' ')[0];

// Which catalog lemmas could take -s/-ing by their shape: anything the
// converter maps back from an -s/-es/-ies/-ing token.
const candidates = new Set([...verbLemmas.map(firstWord), ...C.LEMMAS]);

// bucket a token to (lemma, which form it attests) — spellings are
// counted on ALL lines (caregivers spell conventionally); use-counts
// only on child lines.
const BE_FORMS = new Set(['am', 'is', 'are']);
const THIRD = new Set(['he', 'she', 'it']);

// spelled form candidate buckets per lemma
const spell = new Map(); // lemma -> { s: Map<text,n>, ing: Map<text,n> }
const use = new Map();   // non-Verb lemma -> { s: n, ing: n } on child lines
const bump = (outer, key, bucket, text) => {
  if (!outer.has(key)) outer.set(key, { s: new Map(), ing: new Map() });
  const m = outer.get(key)[bucket];
  m.set(text, (m.get(text) ?? 0) + 1);
};
// Whose/how-many buckets (022): plural spellings per noun lemma and
// possessive uses per lemma, counted on the analyzed stream (the 's
// disambiguation already decided poss-vs-is).
const plural = new Map(); // noun lemma -> Map<surface, n>
const possUse = new Map(); // lemma -> n (child+adult 's uses)

const trs = C.loadTranscripts();
const { train } = C.splitIdx(trs.length, 20260923);
for (const i of train) {
  for (const [spk, words] of trs[i]) {
    const child = C.CHILD_TAGS.has(spk);
    // Whose/how-many (022): the analyzed stream carries poss flags and
    // folded merges — plural surfaces under their noun, 's uses under
    // their lemma. Spellings counted on all lines.
    for (const t of C.analyzeLine(words)) {
      if (t.lemma === null || posOf[t.lemma] !== 'Noun') continue;
      if (t.poss) possUse.set(t.lemma, (possUse.get(t.lemma) ?? 0) + 1);
      else if (t.surf !== t.lemma && (/s$/.test(t.surf) || C.MERGES[t.surf] === t.lemma)) {
        const m = plural.get(t.lemma) ?? new Map();
        m.set(t.surf, (m.get(t.surf) ?? 0) + 1);
        plural.set(t.lemma, m);
      }
    }
    // Use-counts read the post-expansion stream — "it's hurting" is a
    // real "it is hurting" context (contractions carry the auxiliary).
    const stream = child ? C.expandAll(words) : words.map((w) => w.toLowerCase());
    for (let w = 0; w < stream.length; w++) {
      const tl = stream[w];
      const prev = w > 0 ? stream[w - 1] : null;
      // -ing and -s buckets, through the fixed converter
      const lem = C.toLemma(tl);
      if (lem === null || !candidates.has(lem)) continue;
      const norm = lem;
      if (tl.endsWith('ing') && tl.length > 4) {
        bump(spell, norm, 'ing', tl);
        if (child && prev && BE_FORMS.has(prev)) {
          const u = use.get(norm) ?? { s: 0, ing: 0 }; u.ing++; use.set(norm, u);
        }
      } else if (tl.endsWith('s') && tl.length > 2) {
        bump(spell, norm, 's', tl);
        if (child && prev && THIRD.has(prev)) {
          const u = use.get(norm) ?? { s: 0, ing: 0 }; u.s++; use.set(norm, u);
        }
      }
    }
  }
}

// verbs-by-use: non-Verb lemmas with both shapes >= MIN_USE on child lines
const verbUse = {};
for (const [lem, u] of [...use.entries()].sort()) {
  if (u.ing >= MIN_USE && u.s >= MIN_USE && posOf[lem] && posOf[lem] !== 'Verb') {
    verbUse[lem] = u;
  }
}

// spelling rules — only for a word the data never shows (021: rules are
// the fallback, not the source)
function ruleS(lem) {
  if (/[^aeiou]y$/.test(lem)) return lem.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh|o)$/.test(lem)) return lem + 'es';
  return lem + 's';
}
function ruleIng(lem) {
  if (/[^aeiou]e$/.test(lem) && !/(ee|ye|oe)$/.test(lem)) return lem.slice(0, -1) + 'ing';
  const m = lem.match(/([bcdfgklmnprst])([aeiou])([bcdfgklmnprst])$/);
  if (m && lem.length <= 5) return lem + m[3] + 'ing';
  return lem + 'ing';
}

const top = (m) => [...(m?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0] ?? null;
// a two-word verb's head spellings may land under the full lemma —
// IRREG aliases "wake" -> "wake up", so "waking" counts sit on "wake up"
const mergedBuckets = (...ms) => {
  const out = new Map();
  for (const m of ms) for (const [k, n] of m ?? []) out.set(k, (out.get(k) ?? 0) + n);
  return out;
};
const verbs = {};
const fallback = [];
for (const lem of [...new Set([...verbLemmas.map(firstWord), ...verbLemmas, ...Object.keys(verbUse)])].sort()) {
  const sHit = top(mergedBuckets(spell.get(lem)?.s, spell.get(firstWord(lem))?.s));
  const ingHit = top(mergedBuckets(spell.get(lem)?.ing, spell.get(firstWord(lem))?.ing));
  const s = sHit?.[0] ?? ruleS(lem);
  const ing = ingHit?.[0] ?? ruleIng(lem);
  if (!sHit || !ingHit) fallback.push(lem);
  verbs[lem] = { s, ing, sCount: sHit?.[1] ?? 0, ingCount: ingHit?.[1] ?? 0, pos: posOf[lem] };
}

// One-meaning merges live in common.mjs (the converter folds them);
// en.json carries a copy for traceability.
const merges = C.MERGES;

// form rows: verbs get V;PRS;3;SG + V;V.PTCP;PRS; the merges pin their
// own tags. Two-word verbs inflect the first word (wakes up). Merged
// lemmas emit nothing — they fold into the kept sense. The closed
// auxiliary set (modals, past-tense lemma entries, contracted
// negatives, "is" itself) takes no regular -s/-ing; it only gets the
// pinned rows below.
const NONINFLECTING = new Set([
  'is', 'am', 'are', 'was', 'were', 'had', 'did',
  "don't", "didn't", "won't", "can't", 'can', 'will', 'would',
]);
// a pin (has, doesn't, ...) overrides a generic row on the same
// (lemma, features) pair
const formMap = new Map();
const emit = (lemma, features, text) => formMap.set(`${lemma}|${features}`, { lemma, features, text });
const fullVerbLemmas = [...verbLemmas, ...Object.keys(verbUse)];
for (const lem of fullVerbLemmas) {
  if (merges[lem] || NONINFLECTING.has(lem)) continue;
  const head = firstWord(lem);
  const tail = lem.slice(head.length);
  const v = verbs[lem];
  emit(lem, 'V;PRS;3;SG', v.s + tail);
  emit(lem, 'V;V.PTCP;PRS', v.ing + tail);
}
emit('have', 'V;PRS;3;SG', 'has');
emit('is', 'V;PRS;1;SG', 'am');
emit('is', 'V;PRS;2;SG;PL', 'are');
emit('is', 'V;NFIN', 'be');
emit("don't", 'V;PRS;3;SG', "doesn't");
emit('he', 'PRO;ACC', 'him');
emit('she', 'PRO;ACC', 'her');
emit('we', 'PRO;ACC', 'us');
emit('they', 'PRO;ACC', 'them');
emit('a', 'DET;PHON', 'an');
// Whose (022): possessive surfaces, pinned like the object forms. 'his'
// covers both "his dog" and "it's his"; 'her' (PRO;ACC) already covers
// "her dog". 'my' keeps its own sense — mine is its absolute form.
emit('he', 'PRO;POSS', 'his'); // "his dog" and "it's his" — one surface
emit('we', 'PRO;POSS', 'our');
emit('they', 'PRO;POSS', 'their');
emit('you', 'PRO;POSS', 'your');
emit('my', 'PRO;POSS;ABS', 'mine');
emit('she', 'PRO;POSS;ABS', 'hers');
emit('we', 'PRO;POSS;ABS', 'ours');
emit('they', 'PRO;POSS;ABS', 'theirs');
emit('you', 'PRO;POSS;ABS', 'yours');
// Whose on names: nouns the corpus shows wearing 's >= MIN_USE times
// (mummy's knee); the surface is the lemma + 's. How many: nouns whose
// plural is attested >= MIN_USE get N;PL spelled the corpus's way
// (babies, feet, children — the merge surfaces land here too).
const possNouns = {};
for (const [lem, n] of [...possUse.entries()].sort()) {
  if (n >= MIN_USE) { possNouns[lem] = n; emit(lem, 'N;POSS', `${lem}'s`); }
}
const plurals = {};
for (const [lem, m] of [...plural.entries()].sort()) {
  const hit = top(m);
  if (hit && hit[1] >= MIN_USE) { plurals[lem] = hit; emit(lem, 'N;PL', hit[0]); }
}
const forms = [...formMap.values()];

writeFileSync(OUT, JSON.stringify({
  version: 'form-data.2026-09-25',
  locale: 'en',
  verbs, verbUse, fallbackSpellings: fallback, merges, possNouns, plurals, forms,
}, null, 1));

console.log(`verbs with forms: ${fullVerbLemmas.length} (${verbLemmas.length} catalog Verbs + ${Object.keys(verbUse).length} by use)`);
console.log('verbs by use:', JSON.stringify(verbUse));
console.log(`spellings from rules (no data): ${JSON.stringify(fallback)}`);
console.log(`nouns taking 's: ${Object.keys(possNouns).length}`, JSON.stringify(possNouns));
console.log(`nouns taking plural: ${Object.keys(plurals).length}`);
console.log(`forms emitted: ${forms.length} -> ${path.relative(C.REPO, OUT)}`);
