// Smart bar v2 — 20 real bar rows. Drives the app's own call path
// (stripRanked -> logImpression -> stampShownFinal -> fillChosen ->
// closeSentence) on a real in-memory database with the real catalog and
// the shipped children table, seeded with 20 days of Ava's history,
// then reads the stored strip_impression rows back the way a person
// would: phrase -> tiles shown -> what was tapped.
//
//   node scripts/prediction/phrase_jev/real_rows_v2.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, importCatalog } from '../../../src/board/catalog.mjs';
import { addPersonalEntity } from '../../../src/board/entities.mjs';
import {
  openSentence, closeSentence, logSelection, stripRanked,
  logImpression, stampShownFinal, fillChosen, replayImpression,
} from '../../../public/shared/funnel.mjs';
import catalog from '../../../data/catalog/catalog.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, '../../..');
const kids = JSON.parse(readFileSync(path.join(REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));
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

const db = createDatabase(':memory:');
importCatalog(db, catalog);
const itemOf = {};
const wordOf = {};
for (const w of WORDS.sort()) {
  const sid = lemmaSense.get(w);
  itemOf[w] = sid
    ? { kind: 'sense', id: sid }
    : { kind: 'entity', id: addPersonalEntity(db, { spokenName: w }).id };
  wordOf[itemOf[w].id] = w;
}
const lemmaOf = (id) => db.prepare(
  `SELECT text AS t FROM label
   WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
).all(id)[0]?.t;
const label = (kind, id) =>
  kind === 'entity' ? `(${wordOf[id] ?? id})` : (wordOf[id] ?? lemmaOf(id) ?? id);

// 20 days of her history, then the test Monday driven through the app's
// paint-and-pick sequence: for each tap, rank -> impression -> stamp ->
// pick the real next word -> close spoken (trains history).
for (const e of LOG) {
  const at = ts(e);
  if (e.day !== LAST) {
    const s = openSentence(db, at);
    e.sent.forEach((w, i) => {
      const it = itemOf[w];
      logSelection(db, it.kind, it.id, at + i * 1000, { sentenceId: s, position: i });
    });
    closeSentence(db, s, at + e.sent.length * 1000, 'spoken');
    continue;
  }
  // Test day: the strip paints after every tap, like board.js.
  const s = openSentence(db, at);
  e.sent.forEach((w, i) => {
    const phrase = e.sent.slice(0, i).map((x) => itemOf[x]);
    const { ranked, shown, ending } = stripRanked(db, phrase, at + i * 1000, 'en', kids);
    const imp = logImpression(db, {
      sentenceId: s, position: i, shownAt: at + i * 1000,
      candidates: ranked, shown: shown.map((c) => `${c.kind}:${c.id}`),
      gate: { ending }, shortlistCap: 4,
    });
    stampShownFinal(db, imp, shown.map((c) => `${c.kind}:${c.id}`));
    const it = itemOf[w];
    fillChosen(db, s, { kind: it.kind, id: it.id, source: shown.some((c) => c.id === it.id) ? 'strip' : 'grid' });
    logSelection(db, it.kind, it.id, at + i * 1000 + 500, { sentenceId: s, position: i });
  });
  closeSentence(db, s, at + e.sent.length * 1000, 'spoken');
}

// Read the stored rows back: phrase, tiles, tap, replay check.
const rows = db.prepare(
  `SELECT i.id, i.sentence_id, i.position, i.candidates, i.shown_local, i.shown_final,
          i.chosen_kind, i.chosen_id, i.chosen_source, i.weight_set, i.mode, i.gate, i.shortlist_cap
   FROM strip_impression i JOIN sentence s ON s.id = i.sentence_id
   WHERE s.started_at >= ? ORDER BY i.id LIMIT 20`,
).all(BASE);

console.log(`${'phrase'.padEnd(26)} ${'tiles'.padEnd(44)} tapped  hit  replay`);
let hits = 0, replayOk = 0;
for (const r of rows) {
  const phrase = db.prepare(
    `SELECT item_kind AS k, item_id AS i FROM learner_event_log
     WHERE sentence_id = ? AND position < ? ORDER BY position`,
  ).all(r.sentence_id, r.position);
  const phraseText = phrase.length ? phrase.map((p) => label(p.k, p.i)).join(' ') : '(start)';
  const tiles = JSON.parse(r.shown_final ?? r.shown_local)
    .map((k) => { const [kind, id] = k.split(':'); return label(kind, id); });
  const tapped = label(r.chosen_kind, r.chosen_id);
  const hit = JSON.parse(r.shown_final ?? r.shown_local).includes(`${r.chosen_kind}:${r.chosen_id}`);
  if (hit) hits++;
  const rep = replayImpression(r);
  if (rep.ok) replayOk++;
  console.log(
    `${phraseText.padEnd(26).slice(0, 26)} ${tiles.join(', ').padEnd(44).slice(0, 44)} ${tapped.padEnd(7)} ${hit ? 'HIT ' : '    '} ${rep.ok ? 'ok' : 'DIFF ' + rep.diffs.join(';')}`,
  );
}
console.log(`\n${rows.length} rows: ${hits} strip hits, ${replayOk} replay-consistent impressions`);
