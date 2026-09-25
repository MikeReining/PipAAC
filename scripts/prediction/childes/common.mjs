// Shared vocab + CHILDES corpus plumbing for the real-children scorer.
// Ported 1:1 from ../pip-scratch/{common,prep}.py so the 80/20 transcript
// split and per-bucket 2,500-event samples reproduce bit-for-bit.
// Transcript data itself lives in the gitignored data/prediction/childes/
// cache (R11); this file only knows how to read it.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE = path.join(REPO, 'data/prediction/childes');
export const TRANSCRIPTS = path.join(CACHE, 'transcripts.jsonl');
export const IMAGINE_TRAIN = path.join(CACHE, 'imagine_train.txt');
export const TD = (age) => path.join(CACHE, `tinydialogue_age-${age}_train.txt`);
export const TD_VAL = (age) => path.join(CACHE, `tinydialogue_age-${age}_val.txt`);
export const CHILDLIKE = path.join(REPO, 'data/prediction/sources/childlike_en.jsonl');

// ---------- vocab (from repo data; same derivation as scratch vocab.json) ----------
const lex = JSON.parse(readFileSync(path.join(REPO, 'data/launch_lexicon.json'), 'utf8')).entries;
const cat = JSON.parse(readFileSync(path.join(REPO, 'data/catalog/catalog.json'), 'utf8'));
const senseLemma = {};
for (const l of cat.labels) if (l.kind === 'lemma') senseLemma[l.sense_id] = l.normalized_text;

export const LEMMAS = lex.map((e) => e.spokenText.toLowerCase());
export const LEMMA_CAT = Object.fromEntries(lex.map((e) => [e.spokenText.toLowerCase(), e.category]));
export const CORE = new Set(
  cat.senses.filter((s) => s.tier === 'root_core').map((s) => senseLemma[s.id]).filter(Boolean),
);
export const MULTIWORD = LEMMAS.filter((w) => w.includes(' ')).sort((a, b) => b.length - a.length);
export const NONCORE_VOCAB = LEMMAS.filter((w) => !CORE.has(w)).length;
export const RANDOM_HIT = 4 / NONCORE_VOCAB; // top-4 over the non-core vocab
// R21: the "no" set is catalog truth (lexicon `negation` flag →
// sense.negation). The scorer reads it here; the device reads
// sense.negation — one source, no hand-kept list anywhere.
export const NEG = new Set(lex.filter((e) => e.negation).map((e) => e.spokenText.toLowerCase()));

// Every target must be an offerable lemma — a mapping to a word Pip
// cannot offer (say, be, grandmother) mints a ghost lemma the scorer
// counts but the board cannot show.
const IRREG = {
  went: 'go', got: 'get', gotten: 'get', gave: 'give', saw: 'see',
  ate: 'eat', took: 'take', made: 'make', came: 'come',
  ran: 'run', fell: 'fall', sat: 'sit', broke: 'break',
  did: 'do',
  had: 'have', has: 'have', "'ve": 'have', "'d": 'have', "'ll": 'will',
  would: 'will', could: 'can', should: 'will',
  // "used" backstrips to the pronoun "us" (i used to -> i us to) —
  // "use" is not a lemma, so the honest answer is a wall.
  used: null,
  "n't": 'not', "'m": 'am', "'re": 'are', "'s": 'is',
  cannot: 'can', "y'all": 'you', "ma'am": 'mom',
  mommy: 'mom', momma: 'mom', mama: 'mom', mum: 'mom', mummy: 'mom',
  daddy: 'dad', dada: 'dad', papa: 'dad', nana: 'grandma',
  granny: 'grandma', doggy: 'dog', kitty: 'cat', birdie: 'bird',
  ducky: 'duck', horsie: 'horse', potty: 'toilet', blankie: 'blanket',
  jammies: 'pajamas', pjs: 'pajamas',
  telly: 'tv', television: 'tv',
  undies: 'underwear', sippy: 'cup', woof: 'dog', meow: 'cat',
  'night-night': 'good night', nite: 'night', 'nite nite': 'good night',
};

const surface = {};
// Standalone lemmas first — a piece that is also a real word ("all",
// "my") stays itself. Then bare pieces of multiword lemmas map to the
// parent lemma (shortest, then alphabetical): a child's "done" is the
// "all done" tile. Mapping pieces to themselves minted ghost lemmas —
// offerable in the scorer, absent on the board (same class as the
// am/is/are -> be bug).
for (const w of LEMMAS) if (!w.includes(' ')) surface[w] = w;
for (const w of LEMMAS.filter((x) => x.includes(' ')).sort((a, b) => a.length - b.length || a.localeCompare(b))) {
  for (const piece of w.split(' ')) {
    const p = piece.match(/[a-zA-Z']+/g)?.join('');
    // Apostrophe pieces never ghost-map: "i'm" must reach the
    // contraction splitter, not the "wait, i'm spelling" tile.
    if (p && !p.includes("'") && !(p in surface)) surface[p] = w;
  }
}

function candForms(base) {
  const out = [base];
  out.push(base.endsWith('s') && base.length > 2 ? base.slice(0, -1) : base);
  out.push(base.endsWith('ies') ? base.slice(0, -2) + 'y' : base);
  out.push(base.endsWith('es') ? base.slice(0, -2) : base);
  for (const suf of ['ing', 'ed']) {
    if (base.endsWith(suf)) {
      const stem = base.slice(0, -suf.length);
      out.push(stem, stem + 'e', stem.length > 1 && stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : stem);
    }
  }
  return out;
}

export function toLemma(tok) {
  const t = tok.toLowerCase().trim();
  // surface first: Pip's vocab has am/is/are as words — mapping them to
  // 'be' (not a lemma) made the #1 word after "I" OOV and broke context
  if (t in surface) return surface[t];
  if (t in IRREG) return IRREG[t];
  for (const c of candForms(t)) {
    if (c in surface) return surface[c];
    if (c in IRREG) return IRREG[c];
  }
  return null;
}

// A pronoun/wh-word + be/will/have contraction splits into its parts
// when BOTH parts are Pip words (i'm -> i am, it's -> it is,
// that's -> that is, i'll -> i will). Real children say "i'm" ~14% of
// the time after "i" — sending the whole token to null (or worse, to a
// ghost phrase tile) both lost the #1 word and broke the context
// around it. Negative contractions that are lemmas (don't, can't)
// stay whole — the surface check catches them first.
const TAIL = { "'m": 'am', "'re": 'are', "'s": 'is', "'ll": 'will', "'ve": 'have', "'d": 'have' };
function expandContraction(t) {
  if (!t.includes("'") || t in surface || t in IRREG) return [t];
  for (const tail of Object.keys(TAIL)) {
    if (t.endsWith(tail) && t.length > tail.length) {
      const stem = t.slice(0, -tail.length);
      if (toLemma(stem) && toLemma(TAIL[tail])) return [stem, TAIL[tail]];
    }
  }
  // Xn't -> stem + not (isn't -> is not; the stem lemmatizes later).
  if (t.endsWith("n't") && t.length > 3) {
    const stem = t.slice(0, -3);
    if (toLemma(stem)) return [stem, "n't"];
  }
  return [t];
}

// CHILDES transcribers write casual speech the way it sounds and mark
// the standard form as `wanna [: want to]`; prep.py's tokenizer leaks
// that standard form as the words right after the reduction. So each
// entry does double duty: expand an unmarked reduction ourselves, and
// when the transcriber's standard form echoes right after, consume the
// echo so `gonna going to` counts once, not twice. These are spellings
// of speech, not grammar rules — they only run at table-build time.
export const CASUAL = {
  gonna: ['going', 'to'],
  wanna: ['want', 'to'],
  hafta: ['have', 'to'],
  hasta: ['has', 'to'],
  hadta: ['had', 'to'],
  gotta: ['got', 'to'],
  needta: ['need', 'to'],
  sposta: ['supposed', 'to'],
  oughta: ['ought', 'to'],
  gimme: ['give', 'me'],
  lemme: ['let', 'me'],
  dunno: ["don't", 'know'],
  lookit: ['look', 'at'],
  // further spelled-out reductions from the null-token census (020)
  kinda: ['kind', 'of'],
  sorta: ['sort', 'of'],
  outta: ['out', 'of'],
  lotta: ['lot', 'of'],
  cmon: ['come', 'on'],
  tryna: ['trying', 'to'],
  coulda: ['could', 'have'],
  shoulda: ['should', 'have'],
  woulda: ['would', 'have'],
  musta: ['must', 'have'],
  wanta: ['want', 'to'],
  gotcha: ['got', 'you'],
  betcha: ['bet', 'you'],
  didja: ['did', 'you'],
  doncha: ["don't", 'you'],
};

export function lemmatize(words) {
  const lw = [];
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi].toLowerCase();
    const exp = CASUAL[w];
    if (exp) {
      lw.push(...exp);
      // consume the transcriber's standard-form echo — either the
      // expanded words (`gonna [: going to]`) or another reduction that
      // expands the same way (`wanta [: wanna]`).
      const echo = words.slice(wi + 1, wi + 1 + exp.length).map((x) => x.toLowerCase());
      if (echo.join(' ') === exp.join(' ')) wi += exp.length;
      else if (CASUAL[echo[0]]?.join(' ') === exp.join(' ')) wi += 1;
      continue;
    }
    lw.push(...expandContraction(w));
  }
  const out = [];
  let i = 0;
  while (i < lw.length) {
    let hit = null;
    for (const mw of MULTIWORD) {
      const parts = mw.split(' ');
      if (lw.slice(i, i + parts.length).join(' ') === mw) { hit = mw; i += parts.length; break; }
    }
    if (hit) { out.push(hit); continue; }
    out.push(toLemma(lw[i]));
    i++;
  }
  return out;
}

// ---------- CPython-compatible RNG (reproduces random.Random(seed).shuffle) ----------
const MT_N = 624, MT_M = 397, MATRIX_A = 0x9908b0df;

export class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(MT_N);
    this.mti = MT_N + 1;
    this.seed(seed);
  }
  seed(a) {
    const key = [];
    let v = BigInt(a < 0 ? -a : a);
    while (v > 0n) { key.push(Number(v & 0xffffffffn)); v >>= 32n; }
    if (!key.length) key.push(0);
    this.initByArray(key);
  }
  initGenrand(s) {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < MT_N; i++)
      this.mt[i] = (Math.imul(1812433253, this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)) + i) >>> 0;
    this.mti = MT_N;
  }
  initByArray(key) {
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(MT_N, key.length); k > 0; k--) {
      this.mt[i] = ((this.mt[i] ^ Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      if (++i >= MT_N) { this.mt[0] = this.mt[MT_N - 1]; i = 1; }
      if (++j >= key.length) j = 0;
    }
    for (let k = MT_N - 1; k > 0; k--) {
      this.mt[i] = ((this.mt[i] ^ Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      if (++i >= MT_N) { this.mt[0] = this.mt[MT_N - 1]; i = 1; }
    }
    this.mt[0] = 0x80000000;
  }
  genrand() {
    const mag01 = [0, MATRIX_A];
    if (this.mti >= MT_N) {
      let kk;
      for (kk = 0; kk < MT_N - MT_M; kk++) {
        const y = (this.mt[kk] & 0x80000000) | (this.mt[kk + 1] & 0x7fffffff);
        this.mt[kk] = this.mt[kk + MT_M] ^ (y >>> 1) ^ mag01[y & 1];
      }
      for (; kk < MT_N - 1; kk++) {
        const y = (this.mt[kk] & 0x80000000) | (this.mt[kk + 1] & 0x7fffffff);
        this.mt[kk] = this.mt[kk + (MT_M - MT_N)] ^ (y >>> 1) ^ mag01[y & 1];
      }
      const y = (this.mt[MT_N - 1] & 0x80000000) | (this.mt[0] & 0x7fffffff);
      this.mt[MT_N - 1] = this.mt[MT_M - 1] ^ (y >>> 1) ^ mag01[y & 1];
      this.mti = 0;
    }
    let y = this.mt[this.mti++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  getrandbits(k) {
    if (k === 0) return 0n;
    if (k <= 32) return BigInt(this.genrand() >>> (32 - k));
    const words = Math.ceil(k / 32);
    let out = 0n;
    for (let i = 0; i < words; i++) {
      const take = Math.min(k - i * 32, 32);
      out |= BigInt(this.genrand() >>> (32 - take)) << BigInt(i * 32);
    }
    return out;
  }
  randbelow(n) {
    if (n <= 1) return 0;
    const k = n.toString(2).length; // n.bit_length()
    let r;
    do { r = this.getrandbits(k); } while (r >= BigInt(n));
    return Number(r);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ---------- CHILDES ----------
export const CHILD_TAGS = new Set(['CHI']);
export const ADULT_TAGS = new Set(['MOT', 'FAT', 'GMO', 'GRM', 'GFA', 'GRF', 'REL', 'VIS', 'AUN', 'UNC',
  'ADT', 'TEA', 'SST', 'INV', 'OBS', 'PLA', 'DOC', 'NU1', 'NU2', 'MED']);

export function loadTranscripts() {
  if (!existsSync(TRANSCRIPTS))
    throw new Error(`no transcript cache at ${TRANSCRIPTS} — run scripts/prediction/childes/prep.py`);
  return readFileSync(TRANSCRIPTS, 'utf8').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line).u.map(([s, ws]) => [s, ws ? ws.split(' ') : []]));
}

export function splitIdx(n, seed = 20260923) {
  const order = new PyRandom(seed).shuffle([...Array(n).keys()]);
  const cut = Math.floor(0.2 * n);
  return { test: new Set(order.slice(0, cut)), train: new Set(order.slice(cut)) };
}

export function mlu(utts) {
  const lens = utts.filter(([s, w]) => CHILD_TAGS.has(s) && w.length > 0).map(([, w]) => w.length);
  return lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
}

export const band = (m) => (m < 2 ? 'mlu_lt2' : m <= 3.5 ? 'mlu_2_35' : 'mlu_gt35');
export const BANDS = ['mlu_lt2', 'mlu_2_35', 'mlu_gt35'];
export const BAND_LABEL = { mlu_lt2: 'MLU<2', mlu_2_35: 'MLU 2-3.5', mlu_gt35: 'MLU>3.5' };
