// Smart bar v2 gate check: the same 20 mid-sentence moments run_ava3.mjs
// sampled (PyRandom 20260925), judged nonsense set in judge_ava3.json.
// Runs the real funnel (stripRanked) at hist 0 and hist 20, then applies
// candidate evidence gates off the row's own evidence — no gate baked
// into the run — and reports hits / nonsense tiles / empty slots.
//
//   node scripts/prediction/phrase_jev/gate_check_v2.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';
import { createDatabase, importCatalog } from '../../../src/board/catalog.mjs';
import { addPersonalEntity } from '../../../src/board/entities.mjs';
import {
  openSentence, closeSentence, logSelection, stripRanked,
} from '../../../public/shared/funnel.mjs';
import catalog from '../../../data/catalog/catalog.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, '../../..');
const kids = JSON.parse(readFileSync(path.join(REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));
const JUDGE = JSON.parse(readFileSync(path.join(HERE, 'judge_ava3.json'), 'utf8'));
const LOG = JSON.parse(readFileSync(path.join(HERE, 'ava_log.json'), 'utf8'))
  .map((e) => ({ ...e, sent: e.sentence.toLowerCase().split(' ') }));
const LAST = Math.max(...LOG.map((e) => e.day));
const BASE = Date.parse('2026-09-21T00:00:00');
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const ts = (e) => BASE + (e.day - LAST) * 86400000 + minutes(e.at) * 60000;

const lemmaSense = new Map();
for (const l of catalog.labels) {
  if (l.kind === 'lemma' && l.status === 'approved' && l.locale === 'en' && !lemmaSense.has(l.normalized_text)) {
    lemmaSense.set(l.normalized_text, l.sense_id);
  }
}
const WORDS = [...new Set(LOG.flatMap((e) => e.sent))];

function freshDb() {
  const db = createDatabase(':memory:');
  importCatalog(db, catalog);
  const itemOf = {};
  for (const w of WORDS.sort()) {
    const sid = lemmaSense.get(w);
    itemOf[w] = sid
      ? { kind: 'sense', id: sid }
      : { kind: 'entity', id: addPersonalEntity(db, { spokenName: w }).id };
  }
  return { db, itemOf };
}

function say(db, itemOf, sent, at) {
  const s = openSentence(db, at);
  sent.forEach((w, i) => {
    const it = itemOf[w];
    logSelection(db, it.kind, it.id, at + i * 1000, { sentenceId: s, position: i });
  });
  closeSentence(db, s, at + sent.length * 1000, 'spoken');
}

// The same 20 moments run_ava3 sampled.
const all = [];
for (const e of LOG.filter((x) => x.day === LAST)) {
  for (let j = 1; j < e.sent.length; j++) {
    all.push({ e, t: e.day * 1440 + minutes(e.at), phrase: e.sent.slice(0, j), target: e.sent[j] });
  }
}
const moments = new C.PyRandom(20260925).shuffle([...all]).slice(0, 20)
  .sort((a, b) => a.t - b.t || a.phrase.length - b.phrase.length);

// Judge keys phrases in display case ("I want my") — lowercase both sides.
const nonsenseOf = (phrase) =>
  JUDGE.nonsense[phrase.map((w) => (w === 'i' ? 'I' : w)).join(' ')]
  ?? JUDGE.nonsense[phrase.join(' ')] ?? [];

for (const HIST of [0, 20]) {
  const { db, itemOf } = freshDb();
  for (const e of LOG) {
    if (e.day !== LAST && e.day >= LAST - HIST) say(db, itemOf, e.sent, ts(e));
  }
  // Replay the test day in order; evaluate each sampled moment mid-way.
  const bySentence = new Map();
  for (const m of moments) {
    if (!bySentence.has(m.e)) bySentence.set(m.e, []);
    bySentence.get(m.e).push(m);
  }
  const rankedAt = new Map();
  for (const e of LOG.filter((x) => x.day === LAST)) {
    for (const m of bySentence.get(e) ?? []) {
      const phrase = m.phrase.map((w) => itemOf[w]);
      const { ranked } = stripRanked(db, phrase, ts(e) + m.phrase.length * 1000, 'en', kids);
      rankedAt.set(m, ranked);
    }
    say(db, itemOf, e.sent, ts(e));
  }

  const wordOf = {};
  for (const w of WORDS) wordOf[itemOf[w].id] = w;

  if (HIST === 0 || HIST === 20) {
    console.log('  nonsense tiles under the ungated bar:');
    for (const m of moments) {
      const bad = new Set(nonsenseOf(m.phrase));
      for (const c of rankedAt.get(m).slice(0, 4)) {
        const w = c.kind === 'sense' ? wordOf[c.id] : `(${c.id})`;
        if (bad.has(w)) {
          console.log(`    "${m.phrase.join(' ')}" -> ${w}  her=${c.her} kid=${c.kid ? `${(c.kid.share * 100).toFixed(1)}%/${c.kid.total}` : 'none'}`);
        }
      }
    }
  }
  const gates = [
    ['none (all merged)', null],
    ['her>=2 | kid>=5% of >=30', { herMin: 2, kidShare: 0.05, kidMin: 30 }],
    ['her>=2 | kid>=7% of >=30', { herMin: 2, kidShare: 0.07, kidMin: 30 }],
    ['her>=2 | kid>=8% of >=30', { herMin: 2, kidShare: 0.08, kidMin: 30 }],
    ['her>=2 | kid>=7% of >=100', { herMin: 2, kidShare: 0.07, kidMin: 100 }],
    ['her>=2 | kid>=10% of >=30', { herMin: 2, kidShare: 0.10, kidMin: 30 }],
    ['her>=3 | kid>=7% of >=30', { herMin: 3, kidShare: 0.07, kidMin: 30 }],
  ];
  console.log(`\n=== hist ${HIST} ===`);
  const misses = {};
  for (const [name, g] of gates) {
    let hits = 0, nonsense = 0, empty = 0, tiles = 0;
    const lost = [];
    for (const m of moments) {
      const ranked = rankedAt.get(m);
      const shown = (g === null ? ranked : ranked.filter(
        (c) => c.her >= g.herMin
          || (c.kid && c.kid.share >= g.kidShare && c.kid.total >= g.kidMin),
      )).slice(0, 4);
      tiles += shown.length;
      if (!shown.length) empty++;
      const target = itemOf[m.target];
      if (shown.some((c) => c.kind === target.kind && c.id === target.id)) hits++;
      else if (ranked.slice(0, 4).some((c) => c.id === target.id)) {
        lost.push(`"${m.phrase.join(' ')}" -> ${m.target}`);
      }
      const bad = new Set(nonsenseOf(m.phrase));
      nonsense += shown.filter((c) => c.kind === 'sense' && bad.has(wordOf[c.id])).length;
    }
    console.log(`  ${name.padEnd(28)} hits ${hits}/20  nonsense ${nonsense}  empty bars ${empty}  tiles ${tiles}${lost.length ? `  LOST: ${lost.join('; ')}` : ''}`);
  }
}
