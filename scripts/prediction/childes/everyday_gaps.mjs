// Everyday words children say that Pip lacks (010 slice 1, founder
// 2026-09-25). Rank the surfaces children actually say in CHILDES that
// resolve to no catalog word, fold spellings of the same word together
// (picks + pick -> pick), and keep every word said 1,000+ times.
//
// Drops (the doc's rules): fillers and backchannels (um, yeah-type),
// names, single letters, corpus artifacts (unk, sep, nin_nin), and
// baby-talk/compound spellings that already stand for a real word
// (mummie -> mom, byebye -> bye, thank_you -> thank you).
//
//   node scripts/prediction/childes/everyday_gaps.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const MIN = 1000;
const OUT = path.join(C.REPO, 'data/prediction/everyday_gaps.en.json');
const CATALOG = JSON.parse(
  (await import('node:fs')).readFileSync(
    path.join(C.REPO, 'data/catalog/catalog.json'), 'utf8'));
const launchWords = new Set();
for (const l of CATALOG.labels) {
  if (l.kind === 'lemma') launchWords.add(l.normalized_text);
}

// Backchannels and discourse noises — a child "says" them, but they are
// not words she needs a tile for.
const FILLER = new Set(['yeah', 'oh', 'um', 'uh', 'mhm', 'ah', 'huh', 'hm',
  'mm', 'uhhuh', 'eh', 'yep', 'yup', 'ya', 'er', 'ooh', 'uhuh', 'haha',
  'whoa', 'ha', 'wow', 'aw', 'aww', 'hmm', 'ohh', 'aah', 'hmph']);
// Corpus bookkeeping and family-specific names/tags, not vocabulary.
const ARTIFACT = new Set(['unk', 'null', 'zzz', 'chi', 'ic', 'mot', 'sep',
  'purdie', 'discards', 'nin_nin', 'firstname', 'baba', 'da']);
const NAMES = new Set(['peter', 'thomas', 'carl', 'fraser', 'laura',
  'nicole', 'anna', 'amy', 'sue']);
// Spellings that already stand for a real word — the word isn't
// missing, this spelling of it is.
const ALIAS = new Map(Object.entries({
  mummie: 'mom', doggie: 'dog', dolly: 'doll', ma: 'mom',
  byebye: 'bye', icecream: 'ice cream', em: 'they', ta: 'thank you',
  cause: 'because', "dat's": 'that is',
}));

// Spelling-level folds between missing words: 'picks' and 'pick' are
// one gap. A candidate that is itself a real word makes the surface
// just a spelling of it ('puppies' -> puppy — already shipped). A
// candidate children actually say folds the cluster ('called' ->
// 'call'). Anything else stands alone ('being' stays 'being',
// 'bring' stays 'bring'). 'lets' is the let's spelling (founder
// ruling), not 'let'.
const FOLD = { lets: "let's", being: 'be', clothes: 'clothes' };
let raw;
// Stems a surface could be a spelling of, suffix-first — no
// hypothetical stems ('bring' -> 'br'), so junk short tokens never
// swallow a real word.
const stems = (s) => {
  const out = [];
  if (s.endsWith('ies') || s.endsWith('ied')) out.push(s.slice(0, -3) + 'y');
  if (s.endsWith('es')) out.push(s.slice(0, -2));
  if (s.endsWith('s')) out.push(s.slice(0, -1));
  if (s.endsWith('ing')) {
    const stem = s.slice(0, -3);
    out.push(stem, stem + 'e',
      stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : stem);
  } else if (s.endsWith('ed')) {
    const stem = s.slice(0, -2);
    out.push(stem, stem + 'e',
      stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : stem);
  }
  return out.filter((c) => c !== s && /^[a-z]+$/.test(c) && c.length >= 3);
};
const fold = (surf) => {
  if (FOLD[surf]) surf = FOLD[surf];
  const cands = stems(surf);
  const real = cands.find((c) => C.toLemma(c) || launchWords.has(c));
  if (real) return { drop: real };
  // fold to the most-said member of the cluster — a rare junk token
  // never swallows the word ('breed' stays, 'bring' stays, 'clothes'
  // beats 'cloth')
  const base = [surf, ...cands.filter((c) => raw.has(c))]
    .sort((a, b) => (raw.get(b) ?? 0) - (raw.get(a) ?? 0))[0];
  if (C.toLemma(base) || launchWords.has(base)) return { drop: base };
  return { base };
};

const dropped = new Map();  // surface -> { n, reason }
const drop = (s, n, reason) => {
  const d = dropped.get(s) ?? { n: 0, reason };
  d.n += n; dropped.set(s, d);
};

raw = new Map();            // unresolved surface -> n
const trs = C.loadTranscripts();
let lines = 0;
for (const tr of trs) for (const [spk, words] of tr) {
  if (!C.CHILD_SPEAKER.test(spk)) continue;
  lines++;
  for (const t of C.analyzeLine(words)) {
    if (t.lemma !== null) continue;
    const s = (t.surf ?? '').toLowerCase();
    if (!s) continue;
    raw.set(s, (raw.get(s) ?? 0) + 1);
  }
}

const bases = new Map();    // candidate word -> { n, surfaces }
for (const [s, n] of raw) {
  if (FILLER.has(s)) { drop(s, n, 'filler/backchannel'); continue; }
  if (/^[a-z]$/.test(s)) { drop(s, n, 'letter'); continue; }
  if (NAMES.has(s)) { drop(s, n, 'name'); continue; }
  if (ARTIFACT.has(s)) { drop(s, n, 'corpus artifact'); continue; }
  if (ALIAS.has(s)) { drop(s, n, `spelling of ${ALIAS.get(s)}`); continue; }
  const spaced = s.replace(/_/g, ' ');
  if (launchWords.has(spaced)) { drop(s, n, `launch word: ${spaced}`); continue; }
  const f = fold(s);
  if (f.drop) { drop(s, n, `spelling of ${f.drop}`); continue; }
  const b = f.base;
  const e = bases.get(b) ?? { n: 0, surfaces: [] };
  e.n += n; e.surfaces.push([s, n]);
  bases.set(b, e);
}

const words = [...bases.entries()]
  .filter(([, e]) => e.n >= MIN)
  .sort((a, b) => b[1].n - a[1].n)
  .map(([word, e]) => ({ word, count: e.n,
    surfaces: e.surfaces.sort((a, b) => b[1] - a[1])
      .map(([text, n]) => ({ text, count: n })) }));

const kept = new Set(words.map((w) => w.word));
const underMin = [...bases.entries()].filter(([b, e]) => !kept.has(b))
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, 40).map(([word, e]) => ({ word, count: e.n }));

writeFileSync(OUT, JSON.stringify({
  generated: 'everyday_gaps.mjs — CHILDES child lines, unresolved by the catalog',
  minCount: MIN,
  childLines: lines,
  words,
  dropped: [...dropped.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([word, d]) => ({ word, count: d.n, reason: d.reason })),
  nearMisses: underMin,
}, null, 1));

console.log(`${lines} child lines -> ${words.length} everyday gaps (>=${MIN})`);
for (const w of words.slice(0, 60)) {
  console.log(String(w.count).padStart(7), w.word,
    w.surfaces.length > 1
      ? `(${w.surfaces.map((s) => s.text).join(', ')})` : '');
}
console.log(`... +${Math.max(0, words.length - 60)} more; ${dropped.size} surfaces dropped`);
