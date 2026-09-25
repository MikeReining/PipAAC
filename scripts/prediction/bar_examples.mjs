// Smart bar — founder-reviewed examples (the only proof for now).
// For each row: fresh in-memory db + real catalog, speak each history
// sentence through the real path (openSentence -> logSelection ->
// closeSentence 'spoken'), then call the real stripRanked with the
// shipped children table. Expected bars come from a separate
// implementation over the raw transcripts — matching means two
// independent implementations agree, not the code grading itself.
// Not wired into npm run check; the bar is still iterating.
//
//   node scripts/prediction/bar_examples.mjs   (exit 1 on any DIFF)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, importCatalog } from '../../src/board/catalog.mjs';
import {
  openSentence, closeSentence, logSelection, stripRanked,
} from '../../public/shared/funnel.mjs';
import catalog from '../../data/catalog/catalog.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, '../..');
const kids = JSON.parse(
  readFileSync(path.join(REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));
const rows = JSON.parse(readFileSync(path.join(HERE, 'bar_examples.json'), 'utf8'));

const lemmaSense = new Map();
for (const l of catalog.labels) {
  if (l.kind === 'lemma' && l.status === 'approved' && l.locale === 'en'
      && !lemmaSense.has(l.normalized_text)) {
    lemmaSense.set(l.normalized_text, l.sense_id);
  }
}
const lemmaOf = new Map([...lemmaSense].map(([k, v]) => [v, k]));
const S = (w) => {
  const id = lemmaSense.get(w);
  if (!id) throw new Error(`no catalog lemma for "${w}"`);
  return { kind: 'sense', id };
};

const NOW = Date.parse('2026-09-24T08:20:00');
const TODDLER = [
  ['want', 'milk'], ['want', 'milk'], ['more', 'milk'],
  ['mom', 'up'], ['want', 'up'], ['all done'],
];
const speak = (db, words, at) => {
  const s = openSentence(db, at);
  words.forEach((w, i) =>
    logSelection(db, 'sense', S(w).id, at + i, { sentenceId: s, position: i }));
  closeSentence(db, s, at + words.length, 'spoken');
};

let diffs = 0;
console.log(`${'history'.padEnd(34)} ${'phrase'.padEnd(18)} ${'expected'.padEnd(30)} ${'actual'.padEnd(30)} ending  verdict`);
for (const row of rows) {
  const db = createDatabase(':memory:');
  importCatalog(db, catalog);
  const hist = row.history === 'toddler' ? TODDLER : row.history;
  hist.forEach((sent, i) => speak(db, sent, NOW - 86400000 + i * 60000));
  const { shown, ending } = stripRanked(db, row.phrase.map(S), NOW, 'en', kids);
  const actual = shown.map((c) => lemmaOf.get(c.id) ?? c.id);
  const sameSet =
    actual.length === row.expected.length
    && new Set(actual).size === actual.length
    && actual.every((w) => row.expected.includes(w));
  const ok = sameSet; // tile SET must match; order may differ only on equal counts
  if (!ok) {
    diffs++;
    // Report the raw evidence for each ending of this phrase.
    const items = row.phrase.map(S);
    for (let s = 0; s < items.length; s++) {
      const e = items.slice(s);
      const key = e.map((c) => `${c.kind}:${c.id}`).join(' ');
      const her = db.prepare(
        'SELECT item_id AS id, n FROM phrase_count WHERE ctx = ?').all(key);
      const kidKey = e.every((c) => c.kind === 'sense')
        ? e.map((c) => c.id).join(' ') : null;
      const kid = kidKey != null ? kids.contexts[kidKey] : null;
      const kidSeen = kidKey != null ? kids.seen?.[kidKey] : null;
      console.log(`    ending ${JSON.stringify(row.phrase.slice(s))}: her=${JSON.stringify(her.map((r) => [lemmaOf.get(r.id) ?? r.id, r.n]))} kids=${kid ? JSON.stringify(Object.fromEntries(Object.entries(kid).map(([id, n]) => [lemmaOf.get(id) ?? id, n, n / kidSeen]))) : 'none'} seen=${kidSeen}`);
    }
  }
  const h = row.history === 'toddler' ? 'toddler (6 sents)' : (hist.length ? hist.map((x) => x.join(' ')).join('; ') : 'none');
  console.log(
    `${h.padEnd(34).slice(0, 34)} ${row.phrase.join(' ').padEnd(18).slice(0, 18)} ` +
    `${row.expected.join(', ').padEnd(30).slice(0, 30)} ${actual.join(', ').padEnd(30).slice(0, 30)} ` +
    `${String(ending).padEnd(6)} ${ok ? 'OK' : 'DIFF'}`,
  );
}
process.exit(diffs ? 1 : 0);
