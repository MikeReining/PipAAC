// Ava test: numbers FILTER, JEV DECIDES, on a child who has a history.
//
// Filter (relative frequency of the next word given the ENTIRE phrase so
// far; an unseen phrase backs off to its longest seen ending), merged in
// this order until K words:
//   1. Ava at this time of day (her sentences within +-90 min)
//   2. Ava, any time
//   3. children in general (CHILDES training split, child lines only)
// JEV sees: the phrase (her tiles), the time of day, the shortlist as plain
// words in shuffled order. No counts. One request per moment: a Choice
// (pick one) and a Noul per word (would she say it next).
//
//   node scripts/prediction/phrase_jev/run_ava.mjs [--k 20]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';
import { bookScores } from '../../../public/shared/opening_book.mjs';

const args = process.argv.slice(2);
const K = (() => { const i = args.indexOf('--k'); return i >= 0 ? Number(args[i + 1]) : 20; })();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const API_KEY = readFileSync(path.join(C.REPO, '.env'), 'utf8').match(/TYPESAFE_API_KEY=([^\r\n]+)/)[1].trim();
const BOOK = JSON.parse(readFileSync(path.join(C.REPO, 'data/prediction/opening_book.en.json'), 'utf8'));
const WINDOW_MIN = 90;

// Tiles: lowercase keys, shown in Ava's own spelling ("I", "Max", "TV").
const SHOW = new Map();
const toks = (s) => s.split(' ').map((w) => { const k = w.toLowerCase(); if (!SHOW.has(k)) SHOW.set(k, w); return k; });
const show = (k) => SHOW.get(k) ?? (k === 'i' ? 'I' : k);
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Phrase table: full prefix -> next-word counts.
const key = (p) => p.join(' ');
function add(table, sent, times = 1) {
  for (let j = 0; j < sent.length; j++) {
    const k = key(sent.slice(0, j));
    if (!table.has(k)) table.set(k, new Map());
    table.get(k).set(sent[j], (table.get(k).get(sent[j]) ?? 0) + times);
  }
}
function lookup(table, phrase) {
  for (let s = 0; s <= phrase.length; s++) {
    const m = table.get(key(phrase.slice(s)));
    if (m && m.size) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      return [...m.entries()].map(([w, c]) => [w, c / total]).sort((a, b) => b[1] - a[1]);
    }
  }
  return [];
}

// Children in general: CHILDES training split, child lines only.
const trs = C.loadTranscripts();
const { train } = C.splitIdx(trs.length, 20260923);
const corpus = new Map();
for (const i of train) {
  for (const [spk, words] of trs[i]) {
    if (!C.CHILD_TAGS.has(spk)) continue;
    let cur = [];
    for (const lem of C.lemmatize(words)) {
      if (lem === null) { if (cur.length) add(corpus, cur); cur = []; continue; }
      cur.push(lem);
    }
    if (cur.length) add(corpus, cur);
  }
}

// Ava's log: history = every sentence before the moment in time; test =
// the last day, exactly as it fell.
const LOG = JSON.parse(readFileSync(path.join(HERE, 'ava_log.json'), 'utf8'))
  .map((e) => ({ ...e, sent: toks(e.sentence), t: e.day * 1440 + minutes(e.at) }));
const TEST_DAY = Math.max(...LOG.map((e) => e.day));
const before = (t) => LOG.filter((e) => e.t < t);
const tableOf = (entries) => { const tb = new Map(); for (const e of entries) add(tb, e.sent); return tb; };

// Moments: every word of every test-day sentence.
const moments = [];
for (const e of LOG.filter((x) => x.day === TEST_DAY)) {
  for (let j = 0; j < e.sent.length; j++) moments.push({ sentence: e.sentence, at: e.at, t: e.t, phrase: e.sent.slice(0, j), target: e.sent[j] });
}

function filter(m) {
  const out = [];
  const past = before(m.t);
  const atTime = past.filter((e) => Math.abs(minutes(e.at) - minutes(m.at)) <= WINDOW_MIN);
  for (const [w] of [...lookup(tableOf(atTime), m.phrase), ...lookup(tableOf(past), m.phrase), ...lookup(corpus, m.phrase)]) {
    if (!out.includes(w)) out.push(w);
    if (out.length >= K) break;
  }
  return out;
}

const timeText = (hhmm) => {
  const h = minutes(hhmm) / 60;
  const part = h < 11 ? 'morning' : h < 16 ? 'afternoon' : 'evening';
  return `${hhmm} in the ${part}`;
};

async function askJev(m, cands) {
  const order = new C.PyRandom(minutes(m.at) * 100 + m.phrase.length).shuffle([...cands]);
  const candidates = Object.fromEntries(order.map((w, i) => [`c${i + 1}`, show(w)]));
  const phraseText = m.phrase.length ? m.phrase.map(show).join(' ') : '(nothing yet: she is starting a new sentence)';
  const intro = 'A 6-year-old girl builds sentences one tile at a time on a picture-communication board. Tiles are base word forms ("I am go" is normal). `phrase` is what she has tapped so far; `time` is when.';
  const questions = {
    pick: {
      type: 'choice',
      instructions: `${intro} Which word from \`candidates\` is she most likely to tap next?`,
      criteria: { ...candidates, none: 'None of these words fits as her next tile' },
    },
  };
  for (const k of Object.keys(candidates)) {
    questions[`fits_${k}`] = { type: 'noul', instructions: `${intro} Would she naturally tap \`candidates.${k}\` next?` };
  }
  const t0 = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-1.13.0', state: { phrase: phraseText, time: timeText(m.at), candidates }, questions }),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`JEV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const a = (await res.json()).answers;
  const idOf = Object.fromEntries(Object.entries(candidates).map(([k, v]) => [v, k]));
  const p = (w) => a.pick?.probabilities?.[idOf[show(w)]] ?? 0;
  const n = (w) => a[`fits_${idOf[show(w)]}`]?.noul ?? 0;
  return {
    ms, pNone: a.pick?.probabilities?.none ?? 0,
    choice: [...cands].sort((x, y) => p(y) - p(x)).slice(0, 4),
    noul: [...cands].sort((x, y) => n(y) - n(x)).slice(0, 4),
    choiceP: Object.fromEntries(cands.map((w) => [w, +p(w).toFixed(2)])),
  };
}

const rows = [];
for (const m of moments) {
  const cands = filter(m);
  const book = [...bookScores(BOOK, 'mlu_2_35', m.phrase.slice(-2)).entries()]
    .sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 4);
  rows.push({ ...m, cands, book, ...(await askJev(m, cands)) });
}

// ---- every row, then totals (starts and mid-sentence separately) ----
const mark = (list, t) => (list.includes(t) ? 'HIT' : '   ');
let last = '';
for (const r of rows) {
  if (r.sentence !== last) { console.log(`\n== "${r.sentence}"  (${r.at})`); last = r.sentence; }
  const ph = r.phrase.length ? r.phrase.map(show).join(' ') + ' ...' : '(start)';
  console.log(`  ${ph.padEnd(28)} -> ${show(r.target).padEnd(9)} in filter: ${r.cands.includes(r.target) ? 'yes' : 'NO '}`
    + ` | ${mark(r.book, r.target)} book [${r.book.map(show).join(', ')}]`
    + ` | ${mark(r.cands.slice(0, 4), r.target)} filter [${r.cands.slice(0, 4).map(show).join(', ')}]`
    + ` | ${mark(r.choice, r.target)} JEV [${r.choice.map((w) => `${show(w)} ${r.choiceP[w]}`).join(', ')}]`
    + ` | ${mark(r.noul, r.target)} noul [${r.noul.map(show).join(', ')}]`);
}
const tally = (rs, label) => {
  const c = (f) => rs.filter(f).length;
  console.log(`${label.padEnd(15)} ${String(rs.length).padStart(3)} moments | in filter ${c((r) => r.cands.includes(r.target))}`
    + ` | hit@4: book ${c((r) => r.book.includes(r.target))}, filter ${c((r) => r.cands.slice(0, 4).includes(r.target))},`
    + ` JEV choice ${c((r) => r.choice.includes(r.target))}, JEV noul ${c((r) => r.noul.includes(r.target))}`
    + ` | hit@1: filter ${c((r) => r.cands[0] === r.target)}, JEV choice ${c((r) => r.choice[0] === r.target)}`);
};
console.log('\n----');
tally(rows.filter((r) => r.phrase.length === 0), 'sentence start');
tally(rows.filter((r) => r.phrase.length > 0), 'mid-sentence');
tally(rows, 'all');
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`JEV latency p50 ${ms[ms.length >> 1]} ms, max ${ms.at(-1)} ms, ${rows.length} requests`);
writeFileSync(path.join(HERE, 'ava_results.json'), JSON.stringify(rows, null, 1));
