// Small-batch test (N moments, default 20): numbers FILTER, JEV DECIDES.
//
// Device-faithful inputs only. The device knows the tiles tapped so far
// in this sentence and this child's own earlier sentences. It never hears
// the parent or teacher, so ADULT LINES ARE REMOVED AT LOAD -- nothing
// below can read them. Time of day is not in CHILDES (no clock times), so
// it is not tested here.
//
// Filter: relative frequency of the next word given the ENTIRE phrase so
// far (not the previous word, not total frequency), from two tables:
//   child  -- this child's earlier sentences in the session (causal)
//   corpus -- children in the training split only
// An unseen phrase backs off to its longest seen ending.
// JEV: sees the phrase as the tiles read in English plus the shortlist as
// plain words (shuffled; no counts), and judges each word (Noul) and
// picks one (Choice), all in ONE request.
//
//   node scripts/prediction/phrase_jev/run_small.mjs [--n 20] [--k 20]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';
import { bookScores } from '../../../public/shared/opening_book.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const N = opt('n', 20);
const K = opt('k', 20);
const SEED = 20260924;
const MIN_HISTORY = 20; // child sentences already said in the session

const API_KEY = readFileSync(path.join(C.REPO, '.env'), 'utf8').match(/TYPESAFE_API_KEY=([^\r\n]+)/)[1].trim();
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-1.13.0';

// The tiles' own spelling ("I", not "i").
const lex = JSON.parse(readFileSync(path.join(C.REPO, 'data/launch_lexicon.json'), 'utf8')).entries;
const TILE = Object.fromEntries(lex.map((e) => [e.spokenText.toLowerCase(), e.spokenText]));
const tile = (lem) => TILE[lem] ?? lem;

// ---- load: child lines only; adult and every other speaker dropped ----
const trs = C.loadTranscripts().map((utts) =>
  utts.filter(([spk]) => C.CHILD_TAGS.has(spk)).map(([, words]) => words));
const { train, test } = C.splitIdx(trs.length, 20260923);

// A child line -> its sentences as tile sequences (an untappable word ends one).
function sentences(words) {
  const out = []; let cur = [];
  for (const lem of C.lemmatize(words)) {
    if (lem === null) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(lem);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---- phrase table: full prefix -> next-word counts ----
const key = (phrase) => phrase.join(' ');
function addSentence(table, sent) {
  for (let j = 0; j < sent.length; j++) {
    const k = key(sent.slice(0, j));
    if (!table.has(k)) table.set(k, new Map());
    const m = table.get(k);
    m.set(sent[j], (m.get(sent[j]) ?? 0) + 1);
  }
}
// Longest seen ending of the phrase -> relative frequencies there.
function lookup(table, phrase) {
  for (let s = 0; s <= phrase.length; s++) {
    const ending = phrase.slice(s);
    const m = table.get(key(ending));
    if (m && m.size) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const ranked = [...m.entries()].map(([w, c]) => [w, c / total]).sort((a, b) => b[1] - a[1]);
      return { matchedLen: ending.length, ranked };
    }
  }
  return { matchedLen: -1, ranked: [] };
}

const corpus = new Map();
for (const i of train) for (const line of trs[i]) for (const s of sentences(line)) addSentence(corpus, s);

// ---- moments: held-out children, after MIN_HISTORY of their own sentences ----
const rng = new C.PyRandom(SEED);
const pool = [];
for (const i of [...test].sort((a, b) => a - b)) {
  const sents = trs[i].flatMap(sentences);
  if (sents.length <= MIN_HISTORY) continue;
  for (let si = MIN_HISTORY; si < sents.length; si++) {
    for (let j = 0; j < sents[si].length; j++) pool.push({ t: i, si, j });
  }
}
const picks = rng.shuffle(pool).slice(0, N);

const moments = picks.map(({ t, si, j }) => {
  const sents = trs[t].flatMap(sentences);
  const child = new Map();
  for (const s of sents.slice(0, si)) addSentence(child, s); // earlier sentences only
  const phrase = sents[si].slice(0, j);
  const target = sents[si][j];
  const ch = lookup(child, phrase);
  const co = lookup(corpus, phrase);
  // Filter: this child's words first, then children in general; cap K.
  const cands = [];
  for (const [w] of [...ch.ranked, ...co.ranked]) {
    if (!cands.includes(w)) cands.push(w);
    if (cands.length >= K) break;
  }
  const band = C.band(C.mlu(trs[t].map((w) => ['CHI', w])));
  const book = [...bookScores(JSON.parse(readFileSync(path.join(C.REPO, 'data/prediction/opening_book.en.json'), 'utf8')), band, phrase.slice(-2)).entries()]
    .sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 4);
  return { t, si, j, phrase, target, cands, childMatch: ch.matchedLen, corpusMatch: co.matchedLen, book };
});

// ---- JEV: one request per moment ----
async function askJev(m) {
  const order = new C.PyRandom(SEED + m.t * 1000 + m.si * 10 + m.j).shuffle([...m.cands]);
  const candidates = Object.fromEntries(order.map((w, i) => [`c${i + 1}`, tile(w)]));
  const phraseText = m.phrase.length ? m.phrase.map(tile).join(' ') : '(nothing yet -- starting a new sentence)';
  const questions = {
    pick: {
      type: 'choice',
      instructions: 'A young child is building a sentence one word at a time on a picture board. `phrase` is what they have so far. Which word from `candidates` is the child most likely to say as the very next word?',
      criteria: { ...candidates, none: 'None of these words fits as the next word' },
    },
  };
  for (const k of Object.keys(candidates)) {
    questions[`fits_${k}`] = {
      type: 'noul',
      instructions: `A young child is building a sentence one word at a time on a picture board. \`phrase\` is what they have so far. Would the child naturally say \`candidates.${k}\` as the very next word?`,
    };
  }
  const t0 = performance.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, state: { phrase: phraseText, candidates }, questions }),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`JEV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const byWord = (w) => Object.entries(candidates).find(([, v]) => v === tile(w))?.[0];
  const probs = data.answers.pick?.probabilities ?? {};
  const choiceTop4 = [...m.cands].sort((a, b) => (probs[byWord(b)] ?? 0) - (probs[byWord(a)] ?? 0)).slice(0, 4);
  const noulOf = (w) => data.answers[`fits_${byWord(w)}`]?.noul ?? 0;
  const noulTop4 = [...m.cands].sort((a, b) => noulOf(b) - noulOf(a)).slice(0, 4);
  return { ms, phraseText, choiceTop4, noulTop4, pNone: probs.none ?? null,
    noul: Object.fromEntries(m.cands.map((w) => [w, +noulOf(w).toFixed(2)])), usage: data.usage };
}

const rows = [];
for (const m of moments) {
  const j = await askJev(m);
  rows.push({ ...m, ...j });
}

// ---- report: every row, then the totals ----
const hit = (list, target) => (list.includes(target) ? 'HIT' : '   ');
for (const [n, r] of rows.entries()) {
  console.log(`\n#${n + 1}  phrase: "${r.phraseText}"   next word: ${tile(r.target)}`);
  console.log(`   filter has it: ${r.cands.includes(r.target) ? 'yes' : 'NO '}  (child matched ${r.childMatch} words, children matched ${r.corpusMatch})`);
  console.log(`   ${hit(r.book, r.target)} book today : ${r.book.map(tile).join(', ')}`);
  console.log(`   ${hit(r.cands.slice(0, 4), r.target)} filter only: ${r.cands.slice(0, 4).map(tile).join(', ')}`);
  console.log(`   ${hit(r.noulTop4, r.target)} JEV noul   : ${r.noulTop4.map((w) => `${tile(w)} ${r.noul[w]}`).join(', ')}`);
  console.log(`   ${hit(r.choiceTop4, r.target)} JEV choice : ${r.choiceTop4.map(tile).join(', ')}   (none ${r.pNone?.toFixed(2)})   ${r.ms} ms`);
}
const count = (f) => rows.filter(f).length;
console.log(`\n---- ${rows.length} moments ----`);
console.log(`filter contains the word (top ${K}): ${count((r) => r.cands.includes(r.target))}`);
console.log(`hit@4  book today ${count((r) => r.book.includes(r.target))} | filter only ${count((r) => r.cands.slice(0, 4).includes(r.target))} | JEV noul ${count((r) => r.noulTop4.includes(r.target))} | JEV choice ${count((r) => r.choiceTop4.includes(r.target))}`);
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`latency p50 ${ms[ms.length >> 1]} ms, max ${ms.at(-1)} ms`);
writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `small_${N}.json`), JSON.stringify(rows, null, 1));
