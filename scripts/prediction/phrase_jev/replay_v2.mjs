// Smart bar v2 reference replay: run the app's real ranking
// (public/shared/funnel.mjs stripRanked) on ava_log.json and compare
// against the reference "filter" numbers from today's JEV tests.
//
// Test day = the last Monday (day 21, 47 word-moments). For each
// history length the system is fresh: only sentences on days >= 21-H
// exist, replayed in time order through the real logSelection +
// closeSentence path so phrase_count is built the way the app builds
// it. No gate (the reference filter has none): hit = target among the
// top 4 merged candidates.
//
// Words are mapped the way the app maps them: catalog lemmas become
// sense ids; anything else (names, inflected forms) becomes a personal
// entity — the children table can never offer those, exactly as on
// device. Moments whose target is such an entity can only be hit from
// her own history.
//
//   node scripts/prediction/phrase_jev/replay_v2.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, importCatalog } from '../../../src/board/catalog.mjs';
import { addPersonalEntity } from '../../../src/board/entities.mjs';
import {
  openSentence, closeSentence, logSelection, stripRanked,
} from '../../../public/shared/funnel.mjs';
import catalog from '../../../data/catalog/catalog.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, '../../..');
const kids = JSON.parse(readFileSync(path.join(REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));
const LOG = JSON.parse(readFileSync(path.join(HERE, 'ava_log.json'), 'utf8'));
const TEST_DAY = Math.max(...LOG.map((e) => e.day));
const BASE = Date.parse('2026-09-21T00:00:00'); // local Monday; only minute-of-day matters
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const ts = (e) => BASE + (e.day - TEST_DAY) * 86400000 + minutes(e.at) * 60000;

const lemmaSense = new Map();
for (const l of catalog.labels) {
  if (l.kind === 'lemma' && l.status === 'approved' && l.locale === 'en' && !lemmaSense.has(l.normalized_text)) {
    lemmaSense.set(l.normalized_text, l.sense_id);
  }
}
const WORDS = [...new Set(LOG.flatMap((e) => e.sentence.toLowerCase().split(' ')))];

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

const results = {};
for (const HIST of [0, 1, 3, 7, 20]) {
  const { db, itemOf } = freshDb();
  for (const e of LOG) {
    if (e.day !== TEST_DAY && e.day >= TEST_DAY - HIST) say(db, itemOf, e.sentence.toLowerCase().split(' '), ts(e));
  }
  const rows = [];
  for (const e of LOG.filter((x) => x.day === TEST_DAY)) {
    const sent = e.sentence.toLowerCase().split(' ');
    for (let j = 0; j < sent.length; j++) {
      const phrase = sent.slice(0, j).map((w) => itemOf[w]);
      const { ranked } = stripRanked(db, phrase, ts(e) + j * 1000, 'en', kids);
      const top4 = ranked.slice(0, 4);
      const target = itemOf[sent[j]];
      rows.push({
        sentence: e.sentence, at: e.at,
        phrase: sent.slice(0, j).join(' '), target: sent[j],
        targetKind: target.kind,
        top4: top4.map((c) => c.id),
        hit: top4.some((c) => c.kind === target.kind && c.id === target.id),
      });
    }
    // The just-said sentence is history for later moments, as in the app.
    say(db, itemOf, sent, ts(e));
  }
  const hits = rows.filter((r) => r.hit).length;
  results[HIST] = { hits, of: rows.length };
  console.log(`history ${String(HIST).padStart(2)} days: ${hits} / ${rows.length} in top 4`);
}

const REF = { 0: 29, 1: 36, 3: 37, 7: 40, 20: 43 };
console.log('\nreference filter:', Object.entries(REF).map(([h, n]) => `${h}d ${n}`).join(', '));
for (const [h, ref] of Object.entries(REF)) {
  const got = results[h].hits;
  const d = got - ref;
  console.log(`  hist ${h}: v2 ${got} vs ref ${ref}  (${d >= 0 ? '+' : ''}${d})${Math.abs(d) > 1 ? '  <- >1: differing rows need explaining' : ''}`);
}
