// Ava test 3: hit rate AND nonsense, 20 mid-sentence moments on the test
// Monday, for a brand-new user (--hist 0) and for 20 days of history.
//
// Bars compared (4 tiles each):
//   history -- her phrase history, then children in general (the filter)
//   jev     -- JEV Choice informed by the phrase evidence, over the top 20
//   routed  -- history decides when she has built THIS exact phrase at
//              this time of day >= ROUTE_MIN times; otherwise JEV informed
//              decides from a wider list (top 60)
//   veto    -- history's order, but a tile JEV judges not a sensible next
//              word (Noul < VETO) is dropped and the next candidate moves up
// Nonsense is judged afterwards, per shown tile, by an outside judge (not
// JEV, not our counts): see judge_ava3.json.
//
//   node scripts/prediction/phrase_jev/run_ava3.mjs --hist 0|20
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const HIST = opt('hist', 20);
const N = opt('n', 20);
const K = 20, K_WIDE = 60, VETO_POOL = 12, ROUTE_MIN = 3, VETO = 0.2, WINDOW_MIN = 90;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const API_KEY = readFileSync(path.join(C.REPO, '.env'), 'utf8').match(/TYPESAFE_API_KEY=([^\r\n]+)/)[1].trim();

const SHOW = new Map();
const toks = (s) => s.split(' ').map((w) => { const k = w.toLowerCase(); if (!SHOW.has(k)) SHOW.set(k, w); return k; });
const show = (k) => SHOW.get(k) ?? (k === 'i' ? 'I' : k);
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

const key = (p) => p.join(' ');
function add(table, sent) {
  for (let j = 0; j < sent.length; j++) {
    const k = key(sent.slice(0, j));
    if (!table.has(k)) table.set(k, new Map());
    table.get(k).set(sent[j], (table.get(k).get(sent[j]) ?? 0) + 1);
  }
}
// Endings longest first down to the last word; shorter endings only fill.
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
const before = (t) => LOG.filter((e) => e.t < t && e.day >= LAST - HIST);
const tableOf = (entries) => { const tb = new Map(); for (const e of entries) add(tb, e.sent); return tb; };

// 20 mid-sentence moments of the test day, the same set for every --hist.
const all = [];
for (const e of LOG.filter((x) => x.day === LAST)) {
  for (let j = 1; j < e.sent.length; j++) all.push({ sentence: e.sentence, dow: e.dow, at: e.at, t: e.t, phrase: e.sent.slice(0, j), target: e.sent[j] });
}
const moments = new C.PyRandom(20260925).shuffle([...all]).slice(0, N).sort((a, b) => a.t - b.t || a.phrase.length - b.phrase.length);

function evidenceFor(m, k) {
  const past = before(m.t);
  const atTime = past.filter((e) => Math.abs(minutes(e.at) - minutes(m.at)) <= WINDOW_MIN);
  const avaNow = lookup(tableOf(atTime), m.phrase);
  const avaAll = lookup(tableOf(past), m.phrase);
  const kids = lookup(corpus, m.phrase);
  const cands = [];
  for (const [w] of [...avaNow.ranked, ...avaAll.ranked, ...kids.ranked]) {
    if (!cands.includes(w)) cands.push(w);
    if (cands.length >= k) break;
  }
  const phraseOf = (end) => (end && end.length ? `"${end.map(show).join(' ')}"` : 'the start of a sentence');
  const said = (lk, w) => lk.ranked.find(([x]) => x === w)?.[2] ?? 0;
  const evidence = Object.fromEntries(cands.map((w) => {
    const kidShare = kids.ranked.find(([x]) => x === w)?.[1] ?? 0;
    return [w, {
      she_tapped_it_next: avaAll.total ? `${said(avaAll, w)} of ${avaAll.total} times after ${phraseOf(avaAll.ending)}` : 'no history for this phrase',
      at_this_time_of_day: avaNow.total ? `${said(avaNow, w)} of ${avaNow.total} times` : 'no history at this time',
      children_in_general: kidShare ? `${(kidShare * 100).toFixed(1)}% of the time after ${phraseOf(kids.ending)}` : 'rare',
    }];
  }));
  // How many times she has built THIS EXACT phrase at this time of day.
  const exactNow = [...(tableOf(atTime).get(key(m.phrase)) ?? new Map()).values()].reduce((a, b) => a + b, 0);
  return { cands, evidence, exactNow };
}

const timeText = (m) => { const h = minutes(m.at) / 60; return `${m.dow} ${m.at}, ${h < 11 ? 'morning' : h < 16 ? 'afternoon' : 'evening'}`; };
const INTRO = 'A 6-year-old girl builds sentences one tile at a time on a picture-communication board. Tiles are base word forms ("I am go" is normal). `phrase` is what she has tapped so far; `time` is when.';
const phraseText = (m) => m.phrase.map(show).join(' ');

async function call(state, questions) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-1.13.0', state, questions }),
  });
  if (!res.ok) throw new Error(`JEV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).answers;
}
const shuffled = (m, cands) => new C.PyRandom(m.t * 100 + m.phrase.length + cands.length).shuffle([...cands]).map((w, i) => [`c${i + 1}`, w]);

async function informed(m, { cands, evidence }) {
  if (!cands.length) return [];
  const ids = shuffled(m, cands);
  const candidates = Object.fromEntries(ids.map(([k, w]) => [k, show(w)]));
  const a = await call(
    { phrase: phraseText(m), time: timeText(m), candidates, evidence: Object.fromEntries(ids.map(([k, w]) => [k, evidence[w]])) },
    { pick: { type: 'choice',
      instructions: `${INTRO} \`evidence\` says, for each candidate, how often SHE has tapped it next after this phrase, at this time of day, and how often children in general do. Using that evidence and what makes sense in English, which word from \`candidates\` is she most likely to tap next?`,
      criteria: { ...candidates, none: 'None of these words fits as her next tile' } } });
  const p = a.pick?.probabilities ?? {};
  return ids.map(([k, w]) => [w, p[k] ?? 0]).sort((x, y) => y[1] - x[1]).map(([w]) => w);
}

// The veto: is each word a SENSIBLE next word at all (not: the likely one)?
async function sensible(m, words) {
  if (!words.length) return {};
  const ids = words.map((w, i) => [`c${i + 1}`, w]);
  const candidates = Object.fromEntries(ids.map(([k, w]) => [k, show(w)]));
  const questions = Object.fromEntries(ids.map(([k]) => [`ok_${k}`, { type: 'noul',
    instructions: `${INTRO} Is \`candidates.${k}\` a sensible next word after \`phrase\` -- one that could continue it into a meaningful sentence? It does not have to be the most likely word; answer only whether it makes sense there.` }]));
  const a = await call({ phrase: phraseText(m), candidates }, questions);
  return Object.fromEntries(ids.map(([k, w]) => [w, a[`ok_${k}`]?.noul ?? 0]));
}

const rows = [];
for (const m of moments) {
  const ev = evidenceFor(m, K);
  const history = ev.cands.slice(0, 4);
  const jev = (await informed(m, ev)).slice(0, 4);
  let routed; let route;
  if (ev.exactNow >= ROUTE_MIN) { routed = history; route = `history (built ${ev.exactNow}x at this time)`; }
  else { routed = (await informed(m, evidenceFor(m, K_WIDE))).slice(0, 4); route = `JEV wide (built ${ev.exactNow}x at this time)`; }
  const ok = await sensible(m, ev.cands.slice(0, VETO_POOL));
  const veto = ev.cands.slice(0, VETO_POOL).filter((w) => ok[w] >= VETO).slice(0, 4);
  const vetoed = history.filter((w) => ok[w] < VETO);
  rows.push({ ...m, history, jev, routed, route, veto, vetoed, sense: Object.fromEntries(Object.entries(ok).map(([w, v]) => [w, +v.toFixed(2)])) });
}

writeFileSync(path.join(HERE, `ava3_hist${HIST}.json`), JSON.stringify(rows.map((r) => ({
  sentence: r.sentence, at: r.at, phrase: phraseText(r), target: show(r.target),
  history: r.history.map(show), jev: r.jev.map(show), routed: r.routed.map(show), route: r.route,
  veto: r.veto.map(show), vetoed: r.vetoed.map(show), sense: r.sense,
})), null, 1));
for (const r of rows) {
  const f = (list) => list.map((w) => (w === r.target ? `[${show(w)}]` : show(w))).join(', ');
  console.log(`${r.at} "${r.sentence}" | ${phraseText(r)} -> ${show(r.target)} | history: ${f(r.history)} | jev: ${f(r.jev)} | routed: ${f(r.routed)} | veto: ${f(r.veto)}${r.vetoed.length ? ` (vetoed ${r.vetoed.map(show).join(', ')})` : ''}`);
}
