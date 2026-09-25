// Ava test 2: repeats AND new sentences; JEV blind vs JEV informed by the
// phrase evidence; and a 3+1 strip whose 4th tile is JEV's English step.
//
// Test window: the last 3 days of the log, exactly as they fell. Every
// moment's history is everything before it in time. Adult speech does not
// exist in this data (the device never hears it).
//
// Filter: relative frequency of the next word given the ENTIRE phrase so
// far (an unseen phrase backs off to its longest seen ending), merged:
// Ava within +-90 min of now, Ava any time, children in general (CHILDES
// training split). K words.
//
// Arms (same moments):
//   filter    -- the filter's own top 4
//   blind     -- JEV Choice over the shortlist: phrase + time + words only
//   informed  -- JEV Choice with per-word evidence: how often SHE tapped it
//                after this phrase, and how often children in general do
//   3+1       -- informed top 3 + blind's best word not already shown (the
//                English-step tile)
// blind and informed are SEPARATE requests: questions in one request share
// state, so a "blind" question beside the evidence would not be blind.
//
//   node scripts/prediction/phrase_jev/run_ava2.mjs [--k 20] [--days 3]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';
import { bookScores } from '../../../public/shared/opening_book.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const K = opt('k', 20);
const DAYS = opt('days', 3);
// Days of her past the system has seen before the test window (default:
// all). 0 = a brand-new user: only earlier sentences from the test day.
const HIST = opt('hist', 999);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const API_KEY = readFileSync(path.join(C.REPO, '.env'), 'utf8').match(/TYPESAFE_API_KEY=([^\r\n]+)/)[1].trim();
const BOOK = JSON.parse(readFileSync(path.join(C.REPO, 'data/prediction/opening_book.en.json'), 'utf8'));
const WINDOW_MIN = 90;

const SHOW = new Map();
const toks = (s) => s.split(' ').map((w) => { const k = w.toLowerCase(); if (!SHOW.has(k)) SHOW.set(k, w); return k; });
const show = (k) => SHOW.get(k) ?? (k === 'i' ? 'I' : k);
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Phrase table: full prefix -> next-word counts.
const key = (p) => p.join(' ');
function add(table, sent) {
  for (let j = 0; j < sent.length; j++) {
    const k = key(sent.slice(0, j));
    if (!table.has(k)) table.set(k, new Map());
    table.get(k).set(sent[j], (table.get(k).get(sent[j]) ?? 0) + 1);
  }
}
// The phrase's endings, LONGEST FIRST, down to its last word (a
// mid-sentence phrase never backs off to the empty key: that means "start
// of a sentence"). `ranked` walks the whole chain -- the longest seen
// ending's words first, shorter endings only fill what is missing -- so a
// long ending with two continuations ("to take" -> it, the) no longer
// empties the list. `ending`/`total` describe the longest seen ending,
// which is what the evidence quotes.
function lookup(table, phrase) {
  const shortest = phrase.length ? phrase.length - 1 : 0;
  let head = null; const ranked = []; const seen = new Set();
  for (let s = 0; s <= shortest; s++) {
    const ending = phrase.slice(s);
    const m = table.get(key(ending));
    if (!m || !m.size) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (!head) head = { ending, total, counts: m };
    for (const [w, c] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      if (!seen.has(w)) { seen.add(w); ranked.push([w, c / total, head.counts.get(w) ?? 0]); }
    }
  }
  return { ending: head?.ending ?? null, total: head?.total ?? 0, ranked };
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

const LOG = JSON.parse(readFileSync(path.join(HERE, 'ava_log.json'), 'utf8'))
  .map((e) => ({ ...e, sent: toks(e.sentence), t: e.day * 1440 + minutes(e.at) }));
const LAST = Math.max(...LOG.map((e) => e.day));
const FIRST_SEEN = LAST - DAYS + 1 - HIST;  // earliest day the system knows
const before = (t) => LOG.filter((e) => e.t < t && e.day >= FIRST_SEEN);
const tableOf = (entries) => { const tb = new Map(); for (const e of entries) add(tb, e.sent); return tb; };

const moments = [];
for (const e of LOG.filter((x) => x.day > LAST - DAYS)) {
  const isNew = !before(e.t).some((p) => p.sentence === e.sentence);
  for (let j = 0; j < e.sent.length; j++) {
    moments.push({ sentence: e.sentence, day: e.day, dow: e.dow, at: e.at, t: e.t, isNew, phrase: e.sent.slice(0, j), target: e.sent[j] });
  }
}

function filter(m) {
  const past = before(m.t);
  const atTime = past.filter((e) => Math.abs(minutes(e.at) - minutes(m.at)) <= WINDOW_MIN);
  const avaNow = lookup(tableOf(atTime), m.phrase);
  const avaAll = lookup(tableOf(past), m.phrase);
  const kids = lookup(corpus, m.phrase);
  const cands = [];
  for (const [w] of [...avaNow.ranked, ...avaAll.ranked, ...kids.ranked]) {
    if (!cands.includes(w)) cands.push(w);
    if (cands.length >= K) break;
  }
  // Evidence per word, in words a person would read.
  const phraseOf = (end) => (end && end.length ? `"${end.map(show).join(' ')}"` : 'the start of a sentence');
  const said = (lk, w) => { const hit = lk.ranked.find(([x]) => x === w); return hit ? hit[2] : 0; };
  const evidence = Object.fromEntries(cands.map((w) => {
    const n = said(avaAll, w);
    const kidShare = kids.ranked.find(([x]) => x === w)?.[1] ?? 0;
    return [w, {
      she_tapped_it_next: avaAll.total ? `${n} of ${avaAll.total} times after ${phraseOf(avaAll.ending)}` : 'no history for this phrase',
      at_this_time_of_day: avaNow.total ? `${said(avaNow, w)} of ${avaNow.total} times` : 'no history at this time',
      children_in_general: kidShare ? `${(kidShare * 100).toFixed(1)}% of the time after ${phraseOf(kids.ending)}` : 'rare',
    }];
  }));
  return { cands, evidence };
}

const timeText = (m) => {
  const h = minutes(m.at) / 60;
  return `${m.dow} ${m.at}, ${h < 11 ? 'morning' : h < 16 ? 'afternoon' : 'evening'}`;
};
const INTRO = 'A 6-year-old girl builds sentences one tile at a time on a picture-communication board. Tiles are base word forms ("I am go" is normal). `phrase` is what she has tapped so far; `time` is when.';

async function ask(state, instructions, candidates) {
  const t0 = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-1.13.0', state,
      questions: { pick: { type: 'choice', instructions, criteria: { ...candidates, none: 'None of these words fits as her next tile' } } },
    }),
  });
  if (!res.ok) throw new Error(`JEV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { probs: (await res.json()).answers.pick?.probabilities ?? {}, ms: Math.round(performance.now() - t0) };
}

async function decide(m, cands, evidence) {
  const order = new C.PyRandom(m.t * 100 + m.phrase.length).shuffle([...cands]);
  const ids = order.map((w, i) => [`c${i + 1}`, w]);
  const candidates = Object.fromEntries(ids.map(([k, w]) => [k, show(w)]));
  const phrase = m.phrase.length ? m.phrase.map(show).join(' ') : '(nothing yet: she is starting a new sentence)';
  const blind = await ask({ phrase, time: timeText(m), candidates },
    `${INTRO} Which word from \`candidates\` is she most likely to tap next?`, candidates);
  const informed = await ask(
    { phrase, time: timeText(m), candidates, evidence: Object.fromEntries(ids.map(([k, w]) => [k, evidence[w]])) },
    `${INTRO} \`evidence\` says, for each candidate, how often SHE has tapped it next after this phrase, at this time of day, and how often children in general do. Using that evidence and what makes sense in English, which word from \`candidates\` is she most likely to tap next?`,
    candidates);
  const rank = (probs) => ids.map(([k, w]) => [w, probs[k] ?? 0]).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const b = rank(blind.probs); const f = rank(informed.probs);
  const threePlusOne = [...f.slice(0, 3), b.find((w) => !f.slice(0, 3).includes(w))].filter(Boolean);
  return { blind: b.slice(0, 4), informed: f.slice(0, 4), threePlusOne, ms: [blind.ms, informed.ms] };
}

const rows = [];
for (const m of moments) {
  const { cands, evidence } = filter(m);
  const book = [...bookScores(BOOK, 'mlu_2_35', m.phrase.slice(-2)).entries()]
    .sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 4);
  rows.push({ ...m, cands, book, filter4: cands.slice(0, 4), ...(await decide(m, cands, evidence)) });
}

// ---- rows for new sentences in full; repeats summarized ----
const mark = (list, t) => (list.includes(t) ? 'HIT' : '   ');
const line = (r) => {
  const ph = r.phrase.length ? r.phrase.map(show).join(' ') + ' ...' : '(start)';
  return `  ${ph.padEnd(30)} -> ${show(r.target).padEnd(8)}`
    + ` | ${mark(r.filter4, r.target)} filter [${r.filter4.map(show).join(', ')}]`
    + ` | ${mark(r.blind, r.target)} blind [${r.blind.map(show).join(', ')}]`
    + ` | ${mark(r.informed, r.target)} informed [${r.informed.map(show).join(', ')}]`
    + ` | ${mark(r.threePlusOne, r.target)} 3+1 [${r.threePlusOne.map(show).join(', ')}]`;
};
let last = '';
for (const r of rows) {
  const head = `${r.dow} ${r.at} "${r.sentence}"${r.isNew ? '  <- NEW' : ''}`;
  if (head !== last) { console.log(`\n== ${head}`); last = head; }
  console.log(line(r));
}
const ARMS = [['book', 'book'], ['filter', 'filter4'], ['JEV blind', 'blind'], ['JEV informed', 'informed'], ['3+1', 'threePlusOne']];
const tally = (rs, label) => {
  if (!rs.length) return;
  const c = (k) => rs.filter((r) => r[k].includes(r.target)).length;
  const first = (k) => rs.filter((r) => r[k][0] === r.target).length;
  console.log(`${label.padEnd(22)} ${String(rs.length).padStart(3)} | in filter ${rs.filter((r) => r.cands.includes(r.target)).length}`
    + ' | top4 ' + ARMS.map(([n, k]) => `${n} ${c(k)}`).join(', ')
    + ` | first: filter ${first('filter4')}, informed ${first('informed')}`);
};
console.log('\n---- word-moments');
for (const [nw, lbl] of [[false, 'repeat sentences'], [true, 'NEW sentences']]) {
  tally(rows.filter((r) => r.isNew === nw && r.phrase.length === 0), `${lbl}, start`);
  tally(rows.filter((r) => r.isNew === nw && r.phrase.length > 0), `${lbl}, mid`);
}
tally(rows, 'all');
const ms = rows.flatMap((r) => r.ms).sort((a, b) => a - b);
console.log(`JEV latency p50 ${ms[ms.length >> 1]} ms, max ${ms.at(-1)} ms, ${ms.length} requests`);
writeFileSync(path.join(HERE, `ava2_results_hist${HIST}.json`), JSON.stringify(rows, null, 1));
